import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import gsap from 'gsap'
import { useStore } from '@/src/store'
import { getCartonColor } from '@/src/lib/colors'
import { buildContainerWorldMap } from './ContainerManager'
import { timelineRef } from '@/src/lib/animationState'
import type { Placement } from '@/src/store/packingSlice'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlatPlacement extends Placement {
  worldX: number
  containerLength: number  // container.d — Z-axis depth (589/1203cm); used for entry animation
  globalIndex: number      // position in overall animation sequence (deepest = 0)
}

interface CartonGroup {
  key: string    // "${cartonId}_${w}x${h}x${d}" — unique per carton type + orientation
  cartonId: string
  w: number
  h: number
  d: number
  color: string
  placements: FlatPlacement[]
}

// Mutable object GSAP writes into every frame; read by useFrame in each group.
interface AnimState { progress: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function worldCenter(p: FlatPlacement) {
  return {
    x: p.worldX + p.x + p.w / 2,
    y: p.y + p.h / 2,
    z: p.z + p.d / 2,
  }
}

// ─── CartonTypeInstances ──────────────────────────────────────────────────────

interface CartonGroupProps {
  group: CartonGroup
  animState: { current: AnimState }
}

function CartonTypeInstances({ group, animState }: CartonGroupProps) {
  const meshRef  = useRef<THREE.InstancedMesh>(null)
  const linesRef = useRef<THREE.LineSegments>(null)
  const dummy    = useMemo(() => new THREE.Object3D(), [])
  const prevProgress = useRef(-1)

  // Merged edge geometry — all instance outlines in one draw call.
  // Built at final world positions; shown only after each instance is fully placed.
  const edgeGeo = useMemo(() => {
    const cartonGeo = new THREE.BoxGeometry(group.w, group.h, group.d)
    const edgesGeo  = new THREE.EdgesGeometry(cartonGeo)
    cartonGeo.dispose()
    const base   = edgesGeo.attributes.position.array as Float32Array
    const merged = new Float32Array(group.placements.length * base.length)
    group.placements.forEach((p, i) => {
      const { x, y, z } = worldCenter(p)
      const offset = i * base.length
      for (let j = 0; j < base.length; j += 3) {
        merged[offset + j]     = base[j]     + x
        merged[offset + j + 1] = base[j + 1] + y
        merged[offset + j + 2] = base[j + 2] + z
      }
    })
    edgesGeo.dispose()
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(merged, 3))
    return geo
  }, [group])

  useEffect(() => () => edgeGeo.dispose(), [edgeGeo])

  const lastGlobalIndex = group.placements[group.placements.length - 1]?.globalIndex ?? 0

  useFrame(() => {
    if (!meshRef.current) return

    const progress = animState.current.progress

    // Skip matrix writes when nothing has changed — avoids GPU upload every frame
    // once the animation is complete and paused.
    if (progress === prevProgress.current) return
    prevProgress.current = progress

    group.placements.forEach((p, instanceIdx) => {
      const { x, y, z: finalZ } = worldCenter(p)
      const gi = p.globalIndex
      // Door is at world Z = containerLength. Cartons enter 50cm outside the door face.
      const entryZ = p.containerLength + 50

      if (progress <= gi) {
        // Not yet in sequence — hidden at entry point
        dummy.scale.set(0, 0, 0)
        dummy.position.set(x, y, entryZ)
      } else if (progress >= gi + 1) {
        // Fully placed — static
        dummy.scale.set(1, 1, 1)
        dummy.position.set(x, y, finalZ)
      } else {
        // Sliding in: t goes 0 → 1 within this carton's animation window
        const t = progress - gi
        // ease-out: decelerates as the carton approaches final position
        const eased = 1 - Math.pow(1 - t, 2)
        dummy.scale.set(1, 1, 1)
        dummy.position.set(x, y, entryZ + (finalZ - entryZ) * eased)
      }

      dummy.updateMatrix()
      meshRef.current!.setMatrixAt(instanceIdx, dummy.matrix)
    })

    meshRef.current.instanceMatrix.needsUpdate = true

    // Show edges only after all instances in this group are fully placed
    if (linesRef.current) {
      linesRef.current.visible = progress >= lastGlobalIndex + 1
    }
  })

  return (
    <>
      <instancedMesh ref={meshRef} args={[undefined, undefined, group.placements.length]}>
        <boxGeometry args={[group.w, group.h, group.d]} />
        <meshStandardMaterial color={group.color} opacity={0.85} transparent side={THREE.DoubleSide} />
      </instancedMesh>
      <lineSegments ref={linesRef} geometry={edgeGeo} visible={false}>
        <lineBasicMaterial color="#ffffff" opacity={0.55} transparent />
      </lineSegments>
    </>
  )
}

// ─── InstancedCartons ─────────────────────────────────────────────────────────

export function InstancedCartons() {
  const packingResult = useStore((s) => s.packingResult)
  const cartons       = useStore((s) => s.cartons)
  const containers    = useStore((s) => s.containers)
  const playing       = useStore((s) => s.playing)
  const speed         = useStore((s) => s.speed)
  const setProgress   = useStore((s) => s.setProgress)
  const setPlaying    = useStore((s) => s.setPlaying)

  const animState = useRef<AnimState>({ progress: 0 })

  // ── Build groups ────────────────────────────────────────────────────────────

  const groups = useMemo<CartonGroup[]>(() => {
    if (!packingResult) return []

    const containerMap = buildContainerWorldMap(containers)

    // Flatten placements across all containers, assigning a sequential globalIndex.
    // packingResult placements are already sorted deepest-first, so globalIndex
    // directly encodes the correct back-to-front animation order.
    let globalIndex = 0
    const flat: FlatPlacement[] = []
    for (const result of packingResult) {
      const info = containerMap.get(result.containerId)
      if (!info) continue
      for (const p of result.placements) {
        flat.push({ ...p, worldX: info.worldX, containerLength: info.containerLength, globalIndex: globalIndex++ })
      }
    }

    // Group by cartonId + placed dimensions (rotation-safe key)
    const groupMap = new Map<string, FlatPlacement[]>()
    for (const p of flat) {
      const groupKey = `${p.cartonId}_${p.w}x${p.h}x${p.d}`
      const arr = groupMap.get(groupKey)
      if (arr) arr.push(p)
      else groupMap.set(groupKey, [p])
    }

    const cartonById = new Map(cartons.map((c) => [c.id, c]))
    const result: CartonGroup[] = []
    for (const [groupKey, placements] of groupMap) {
      const first = placements[0]
      const carton = cartonById.get(first.cartonId)
      result.push({
        key:      groupKey,
        cartonId: first.cartonId,
        w:        first.w,
        h:        first.h,
        d:        first.d,
        color:    getCartonColor(carton?.colorIndex ?? 0),
        placements,
      })
    }
    return result
  }, [packingResult, cartons, containers])

  const totalCount = useMemo(
    () => groups.reduce((s, g) => s + g.placements.length, 0),
    [groups],
  )

  // ── GSAP timeline ───────────────────────────────────────────────────────────

  // Recreate timeline on every new pack result. 0.4s per carton at 1× speed.
  useEffect(() => {
    if (totalCount === 0) return
    animState.current.progress = 0

    const tl = gsap.timeline({
      paused: true,
      onUpdate:  () => setProgress(tl.progress()),
      onComplete: () => setPlaying(false),
    })

    tl.to(animState.current, {
      progress: totalCount,
      duration: totalCount * 0.4,
      ease: 'none',
    })

    timelineRef.current = tl
    setProgress(0)
    tl.play()
    setPlaying(true)

    return () => {
      tl.kill()
      timelineRef.current = null
    }
  }, [packingResult, totalCount, setProgress, setPlaying])

  // Sync play / pause
  useEffect(() => {
    const tl = timelineRef.current
    if (!tl) return
    if (playing) tl.play()
    else tl.pause()
  }, [playing])

  // Sync speed
  useEffect(() => {
    const tl = timelineRef.current
    if (!tl) return
    tl.timeScale(speed)
  }, [speed])

  if (!packingResult) return null

  return (
    <>
      {groups.map((group) => (
        <CartonTypeInstances key={group.key} group={group} animState={animState} />
      ))}
    </>
  )
}

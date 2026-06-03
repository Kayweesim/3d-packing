import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import gsap from 'gsap'
import { useStore } from '@/src/store'
import { getBoxColor } from '@/src/lib/colors'
import { CONTAINER_GAP_CM } from './ContainerManager'
import { timelineRef } from '@/src/lib/animationState'
import type { Placement } from '@/src/store/packingSlice'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlatPlacement extends Placement {
  worldX: number
  containerLength: number  // container.d — the Z-axis depth (589/1203cm); used for entry animation
  globalIndex: number      // position in overall animation sequence (deepest = 0)
}

interface BoxGroup {
  key: string    // "${boxId}_${w}x${h}x${d}" — unique per box type + orientation
  boxId: string  // original box id, used for color lookup only
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
    // packer x (0..container.w=235) maps to world X offset from worldX
    x: p.worldX + p.x + p.w / 2,
    y: p.y + p.h / 2,
    // packer z (0..container.d=589) maps directly to world Z (back wall = Z=0, door = Z=d)
    z: p.z + p.d / 2,
  }
}

// ─── BoxTypeInstances ─────────────────────────────────────────────────────────

interface GroupProps {
  group: BoxGroup
  animState: { current: AnimState }
}

function BoxTypeInstances({ group, animState }: GroupProps) {
  const meshRef  = useRef<THREE.InstancedMesh>(null)
  const linesRef = useRef<THREE.LineSegments>(null)
  const dummy    = useMemo(() => new THREE.Object3D(), [])
  const prevProgress = useRef(-1)

  // Merged edge geometry — all instance outlines in one draw call.
  // Built at final world positions; shown only after each instance is fully placed.
  const edgeGeo = useMemo(() => {
    const boxGeo  = new THREE.BoxGeometry(group.w, group.h, group.d)
    const edgesGeo = new THREE.EdgesGeometry(boxGeo)
    boxGeo.dispose()
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
      // Door is at world Z = containerLength. Boxes enter 50cm outside the door face.
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
        // Sliding in: t goes 0 → 1 within this box's animation window
        const t = progress - gi
        // ease-out: decelerates as the box approaches final position
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

// ─── InstancedBoxes ───────────────────────────────────────────────────────────

export function InstancedBoxes() {
  const packingResult = useStore((s) => s.packingResult)
  const boxes         = useStore((s) => s.boxes)
  const containers    = useStore((s) => s.containers)
  const playing       = useStore((s) => s.playing)
  const speed         = useStore((s) => s.speed)
  const setProgress   = useStore((s) => s.setProgress)
  const setPlaying    = useStore((s) => s.setPlaying)

  const animState = useRef<AnimState>({ progress: 0 })

  // ── Build groups ────────────────────────────────────────────────────────────

  const groups = useMemo<BoxGroup[]>(() => {
    if (!packingResult) return []

    let worldX = 0
    const containerMap = new Map<string, { worldX: number; containerLength: number }>()
    containers.forEach((c) => {
      // c.w = cross-section width (X span); c.d = container depth (Z span, packing depth)
      containerMap.set(c.id, { worldX, containerLength: c.d })
      worldX += c.w + CONTAINER_GAP_CM
    })

    // Flatten placements across all containers, assigning a sequential globalIndex.
    // packingResult placements are already sorted deepest-first (Phase 6b), so
    // globalIndex directly encodes the correct back-to-front animation order.
    let globalIndex = 0
    const flat: FlatPlacement[] = []
    for (const result of packingResult) {
      const info = containerMap.get(result.containerId)
      if (!info) continue
      for (const p of result.placements) {
        flat.push({ ...p, worldX: info.worldX, containerLength: info.containerLength, globalIndex: globalIndex++ })
      }
    }

    // Group by boxId + placed dimensions (rotation-safe)
    const groupMap = new Map<string, FlatPlacement[]>()
    for (const p of flat) {
      const groupKey = `${p.boxId}_${p.w}x${p.h}x${p.d}`
      const arr = groupMap.get(groupKey)
      if (arr) arr.push(p)
      else groupMap.set(groupKey, [p])
    }

    const boxById = new Map(boxes.map((b) => [b.id, b]))
    const result: BoxGroup[] = []
    for (const [groupKey, placements] of groupMap) {
      const first = placements[0]
      const box = boxById.get(first.boxId)
      result.push({
        key:      groupKey,
        boxId:    first.boxId,
        w:        first.w,
        h:        first.h,
        d:        first.d,
        color:    getBoxColor(box?.colorIndex ?? 0),
        placements,
      })
    }
    return result
  }, [packingResult, boxes, containers])

  const totalCount = useMemo(
    () => groups.reduce((s, g) => s + g.placements.length, 0),
    [groups],
  )

  // ── GSAP timeline ───────────────────────────────────────────────────────────

  // Recreate timeline on every new pack result. 0.4 s per box at 1× speed.
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
        <BoxTypeInstances key={group.key} group={group} animState={animState} />
      ))}
    </>
  )
}

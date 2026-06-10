import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
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
  rotated: boolean  // true when placed dims differ from the carton's original dims
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

// Lerp a hex color toward white by `amount` (0 = original, 1 = white).
function lightenColor(hex: string, amount = 0.45): string {
  const c = new THREE.Color(hex).lerp(new THREE.Color(1, 1, 1), amount)
  return `#${c.getHexString()}`
}

function CartonTypeInstances({ group, animState }: CartonGroupProps) {
  const meshRef  = useRef<THREE.InstancedMesh>(null)
  const topRef   = useRef<THREE.InstancedMesh>(null)
  const linesRef = useRef<THREE.LineSegments>(null)
  const textsRef = useRef<(THREE.Mesh | null)[]>([])
  const dummy      = useMemo(() => new THREE.Object3D(), [])
  // Pre-rotated dummy for the top-face plane — PlaneGeometry faces +Z, rotate to face +Y.
  const dummyPlane = useMemo(() => {
    const obj = new THREE.Object3D()
    obj.rotation.x = -Math.PI / 2
    return obj
  }, [])
  const prevProgress = useRef(-1)

  const lightColor = useMemo(() => lightenColor(group.color), [group.color])

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
        dummy.scale.set(0, 0, 0)
        dummy.position.set(x, y, entryZ)
      } else if (progress >= gi + 1) {
        dummy.scale.set(1, 1, 1)
        dummy.position.set(x, y, finalZ)
      } else {
        const t = progress - gi
        const eased = 1 - Math.pow(1 - t, 2)
        dummy.scale.set(1, 1, 1)
        dummy.position.set(x, y, entryZ + (finalZ - entryZ) * eased)
      }

      dummy.updateMatrix()
      meshRef.current!.setMatrixAt(instanceIdx, dummy.matrix)

      // Top-face plane — flush on top of the carton (y + h/2 + tiny offset to avoid z-fight)
      if (topRef.current) {
        const topY = y + p.h / 2 + 0.5
        if (progress <= gi) {
          dummyPlane.scale.set(0, 0, 0)
          dummyPlane.position.set(x, topY, entryZ)
        } else if (progress >= gi + 1) {
          dummyPlane.scale.set(1, 1, 1)
          dummyPlane.position.set(x, topY, finalZ)
        } else {
          const t = progress - gi
          const eased = 1 - Math.pow(1 - t, 2)
          dummyPlane.scale.set(1, 1, 1)
          dummyPlane.position.set(x, topY, entryZ + (finalZ - entryZ) * eased)
        }
        dummyPlane.updateMatrix()
        topRef.current.setMatrixAt(instanceIdx, dummyPlane.matrix)
      }

      // Sequence number appears once the carton has fully landed
      const label = textsRef.current[instanceIdx]
      if (label) label.visible = progress >= gi + 1
    })

    meshRef.current.instanceMatrix.needsUpdate = true
    if (topRef.current) topRef.current.instanceMatrix.needsUpdate = true

    // Show edges only after all instances in this group are fully placed
    if (linesRef.current) {
      linesRef.current.visible = progress >= lastGlobalIndex + 1
    }
  })

  return (
    <>
      <instancedMesh ref={meshRef} args={[undefined, undefined, group.placements.length]} frustumCulled={false}>
        <boxGeometry args={[group.w, group.h, group.d]} />
        <meshStandardMaterial color={group.color} emissive={group.color} emissiveIntensity={0.25} opacity={0.85} transparent side={THREE.DoubleSide} />
      </instancedMesh>
      {group.rotated && (
        <instancedMesh ref={topRef} args={[undefined, undefined, group.placements.length]} frustumCulled={false}>
          <planeGeometry args={[group.w * 0.88, group.d * 0.88]} />
          <meshStandardMaterial color={lightColor} emissive={lightColor} emissiveIntensity={0.3} opacity={0.9} transparent side={THREE.DoubleSide} />
        </instancedMesh>
      )}
      <lineSegments ref={linesRef} geometry={edgeGeo} visible={false}>
        <lineBasicMaterial color="#ffffff" opacity={0.55} transparent />
      </lineSegments>
      {group.placements.map((p, i) => {
        const { x, y, z } = worldCenter(p)
        return (
          <Text
            key={p.globalIndex}
            ref={(el) => { textsRef.current[i] = el }}
            position={[x, y + p.h / 2 + (group.rotated ? 1.2 : 0.6), z]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={Math.min(group.w, group.d) * 0.4}
            color="#111111"
            anchorX="center"
            anchorY="middle"
            visible={false}
          >
            {`${p.globalIndex + 1}`}
          </Text>
        )
      })}
    </>
  )
}



// ─── InstancedCartons ─────────────────────────────────────────────────────────

export function InstancedCartons() {
  const packingResult = useStore((s) => s.packingResult)
  const pallets       = useStore((s) => s.pallets)
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

    // Pallet-level color map: cartonId → palletIndex (matches colorIndex assigned in runPacker)
    const cartonColorMap = new Map<string, number>()
    pallets.forEach((pallet, i) => pallet.cartons.forEach((c) => cartonColorMap.set(c.id, i)))

    // Original dims map: cartonId → { w, h, d } before any rotation
    const originalDims = new Map<string, { w: number; h: number; d: number }>()
    pallets.forEach((pallet) => pallet.cartons.forEach((c) => originalDims.set(c.id, { w: c.w, h: c.h, d: c.d })))

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

    const result: CartonGroup[] = []
    for (const [groupKey, placements] of groupMap) {
      const first = placements[0]
      const orig = originalDims.get(first.cartonId)
      const rotated = orig != null && (first.w !== orig.w || first.h !== orig.h || first.d !== orig.d)
      result.push({
        key:      groupKey,
        cartonId: first.cartonId,
        w:        first.w,
        h:        first.h,
        d:        first.d,
        color:    getCartonColor(cartonColorMap.get(first.cartonId) ?? 0),
        rotated,
        placements,
      })
    }
    return result
  }, [packingResult, pallets, containers])

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

/**
 * PalletInstancedCartons.tsx — packed cartons for pallet mode, as InstancedMesh
 * groups with a GSAP timeline that drops them in one-by-one from above.
 *
 * Exports: PalletInstancedCartons.
 * Fork of InstancedCartons (container mode): the single-pallet placement list is
 * replicated across each pallet's worldX (the last pallet truncated to
 * lastPalletCount), grouped by placed dims into InstancedMesh draw calls. Cartons
 * animate bottom-up (placements are built bottom layer first) dropping along Y,
 * rather than sliding through a container door. Shares timelineRef so the same
 * playback plumbing applies.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'
import { useStore } from '@/src/store'
import { getCartonColor } from '@/src/lib/colors'
import { buildArrowGeo } from '@/src/lib/cartonShapes'
import { timelineRef } from '@/src/lib/animationState'
import { buildPalletWorldMap } from './PalletManager'
import type { PalletPlacement } from '@/src/lib/palletApi'

const DROP_HEIGHT_CM     = 60   // cartons start this far above the max-load envelope
const SECONDS_PER_CARTON = 0.4  // GSAP timeline duration per carton at 1× speed
const CARTON_COLOR_INDEX = 1    // blue — matches the pallet-mode theme

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlatPlacement extends PalletPlacement {
  worldX: number
  entryY: number       // Y the carton drops from (constant per pallet)
  globalIndex: number  // position in overall animation sequence
}

interface CartonGroup {
  key: string          // "${w}x${h}x${d}" — one InstancedMesh per placed orientation
  w: number
  h: number
  d: number
  placements: FlatPlacement[]
}

interface AnimState { progress: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function worldCenter(p: FlatPlacement) {
  return {
    x: p.worldX + p.x + p.w / 2,
    y: p.y + p.h / 2,
    z: p.z + p.d / 2,
  }
}

/**
 * Writes a drop-in pose into `obj` for the given progress. Before `gi` the object
 * is hidden (scale 0) at the entry height; between `gi` and `gi+1` it eases down
 * from `fromY` to `toY` (ease-out quad); after `gi+1` it rests at `toY`.
 */
function setDropPose(
  obj: THREE.Object3D,
  gi: number,
  progress: number,
  x: number,
  z: number,
  fromY: number,
  toY: number,
): void {
  if (progress <= gi) {
    obj.scale.set(0, 0, 0)
    obj.position.set(x, fromY, z)
  } else if (progress >= gi + 1) {
    obj.scale.set(1, 1, 1)
    obj.position.set(x, toY, z)
  } else {
    const t = progress - gi
    const eased = 1 - Math.pow(1 - t, 2)
    obj.scale.set(1, 1, 1)
    obj.position.set(x, fromY + (toY - fromY) * eased, z)
  }
  obj.updateMatrix()
}

// ─── CartonTypeInstances ──────────────────────────────────────────────────────

interface CartonGroupProps {
  group: CartonGroup
  color: string
  animState: { current: AnimState }
}

function CartonTypeInstances({ group, color, animState }: CartonGroupProps) {
  const meshRef  = useRef<THREE.InstancedMesh>(null)
  const linesRef = useRef<THREE.LineSegments>(null)
  const arrowRef = useRef<THREE.InstancedMesh>(null)
  const textsRef = useRef<(THREE.Mesh | null)[]>([])
  const dummy    = useMemo(() => new THREE.Object3D(), [])
  const prevProgress = useRef(-1)

  // "This way up" arrow — cartons are never tipped in pallet mode, so up is always
  // world +Y and the arrows lie on the four vertical side faces pointing up. Each
  // face bakes its orientation into a dummy (local +Z = outward normal, local +Y =
  // up) so the per-frame pose writer only needs to set position/scale.
  const arrowGeo = useMemo(
    () => buildArrowGeo(Math.min(group.w, group.d), group.h),
    [group.w, group.h, group.d],
  )
  const arrowFaces = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0)
    const normals = [
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
    ]
    return normals.map((normal) => {
      const xAxis = new THREE.Vector3().crossVectors(up, normal)
      const m = new THREE.Matrix4().makeBasis(xAxis, up, normal)
      const d = new THREE.Object3D()
      d.quaternion.setFromRotationMatrix(m)
      return { normal, dummy: d }
    })
  }, [])
  useEffect(() => () => arrowGeo.dispose(), [arrowGeo])

  // Merged edge geometry — all instance outlines in one draw call. Boxes are laid
  // out group-order (= globalIndex ascending), so a draw range revealing the first
  // N boxes shows exactly the cartons that have landed (see useFrame). vertsPerBox
  // is the vertex count of one carton's edge outline.
  const { edgeGeo, vertsPerBox } = useMemo(() => {
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
    geo.setDrawRange(0, 0)  // nothing landed yet — revealed progressively below
    return { edgeGeo: geo, vertsPerBox: base.length / 3 }
  }, [group])

  useEffect(() => () => edgeGeo.dispose(), [edgeGeo])

  useFrame(() => {
    if (!meshRef.current) return
    const progress = animState.current.progress
    if (progress === prevProgress.current) return
    prevProgress.current = progress

    group.placements.forEach((p, instanceIdx) => {
      const { x, y: finalY, z } = worldCenter(p)
      const gi = p.globalIndex
      setDropPose(dummy, gi, progress, x, z, p.entryY, finalY)
      meshRef.current!.setMatrixAt(instanceIdx, dummy.matrix)

      const label = textsRef.current[instanceIdx]
      if (label) label.visible = progress >= gi + 1

      // Arrows drop with the carton — offset just off each side face.
      if (arrowRef.current) {
        arrowFaces.forEach((face, fi) => {
          const ox = face.normal.x * (p.w / 2 + 0.75)
          const oz = face.normal.z * (p.d / 2 + 0.75)
          setDropPose(face.dummy, gi, progress, x + ox, z + oz, p.entryY, finalY)
          arrowRef.current!.setMatrixAt(instanceIdx * arrowFaces.length + fi, face.dummy.matrix)
        })
      }
    })

    meshRef.current.instanceMatrix.needsUpdate = true
    if (arrowRef.current) arrowRef.current.instanceMatrix.needsUpdate = true

    // Reveal each carton's white outline the moment it lands. placements are in
    // globalIndex-ascending order, so the landed cartons are always a prefix —
    // extend the draw range to cover just those boxes.
    if (linesRef.current) {
      let landed = 0
      for (let k = 0; k < group.placements.length; k++) {
        if (progress >= group.placements[k].globalIndex + 1) landed = k + 1
        else break
      }
      edgeGeo.setDrawRange(0, landed * vertsPerBox)
      linesRef.current.visible = landed > 0
    }
  })

  return (
    <>
      <instancedMesh ref={meshRef} args={[undefined, undefined, group.placements.length]} frustumCulled={false}>
        <boxGeometry args={[group.w, group.h, group.d]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} opacity={0.85} transparent side={THREE.DoubleSide} />
      </instancedMesh>
      <lineSegments ref={linesRef} geometry={edgeGeo} visible={false}>
        <lineBasicMaterial color="#ffffff" opacity={0.55} transparent />
      </lineSegments>
      <instancedMesh ref={arrowRef} geometry={arrowGeo} args={[undefined, undefined, group.placements.length * arrowFaces.length]} frustumCulled={false}>
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} side={THREE.DoubleSide} />
      </instancedMesh>
      {group.placements.map((p, i) => {
        const { x, y, z } = worldCenter(p)
        return (
          <Text
            key={p.globalIndex}
            ref={(el) => { textsRef.current[i] = el }}
            position={[x, y + p.h / 2 + 1.0, z]}
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

// ─── PalletInstancedCartons ───────────────────────────────────────────────────

/** Root component: replicates the single-pallet layout across pallets, builds
 *  the InstancedMesh groups, and owns the drop-in GSAP timeline. */
export function PalletInstancedCartons() {
  const result      = useStore((s) => s.palletPackResult)
  const playing     = useStore((s) => s.playing)
  const speed       = useStore((s) => s.speed)
  const setProgress = useStore((s) => s.setProgress)
  const setPlaying  = useStore((s) => s.setPlaying)

  const animState = useRef<AnimState>({ progress: 0 })

  const color = useMemo(() => getCartonColor(CARTON_COLOR_INDEX), [])

  // ── Build groups ────────────────────────────────────────────────────────────
  const groups = useMemo<CartonGroup[]>(() => {
    if (!result || result.palletsNeeded <= 0) return []

    const worldXs = buildPalletWorldMap(result.palletsNeeded, result.pallet.Wp)
    const entryY  = result.pallet.deckH + result.pallet.maxHeight + DROP_HEIGHT_CM
    const perPallet = result.perPallet

    // Flatten: pallet-by-pallet, each pallet's placements already bottom-up.
    // The last pallet is truncated to lastPalletCount.
    let globalIndex = 0
    const flat: FlatPlacement[] = []
    worldXs.forEach((worldX, palletIdx) => {
      const isLast = palletIdx === result.palletsNeeded - 1
      const count  = isLast ? result.lastPalletCount : perPallet
      for (let i = 0; i < count && i < result.placements.length; i++) {
        const p = result.placements[i]
        flat.push({ ...p, worldX, entryY, globalIndex: globalIndex++ })
      }
    })

    // Group by placed dimensions (blocks may use different in-plane orientations).
    const groupMap = new Map<string, FlatPlacement[]>()
    for (const p of flat) {
      const key = `${p.w}x${p.h}x${p.d}`
      const arr = groupMap.get(key)
      if (arr) arr.push(p)
      else groupMap.set(key, [p])
    }

    return [...groupMap.entries()].map(([key, placements]) => ({
      key,
      w: placements[0].w,
      h: placements[0].h,
      d: placements[0].d,
      placements,
    }))
  }, [result])

  const totalCount = useMemo(
    () => groups.reduce((s, g) => s + g.placements.length, 0),
    [groups],
  )

  // ── GSAP timeline ───────────────────────────────────────────────────────────
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
      duration: totalCount * SECONDS_PER_CARTON,
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
  }, [result, totalCount, setProgress, setPlaying])

  // Sync play / pause + speed
  useEffect(() => {
    const tl = timelineRef.current
    if (!tl) return
    if (playing) tl.play()
    else tl.pause()
  }, [playing])

  useEffect(() => {
    const tl = timelineRef.current
    if (tl) tl.timeScale(speed)
  }, [speed])

  if (!result) return null

  return (
    <>
      {groups.map((group) => (
        <CartonTypeInstances key={group.key} group={group} color={color} animState={animState} />
      ))}
    </>
  )
}

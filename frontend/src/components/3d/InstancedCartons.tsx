/**
 * InstancedCartons.tsx — renders all packed cartons as InstancedMesh objects
 * with a GSAP timeline that slides them in one-by-one from outside the container door.
 *
 * Exports: InstancedCartons.
 * One CartonTypeInstances group per unique (cartonId × placed-dims) combination.
 * The GSAP timeline is stored in animationState.ts (module-level) so PlaybackControls
 * can control it without prop-drilling into the R3F canvas.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'
import { useStore } from '@/src/store'
import { getCartonColor, buildProductColorMap } from '@/src/lib/colors'
import { buildArrowGeo, lightenColor } from '@/src/lib/cartonShapes'
import { buildContainerWorldMap } from './ContainerManager'
import { timelineRef } from '@/src/lib/animationState'
import type { Placement } from '@/src/store/packingSlice'

const DOOR_ENTRY_OFFSET_CM = 50   // cartons start this far outside the door face before sliding in
const SECONDS_PER_CARTON   = 0.4  // GSAP timeline duration per carton at 1× speed
const TOP_PLANE_SCALE      = 0.88 // top-face indicator is 88% of the carton's W×D

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlatPlacement extends Placement {
  worldX: number
  containerLength: number  // container.d — Z-axis depth; used for entry animation
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
  origH: number     // original H dimension before any rotation — determines arrow direction
  palletLabel: string  // pallet ID rendered on the top face of every instance
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

/**
 * Writes an entry-slide pose into `obj` for the given animation progress.
 * Before `gi` the object is hidden (scale 0) at the entry position.
 * Between `gi` and `gi+1` it eases from `fromZ` to `toZ` (ease-out quad).
 * After `gi+1` it sits stationary at the final position.
 * Caller must call `instancedMesh.setMatrixAt(i, obj.matrix)` after this.
 */
function setEntryPose(
  obj: THREE.Object3D,
  gi: number,
  progress: number,
  x: number,
  y: number,
  fromZ: number,
  toZ: number,
): void {
  if (progress <= gi) {
    obj.scale.set(0, 0, 0)
    obj.position.set(x, y, fromZ)
  } else if (progress >= gi + 1) {
    obj.scale.set(1, 1, 1)
    obj.position.set(x, y, toZ)
  } else {
    const t = progress - gi
    const eased = 1 - Math.pow(1 - t, 2)
    obj.scale.set(1, 1, 1)
    obj.position.set(x, y, fromZ + (toZ - fromZ) * eased)
  }
  obj.updateMatrix()
}

// ─── CartonTypeInstances ──────────────────────────────────────────────────────

interface CartonGroupProps {
  group: CartonGroup
  animState: { current: AnimState }
}

function CartonTypeInstances({ group, animState }: CartonGroupProps) {
  const meshRef  = useRef<THREE.InstancedMesh>(null)
  const topRef   = useRef<THREE.InstancedMesh>(null)
  const linesRef = useRef<THREE.LineSegments>(null)
  const textsRef = useRef<(THREE.Mesh | null)[]>([])
  const palletTextsRef = useRef<(THREE.Mesh | null)[]>([])
  const arrowRef = useRef<THREE.InstancedMesh>(null)
  const dummy      = useMemo(() => new THREE.Object3D(), [])
  // Pre-rotated dummy for the top-face plane — PlaneGeometry faces +Z, rotate to face +Y.
  const dummyPlane = useMemo(() => {
    const obj = new THREE.Object3D()
    obj.rotation.x = -Math.PI / 2
    return obj
  }, [])
  // "This way up" arrows — one per carton face that can display the direction.
  // The original top points along whichever placed axis the original H landed
  // on (dims-only — the sign is unknowable after packing, so it's drawn
  // positive). A flat arrow can only lie on faces whose normal is
  // perpendicular to that axis; the bottom face is skipped (never visible).
  //   h === origH → up is world Y → arrows on ±X and ±Z faces
  //   w === origH → up is world X → arrows on ±Z and top faces
  //   d === origH → up is world Z → arrows on ±X and top faces (previously hidden)
  const arrowFaces = useMemo(() => {
    const up =
      group.h === group.origH ? new THREE.Vector3(0, 1, 0)
      : group.w === group.origH ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 0, 1)
    const normals = [
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
    ]
    return normals
      .filter((n) => Math.abs(n.dot(up)) < 0.5) // arrow must lie in the face plane
      .map((normal) => {
        // Basis: local +Z = face normal (outward), local +Y = arrow direction.
        const xAxis = new THREE.Vector3().crossVectors(up, normal)
        const m = new THREE.Matrix4().makeBasis(xAxis, up, normal)
        // Bake the rotation into a per-face dummy so setEntryPose (which only
        // writes position/scale) preserves the orientation through updateMatrix().
        const dummy = new THREE.Object3D()
        dummy.quaternion.setFromRotationMatrix(m)
        return { normal, dummy }
      })
  }, [group.w, group.h, group.origH])
  const prevProgress = useRef(-1)

  const lightColor = useMemo(() => lightenColor(group.color), [group.color])

  // Upward-pointing arrow (ShapeGeometry in XY plane, naturally faces +Z = front face).
  const arrowGeo = useMemo(() => buildArrowGeo(group.w, group.h), [group.w, group.h])

  // Merged edge geometry — all instance outlines in one draw call.
  // Built at final world positions; shown only after every instance in the group lands.
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
  useEffect(() => () => arrowGeo.dispose(), [arrowGeo])

  const lastGlobalIndex = group.placements[group.placements.length - 1]?.globalIndex ?? 0

  useFrame(() => {
    if (!meshRef.current) return

    const progress = animState.current.progress

    // Skip matrix writes when nothing has changed — avoids GPU upload every frame
    // once the animation is complete and paused.
    if (progress === prevProgress.current) return
    prevProgress.current = progress

    // instanceIdx is the per-group slot inside this InstancedMesh (0-based within group).
    group.placements.forEach((p, instanceIdx) => {
      const { x, y, z: finalZ } = worldCenter(p)
      const gi     = p.globalIndex
      // Door is at world Z = containerLength. Cartons enter DOOR_ENTRY_OFFSET_CM outside.
      const entryZ = p.containerLength + DOOR_ENTRY_OFFSET_CM

      setEntryPose(dummy, gi, progress, x, y, entryZ, finalZ)
      meshRef.current!.setMatrixAt(instanceIdx, dummy.matrix)

      // Top-face plane — flush on top of the carton (+0.5 to avoid z-fighting)
      if (topRef.current) {
        const topY = y + p.h / 2 + 0.5
        setEntryPose(dummyPlane, gi, progress, x, topY, entryZ, finalZ)
        topRef.current.setMatrixAt(instanceIdx, dummyPlane.matrix)
      }

      // Sequence number + pallet label appear once the carton has fully landed
      const label = textsRef.current[instanceIdx]
      if (label) label.visible = progress >= gi + 1
      const palletLabel = palletTextsRef.current[instanceIdx]
      if (palletLabel) palletLabel.visible = progress >= gi + 1

      // "This way up" arrows — one per eligible face, sliding with the carton.
      // Offset 0.75 floats them just off the surface: above the top plane's
      // +0.5 and below the seq label's +1.0, avoiding z-fighting on all faces.
      if (arrowRef.current) {
        arrowFaces.forEach((face, fi) => {
          const ox = face.normal.x * (p.w / 2 + 0.75)
          const oy = face.normal.y * (p.h / 2 + 0.75)
          const oz = face.normal.z * (p.d / 2 + 0.75)
          setEntryPose(face.dummy, gi, progress, x + ox, y + oy, entryZ + oz, finalZ + oz)
          arrowRef.current!.setMatrixAt(instanceIdx * arrowFaces.length + fi, face.dummy.matrix)
        })
      }
    })

    meshRef.current.instanceMatrix.needsUpdate = true
    if (topRef.current) topRef.current.instanceMatrix.needsUpdate = true
    if (arrowRef.current) arrowRef.current.instanceMatrix.needsUpdate = true

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
      <instancedMesh ref={topRef} args={[undefined, undefined, group.placements.length]} frustumCulled={false}>
        <planeGeometry args={[group.w * TOP_PLANE_SCALE, group.d * TOP_PLANE_SCALE]} />
        <meshStandardMaterial color={lightColor} emissive={lightColor} emissiveIntensity={0.3} opacity={0.9} transparent side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={arrowRef} geometry={arrowGeo} args={[undefined, undefined, group.placements.length * arrowFaces.length]} frustumCulled={false}>
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} side={THREE.DoubleSide} />
      </instancedMesh>
      <lineSegments ref={linesRef} geometry={edgeGeo} visible={false}>
        <lineBasicMaterial color="#ffffff" opacity={0.55} transparent />
      </lineSegments>
      {group.placements.map((p, i) => {
        const { x, y, z } = worldCenter(p)
        const inset = Math.min(group.w, group.d) * 0.06
        return (
          <group key={p.globalIndex}>
            <Text
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
            {/* Pallet ID — top-right (back-right) corner of the top face */}
            {group.palletLabel && (
              <Text
                ref={(el) => { palletTextsRef.current[i] = el }}
                position={[x + p.w / 2 - inset, y + p.h / 2 + 1.0, z - p.d / 2 + inset]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={Math.min(group.w, group.d) * 0.14}
                color="#111111"
                anchorX="right"
                anchorY="top"
                visible={false}
              >
                {group.palletLabel}
              </Text>
            )}
          </group>
        )
      })}
    </>
  )
}

// ─── InstancedCartons ─────────────────────────────────────────────────────────

/** Root component: builds CartonGroup list and owns the GSAP timeline. */
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

    // Product-level color: cartons sharing a product name get the same color,
    // regardless of which pallet they belong to. Pallet identity is shown via
    // the top-face pallet label instead.
    const productColors = buildProductColorMap(pallets)
    const cartonProduct     = new Map<string, string>()  // cartonId → product name
    const cartonPalletLabel = new Map<string, string>()  // cartonId → pallet label
    pallets.forEach((pallet) =>
      pallet.cartons.forEach((c) => {
        cartonProduct.set(c.id, c.productCode ?? c.label)
        cartonPalletLabel.set(c.id, pallet.label)
      })
    )

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
      const productName = cartonProduct.get(first.cartonId)
      result.push({
        key:         groupKey,
        cartonId:    first.cartonId,
        w:           first.w,
        h:           first.h,
        d:           first.d,
        color:       (productName && productColors.get(productName)) || getCartonColor(0),
        rotated,
        origH:       orig?.h ?? first.h,
        palletLabel: cartonPalletLabel.get(first.cartonId) ?? '',
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

  // Recreate timeline on every new pack result. SECONDS_PER_CARTON per carton at 1× speed.
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

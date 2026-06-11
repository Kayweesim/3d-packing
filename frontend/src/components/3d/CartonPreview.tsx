/**
 * CartonPreview.tsx — mini R3F canvas showing a rotating 3D preview of a carton.
 *
 * Exports: CartonPreview.
 * Used inside CartonEditDialog to give live visual feedback as the user edits
 * carton dimensions and rotation/stacking flags.
 * Dependencies: React Three Fiber, Drei (OrbitControls, Text), Three.js.
 */
import { useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import { buildArrowGeo, lightenColor } from '@/src/lib/cartonShapes'

interface Props { w: number; h: number; d: number; color: string }

// Camera is placed at `max(w,h,d) × CAMERA_DIST_FACTOR` from the origin so the
// carton always fills most of the preview regardless of its size.
const CAMERA_DIST_FACTOR = 2.5
const PREVIEW_HEIGHT_PX  = 192   // fixed pixel height of the canvas element

/** Positions the camera so the carton fits the preview at any size. */
function CameraPositioner({ w, h, d }: Pick<Props, 'w' | 'h' | 'd'>) {
  const { camera, controls } = useThree()

  useEffect(() => {
    const dist = Math.max(w, h, d) * CAMERA_DIST_FACTOR
    camera.position.set(dist, dist * 0.6, dist)
    if (controls && 'target' in controls && 'update' in controls) {
      ;(controls as any).target.set(0, 0, 0) // eslint-disable-line @typescript-eslint/no-explicit-any
      ;(controls as any).update() // eslint-disable-line @typescript-eslint/no-explicit-any
    }
  }, [w, h, d, camera, controls])

  return null
}

/** R3F scene content: carton body, edges, top indicator, up-arrow, and axis labels. */
function Scene({ w, h, d, color }: Props) {
  const edgeGeo = useMemo(() => {
    const box = new THREE.BoxGeometry(w, h, d)
    const edges = new THREE.EdgesGeometry(box)
    box.dispose()
    return edges
  }, [w, h, d])

  // Lightened top-face color mirrors the rotation indicator in InstancedCartons.
  const topColor = useMemo(() => lightenColor(color), [color])

  const arrowGeo = useMemo(() => buildArrowGeo(w, h), [w, h])

  useEffect(() => () => edgeGeo.dispose(), [edgeGeo])
  useEffect(() => () => arrowGeo.dispose(), [arrowGeo])

  // Axis label positions — axes originate from the carton corner (-w/2, -h/2, -d/2).
  const axisLen   = Math.max(w, h, d) * 0.75
  const labelDist = axisLen * 1.25
  const fontSize  = Math.max(w, h, d) * 0.1
  const cx = -w / 2
  const cy = -h / 2
  const cz = -d / 2

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[1, 2, 1]} intensity={1} />
      <OrbitControls makeDefault autoRotate autoRotateSpeed={2} enableZoom={false} enablePan={false} />
      <CameraPositioner w={w} h={h} d={d} />
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} opacity={0.85} transparent />
      </mesh>
      <lineSegments geometry={edgeGeo}>
        <lineBasicMaterial color="#ffffff" opacity={0.55} transparent />
      </lineSegments>
      <mesh position={[0, h / 2 + 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w * 0.88, d * 0.88]} />
        <meshStandardMaterial color={topColor} emissive={topColor} emissiveIntensity={0.3} opacity={0.9} transparent side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, d / 2 + 0.2]} geometry={arrowGeo}>
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} side={THREE.DoubleSide} />
      </mesh>
      {/* Axes originate from the carton corner (-w/2, -h/2, -d/2). X=W(red) Y=H(green) Z=D(blue) */}
      <axesHelper args={[axisLen]} position={[cx, cy, cz]} />
      <Text position={[cx + labelDist, cy, cz]} fontSize={fontSize} color="#ff4444" anchorX="center" anchorY="middle">W</Text>
      <Text position={[cx, cy + labelDist, cz]} fontSize={fontSize} color="#44dd44" anchorX="center" anchorY="middle">H</Text>
      <Text position={[cx, cy, cz + labelDist]} fontSize={fontSize} color="#4488ff" anchorX="center" anchorY="middle">D</Text>
    </>
  )
}

/** Fixed-height mini R3F canvas rendering the carton in 3D with auto-rotation. */
export function CartonPreview({ w, h, d, color }: Props) {
  const dist = Math.max(w, h, d) * CAMERA_DIST_FACTOR
  return (
    <Canvas
      style={{ width: '100%', height: PREVIEW_HEIGHT_PX }}
      camera={{ fov: 50, near: 0.1, far: 100000, position: [dist, dist * 0.6, dist] }}
      gl={{ antialias: true }}
    >
      <Scene w={w} h={h} d={d} color={color} />
    </Canvas>
  )
}

import { useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'

interface Props { w: number; h: number; d: number; color: string }

// Updates camera distance whenever box dimensions change, keeping the box fully in frame.
// Mirrors the CameraController pattern from Canvas.tsx.
function CameraPositioner({ w, h, d }: Pick<Props, 'w' | 'h' | 'd'>) {
  const { camera, controls } = useThree()

  useEffect(() => {
    const dist = Math.max(w, h, d) * 2.5
    camera.position.set(dist, dist * 0.6, dist)
    if (controls && 'target' in controls && 'update' in controls) {
      ;(controls as any).target.set(0, 0, 0) // eslint-disable-line @typescript-eslint/no-explicit-any
      ;(controls as any).update() // eslint-disable-line @typescript-eslint/no-explicit-any
    }
  }, [w, h, d, camera, controls])

  return null
}

function Scene({ w, h, d, color }: Props) {
  const edgeGeo = useMemo(() => {
    const box = new THREE.BoxGeometry(w, h, d)
    const edges = new THREE.EdgesGeometry(box)
    box.dispose()
    return edges
  }, [w, h, d])

  useEffect(() => () => edgeGeo.dispose(), [edgeGeo])

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
      {/* Axes originate from the box corner (-w/2, -h/2, -d/2). X=W(red) Y=H(green) Z=D(blue) */}
      <axesHelper args={[Math.max(w, h, d) * 0.75]} position={[-w / 2, -h / 2, -d / 2]} />
      {(() => {
        const axisLen = Math.max(w, h, d) * 0.75
        const labelDist = axisLen * 1.25
        const fontSize = Math.max(w, h, d) * 0.1
        const centerX = -w / 2
        const centerY = -h / 2
        const centerZ = -d / 2
        return (
          <>
            <Text position={[centerX + labelDist, centerY, centerZ]} fontSize={fontSize} color="#ff4444" anchorX="center" anchorY="middle">W</Text>
            <Text position={[centerX, centerY + labelDist, centerZ]} fontSize={fontSize} color="#44dd44" anchorX="center" anchorY="middle">H</Text>
            <Text position={[centerX, centerY, centerZ + labelDist]} fontSize={fontSize} color="#4488ff" anchorX="center" anchorY="middle">D</Text>
          </>
        )
      })()}
    </>
  )
}

export function BoxPreview({ w, h, d, color }: Props) {
  const dist = Math.max(w, h, d) * 2.5
  return (
    <Canvas
      style={{ width: '100%', height: 192 }}
      camera={{ fov: 50, near: 0.1, far: 100000, position: [dist, dist * 0.6, dist] }}
      gl={{ antialias: true }}
    >
      <Scene w={w} h={h} d={d} color={color} />
    </Canvas>
  )
}

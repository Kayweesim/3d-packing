import { useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'

interface Props { w: number; h: number; d: number; color: string }

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

  const topColor = useMemo(() => {
    const c = new THREE.Color(color).lerp(new THREE.Color(1, 1, 1), 0.45)
    return `#${c.getHexString()}`
  }, [color])

  const arrowGeo = useMemo(() => {
    const s = Math.min(w, h) * 0.22
    const shape = new THREE.Shape()
    shape.moveTo(0, 0.5)
    shape.lineTo(-0.3, 0.1)
    shape.lineTo(-0.12, 0.1)
    shape.lineTo(-0.12, -0.5)
    shape.lineTo(0.12, -0.5)
    shape.lineTo(0.12, 0.1)
    shape.lineTo(0.3, 0.1)
    shape.closePath()
    const geo = new THREE.ShapeGeometry(shape)
    geo.scale(s, s, 1)
    return geo
  }, [w, h])

  useEffect(() => () => edgeGeo.dispose(), [edgeGeo])
  useEffect(() => () => arrowGeo.dispose(), [arrowGeo])

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

export function CartonPreview({ w, h, d, color }: Props) {
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

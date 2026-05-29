import { useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useStore } from '@/src/store'
import { ContainerManager, CONTAINER_GAP_CM } from './ContainerManager'
import { InstancedBoxes } from './InstancedBoxes'

// Runs inside the R3F canvas context; repositions the camera whenever containers change.
// Updates OrbitControls target so orbit navigation feels natural after each change.
// TODO: In Phase 7, replace the immediate jump with a GSAP-animated transition.
function CameraController() {
  const containers = useStore((s) => s.containers)
  const { camera, controls } = useThree()

  useEffect(() => {
    if (!containers.length) return

    // c.d = cross-section width (235cm, X axis); c.w = length (589cm, Z axis)
    const totalWidth =
      containers.reduce((sum, c) => sum + c.d, 0) +
      (containers.length - 1) * CONTAINER_GAP_CM
    const maxDepth = Math.max(...containers.map((c) => c.w))  // container length along Z
    const maxH     = Math.max(...containers.map((c) => c.h))
    const cx = totalWidth / 2

    const fovRad = 50 * (Math.PI / 180)

    // Pull camera back far enough to see the cross-section width AND the full depth.
    // Using the longer of: (a) what's needed to fit the X width in FOV,
    // (b) a fraction of the depth so the container doesn't fill the frame front-to-back.
    const distForWidth = (Math.max(totalWidth, maxH) / 2) / Math.tan(fovRad / 2)
    const dist = Math.max(distForWidth, maxDepth * 0.6) * 1.8

    // Elevated and in front of the door face; target is centre of container mass.
    camera.position.set(cx, maxH * 1.2, dist)

    // TODO: controls is loosely typed in R3F state — duck-type check is the safe approach here
    if (controls && 'target' in controls && 'update' in controls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(controls as any).target.set(cx, maxH / 3, 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(controls as any).update()
    }
  }, [containers, camera, controls])

  return null
}

export function SceneCanvas() {
  return (
    <Canvas
      className="flex-1"
      camera={{ fov: 50, near: 1, far: 50000 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[500, 800, 500]} intensity={0.8} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.35}
        rotateSpeed={0.6}
        zoomSpeed={0.7}
        maxPolarAngle={Math.PI / 2}
        minPolarAngle={Math.PI / 8}
      />
      <CameraController />
      <ContainerManager />
      <InstancedBoxes />
    </Canvas>
  )
}

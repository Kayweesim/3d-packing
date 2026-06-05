import { useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import gsap from 'gsap'
import * as THREE from 'three'
import { useStore } from '@/src/store'
import { ContainerManager, CONTAINER_GAP_CM } from './ContainerManager'
import { InstancedCartons } from './InstancedCartons'

const DARK_BG  = new THREE.Color('#252525')
const LIGHT_BG = new THREE.Color('#f5f5f5')

function SceneBackground() {
  const { scene } = useThree()
  const darkMode   = useStore((s) => s.darkMode)

  useEffect(() => {
    scene.background = darkMode ? DARK_BG : LIGHT_BG
  }, [darkMode, scene])

  return null
}

function CameraController() {
  const containers           = useStore((s) => s.containers)
  const activeContainerIndex = useStore((s) => s.activeContainerIndex)
  const containerFocusKey    = useStore((s) => s.containerFocusKey)
  const { camera, controls } = useThree()
  const prevFocusKeyRef      = useRef(containerFocusKey)

  // Effect 1 - fit all containers in view whenever the containers list changes.
  // Instant jump (no animation) so the scene is always coherent after add/remove.
  useEffect(() => {
    if (!containers.length) return

    // c.w = cross-section width (X axis, 235cm); c.d = depth/length (Z axis, 589/1203cm)
    const totalWidth =
      containers.reduce((sum, c) => sum + c.w, 0) +
      (containers.length - 1) * CONTAINER_GAP_CM
    const maxDepth = Math.max(...containers.map((c) => c.d))
    const maxH     = Math.max(...containers.map((c) => c.h))
    const cx = totalWidth / 2

    const fovRad = 50 * (Math.PI / 180)
    const distForWidth = (Math.max(totalWidth, maxH) / 2) / Math.tan(fovRad / 2)
    const dist = Math.max(distForWidth, maxDepth * 0.6) * 1.8

    camera.position.set(cx, maxH * 1.2, maxDepth + dist)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (controls && 'target' in controls && 'update' in controls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(controls as any).target.set(cx, maxH / 3, maxDepth / 2)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(controls as any).update()
    }
  }, [containers, camera, controls])

  // Effect 2 - GSAP transition to focus on the active container when the user
  // clicks a container row. Only fires on explicit clicks (prevFocusKeyRef guard
  // prevents it from running when containers are added/removed). Also skips when
  // nothing is selected (activeContainerIndex = -1).
  useEffect(() => {
    if (activeContainerIndex < 0) return
    if (containers.length <= 1) return
    // If the focus key hasn't advanced, this render was caused by the containers
    // list changing (add/remove), not by a user click — skip the zoom.
    if (prevFocusKeyRef.current === containerFocusKey) return
    prevFocusKeyRef.current = containerFocusKey

    const c = containers[activeContainerIndex]
    if (!c) return

    // Compute worldX for the active container (mirrors ContainerManager layout)
    let worldX = 0
    for (let i = 0; i < activeContainerIndex; i++) {
      worldX += containers[i].w + CONTAINER_GAP_CM
    }

    const cx = worldX + c.w / 2
    const cz = c.d / 2  // Z centre of container (back wall=0, door=c.d)

    const fovRad = 50 * (Math.PI / 180)
    const distForWidth = (Math.max(c.w, c.h) / 2) / Math.tan(fovRad / 2)
    const dist = Math.max(distForWidth, c.d * 0.6) * 1.8

    const targetCamPos = { x: cx, y: c.h * 1.2,  z: c.d + dist }
    const targetOrbit  = { x: cx, y: c.h / 3,    z: cz }

    gsap.killTweensOf(camera.position)

    gsap.to(camera.position, {
      ...targetCamPos,
      duration: 0.8,
      ease: 'power2.inOut',
      onUpdate: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (controls && 'update' in controls) (controls as any).update()
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (controls && 'target' in controls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gsap.killTweensOf((controls as any).target)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gsap.to((controls as any).target, {
        ...targetOrbit,
        duration: 0.8,
        ease: 'power2.inOut',
      })
    }
  }, [containerFocusKey, activeContainerIndex, containers, camera, controls])

  return null
}

export function SceneCanvas() {
  return (
    <Canvas
      className="flex-1"
      camera={{ fov: 50, near: 1, far: 50000 }}
      gl={{ antialias: true }}
    >
      <SceneBackground />
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
      <InstancedCartons />
    </Canvas>
  )
}

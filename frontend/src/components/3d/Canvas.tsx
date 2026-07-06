/**
 * Canvas.tsx — the R3F scene: background, lights, OrbitControls, camera
 * behaviour, container wireframes and the animated cartons.
 *
 * Exports: SceneCanvas.
 * CameraController runs two effects: (1) an instant fit-all reframe whenever
 * the containers list changes, and (2) a GSAP fly-to when the user explicitly
 * clicks a container — guarded by containerFocusKey so list changes alone
 * never trigger the zoom.
 */
import { useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'  // Canvas on which to paint the animations
import { OrbitControls } from '@react-three/drei' // Orbital Controls to manage camera
import gsap from 'gsap' //timeline
import * as THREE from 'three'
import { useStore } from '@/src/store'
import { ContainerManager, CONTAINER_GAP_CM } from './ContainerManager'
import { InstancedCartons } from './InstancedCartons'

const DARK_BG  = new THREE.Color('#252525')
const LIGHT_BG = new THREE.Color('#f5f5f5')

const CAMERA_FOV_DEG    = 50   // must match the perspective math in fitDistance
const CAM_HEIGHT_FACTOR = 1.2  // camera height as a multiple of scene height
const FOCUS_TWEEN_S     = 0.8  // fly-to duration when focusing a container

// Camera distance that frames a (spanW × spanH) cross-section with breathing
// room (×1.8), never closer than 0.6× the scene depth.
// Width must be fitted against the HORIZONTAL fov, which shrinks with the
// viewport aspect ratio — on a portrait phone it is far narrower than the
// vertical fov, so fitting by vertical fov alone cuts the scene off sideways.
function fitDistance(spanW: number, spanH: number, depth: number, aspect: number): number {
  const vFovRad = CAMERA_FOV_DEG * (Math.PI / 180)
  const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * Math.max(aspect, 0.1))
  const distForWidth  = (spanW / 2) / Math.tan(hFovRad / 2)
  const distForHeight = (spanH / 2) / Math.tan(vFovRad / 2)
  return Math.max(distForWidth, distForHeight, depth * 0.6) * 1.8
}

/** Swaps the scene clear color when the theme toggles. */
function SceneBackground() {
  const { scene } = useThree()  
  const darkMode = useStore((s) => s.darkMode)

  useEffect(() => {
    scene.background = darkMode ? DARK_BG : LIGHT_BG
  }, [darkMode, scene])

  return null
}

/** Headless component owning both camera-positioning effects. */
function CameraController() {
  const containers           = useStore((s) => s.containers)
  const activeContainerIndex = useStore((s) => s.activeContainerIndex)
  const containerFocusKey    = useStore((s) => s.containerFocusKey)
  const { camera, controls, size } = useThree()
  const prevFocusKeyRef      = useRef(containerFocusKey)
  const aspect               = size.width / Math.max(size.height, 1)

  // Effect 1 — fit all containers in view whenever the containers list changes
  // OR the canvas is resized (device rotation, sidebar toggle, window resize).
  // Instant jump (no animation) so the scene is always coherent after add/remove.
  useEffect(() => {
    if (!containers.length) return

    // c.w = cross-section width (X axis); c.d = depth/length (Z axis)
    const totalWidth =
      containers.reduce((sum, c) => sum + c.w, 0) +
      (containers.length - 1) * CONTAINER_GAP_CM
    const maxDepth = Math.max(...containers.map((c) => c.d))
    const maxH     = Math.max(...containers.map((c) => c.h))
    const cx = totalWidth / 2

    const dist = fitDistance(totalWidth, maxH, maxDepth, aspect)
    camera.position.set(cx, maxH * CAM_HEIGHT_FACTOR, maxDepth + dist)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (controls && 'target' in controls && 'update' in controls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(controls as any).target.set(cx, maxH / 3, maxDepth / 2)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(controls as any).update()
    }
  }, [containers, camera, controls, aspect])

  // Effect 2 — GSAP transition to focus on the active container when the user
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

    const dist = fitDistance(c.w, c.h, c.d, aspect)
    const targetCamPos = { x: cx, y: c.h * CAM_HEIGHT_FACTOR, z: c.d + dist }
    const targetOrbit  = { x: cx, y: c.h / 3,                 z: cz }

    gsap.killTweensOf(camera.position)

    gsap.to(camera.position, {
      ...targetCamPos,
      duration: FOCUS_TWEEN_S,
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
        duration: FOCUS_TWEEN_S,
        ease: 'power2.inOut',
      })
    }
    // `aspect` is in deps for lint correctness; the focus-key guard above means
    // a resize alone never re-triggers the zoom tween.
  }, [containerFocusKey, activeContainerIndex, containers, camera, controls, aspect])

  return null
}

/** Full-viewport R3F canvas hosting the packing scene. */
export function SceneCanvas() {
  return (
    <Canvas
      className="flex-1"
      camera={{ fov: CAMERA_FOV_DEG, near: 1, far: 50000 }}
      gl={{ antialias: true }}
      dpr={[1, 2]}
    >
      <SceneBackground />
      <ambientLight intensity={0.55} />
      <directionalLight position={[500, 800, 500]} intensity={0.8} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.35}
        rotateSpeed={0.6}
        zoomSpeed={0.7}
        maxPolarAngle={Math.PI / 2}
        minPolarAngle={Math.PI / 8}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      />
      <CameraController />
      <ContainerManager />
      <InstancedCartons />
    </Canvas>
  )
}

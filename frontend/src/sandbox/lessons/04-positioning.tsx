/**
 * LESSON 04 — Positioning: axes, center anchoring, and the worldX offset pattern
 *
 * This lesson unpacks the most important positioning concept in the main app.
 * In ContainerMesh.tsx, every container is positioned like this:
 *
 *   position={[worldX + w / 2, h / 2, 0]}
 *
 * That looks odd at first. Why not just position={[worldX, 0, 0]}?
 * This lesson explains exactly why — and builds the intuition from scratch.
 *
 * KEY CONCEPT — Three.js geometry is always centered at the origin:
 *   A BoxGeometry(6, 2, 3) has vertices from (-3, -1, -1.5) to (+3, +1, +1.5).
 *   Setting mesh.position sets the CENTER of the geometry in world space.
 *   To place the BOTTOM-LEFT-FRONT CORNER at a given point, you must add half
 *   the dimensions: center.x = cornerX + w/2, center.y = cornerY + h/2.
 *
 * Scene layout (three stages, left → right):
 *   Stage 1 (x = -10): Axes helper + raw box at position=[0,0,0] — clips into ground
 *   Stage 2 (x =   0): Same box with position=[w/2, h/2, 0] — sits on the floor at origin
 *   Stage 3 (x =  +8): Two boxes side-by-side using the accumulating worldX pattern
 */

import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { Group } from 'three'

// Container dimensions (in cm, same scale as the main app)
const W = 4   // width  (maps to container.w)
const H = 2   // height (maps to container.h)
const D = 2   // depth  (maps to container.d)
const GAP = 1 // gap between containers (maps to CONTAINER_GAP_CM / scale)

// ─── Stage 1: box at position=[0,0,0] — the naive mistake ───────────────────
// BoxGeometry is centered at origin. The box straddles the XZ plane:
// top face at y=+H/2, bottom face at y=-H/2.
// This "sinks" the box halfway into the floor — NOT what we want for shipping containers.
function BoxAtOrigin({ x = 0 }: { x?: number }) {
  return (
    // Group lets us offset the whole stage in world space without affecting
    // the internal positions (which we want to show as [0,0,0]).
    <group position={[x, 0, 0]}>
      {/* The box: centered at [0,0,0] so half of it is below the floor (y<0). */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[W, H, D]} />
        {/*
          transparent + opacity so you can see the grid THROUGH the box,
          making it obvious that part of the box is below the floor plane.
        */}
        <meshStandardMaterial color="tomato" transparent opacity={0.7} />
      </mesh>

      {/*
        axesHelper draws the X (red), Y (green), Z (blue) axes at THIS group's
        origin. args=[length] — length 2 means each axis line is 2 units long.
        This shows you that position=[0,0,0] places the CENTER at the origin.
      */}
      <axesHelper args={[2.5]} />
    </group>
  )
}

// ─── Stage 2: box with bottom-left corner at origin ──────────────────────────
// To place the BOTTOM-LEFT-FRONT corner at a world position (cornerX, cornerY, cornerZ):
//   mesh.position.x = cornerX + W/2   (shift center right by half width)
//   mesh.position.y = cornerY + H/2   (shift center up by half height)
//   mesh.position.z = cornerZ + 0     (for containers we only offset on XY)
//
// This is what ContainerMesh.tsx does when cornerX = worldX, cornerY = 0:
//   position={[worldX + W/2, H/2, 0]}
function BoxOnFloor({ x = 0 }: { x?: number }) {
  return (
    <group position={[x, 0, 0]}>
      {/*
        position=[W/2, H/2, 0] → bottom-left corner sits at exactly (0, 0, 0).
        The geometry center is shifted up and right from its "natural" origin.
      */}
      <mesh position={[W / 2, H / 2, 0]}>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial color="#34d399" transparent opacity={0.85} />
      </mesh>

      {/* Axes at the GROUP origin — visually confirms the corner is at (0,0,0). */}
      <axesHelper args={[2.5]} />
    </group>
  )
}

// ─── Stage 3: two containers side-by-side with the worldX pattern ────────────
// ContainerManager.tsx accumulates worldX like this:
//   let x = 0
//   containers.forEach(c => {
//     worldPositions.push(x)        // left edge of THIS container
//     x += c.w + CONTAINER_GAP_CM   // move x to the left edge of the NEXT one
//   })
//
// Each container is then rendered at position=[worldX + w/2, h/2, 0].
// This lines them up left-to-right with a gap, all sitting on the floor.
function SideBySideContainers({ x = 0 }: { x?: number }) {
  // Manually compute worldX for two containers — mirrors ContainerManager.tsx
  const worldX0 = 0            // first container: left edge at x=0
  const worldX1 = W + GAP      // second container: left edge after first width + gap

  return (
    <group position={[x, 0, 0]}>
      {/* Container 0 */}
      <mesh position={[worldX0 + W / 2, H / 2, 0]}>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial color="royalblue" transparent opacity={0.75} wireframe />
      </mesh>

      {/* Container 1 */}
      <mesh position={[worldX1 + W / 2, H / 2, 0]}>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial color="mediumpurple" transparent opacity={0.75} wireframe />
      </mesh>

      {/* Axis at the group origin (world left edge of the arrangement) */}
      <axesHelper args={[2.5]} />
    </group>
  )
}

// ─── Slow-rotation wrapper to help visualise depth ───────────────────────────
// Wraps a stage group in a slow Y-axis spin so you can see the 3D positioning
// without having to manually orbit.
function Spinning({ x = 0, children }: { x?: number; children: React.ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame((_, delta) => {
    // delta is seconds since last frame (e.g. 0.016 for 60fps).
    // Multiply by angular speed in radians/sec.
    if (ref.current) ref.current.rotation.y += delta * 0.4
  })
  return (
    <group ref={ref} position={[x, 0, 0]}>
      {children}
    </group>
  )
}

// ─── Scene ───────────────────────────────────────────────────────────────────
export default function Lesson04Positioning() {
  return (
    <Canvas
      style={{ width: '100%', height: '100%' }}
      // Camera pulled back far enough to see all three stages
      camera={{ fov: 50, position: [4, 6, 18] }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 10, 6]} intensity={1} />
      <OrbitControls />

      {/*
        Stage 1 — box at origin: clearly sinks into the floor.
        The axesHelper shows origin. The red (X) and blue (Z) axes should
        pass through the middle of the box vertically.
      */}
      <Spinning x={-10}>
        <BoxAtOrigin x={5} />
      </Spinning>

      {/*
        Stage 2 — corrected position: bottom-left corner sits at origin.
        The box floats on the floor. The axes confirm the corner is at (0,0,0).
      */}
      <Spinning x={0}>
        <BoxOnFloor x={0} />
      </Spinning>

      {/*
        Stage 3 — side-by-side layout: the full ContainerManager.tsx pattern.
        Two boxes, each with bottom-left corner at their respective worldX.
        The gap between them is clearly visible.
      */}
      <Spinning x={10}>
        <SideBySideContainers x={0} />
      </Spinning>

      {/*
        The floor grid spans the XZ plane at y=0.
        It makes the "sinking into the floor" obvious in Stage 1,
        and confirms "sitting on the floor" in Stages 2 and 3.
      */}
      <gridHelper args={[40, 40, '#333', '#222']} />
    </Canvas>
  )
}

// ─── QUESTIONS ───────────────────────────────────────────────────────────────
// Q1: If a container has dimensions w=6, h=3, d=2 and its worldX (left edge)
//     is at x=100 in scene space, what is the correct mesh position?
//     Write it out as [x, y, z].  [103, 1.5, 2]
//
// Q2: Change the D (depth) constant from 2 to 4. Observe Stage 2 and Stage 3.
//     Does the side-by-side gap change? Why or why not?
//     Then change the GAP constant from 1 to 3. What changes now?
//
// Q3: In ContainerManager.tsx, worldX is computed with:
//       x += c.w + CONTAINER_GAP_CM
//     If you had 3 containers with widths [589, 589, 1203] and a gap of 100,
//     what are the three worldX values? Then what is each container's it is 589/ 2 + 100, 3 times/
//     mesh.position.x (i.e. worldX + w/2)?
//
// ANSWERS: (hidden — try yourself first)
// A1: position={[100 + 6/2, 3/2, 0]} = position={[103, 1.5, 0]}
//     The center is offset from the corner by half the dimension in each axis.
//     Z is 0 because we only position containers along X and Y, not depth.
//
// A2: Changing D affects the box depth (how far it goes into/out of the screen).
//     The side-by-side gap does NOT change — worldX0 and worldX1 only depend on
//     W and GAP, not D. Changing GAP from 1 to 3 adds space between the two
//     boxes in Stage 3 (worldX1 becomes W + 3 instead of W + 1).
//
// A3: worldX values: [0, 689, 1378]
//       Container 0: worldX=0     → x=0+589/2   = 294.5
//       Container 1: worldX=689   → x=689+589/2  = 983.5
//       Container 2: worldX=1378  → x=1378+1203/2= 1979.5
//     (689 = 589+100, 1378 = 689+589+100)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LESSON 01 — Geometry
 *
 * Core idea: geometry defines SHAPE (vertices + faces). A material defines
 * APPEARANCE. A mesh binds them together into something renderable.
 * Neither geometry nor material alone produces a visible object.
 *
 * R3F translates Three.js classes into JSX primitives:
 *   new THREE.BoxGeometry(1, 1, 1)  →  <boxGeometry args={[1, 1, 1]} />
 *   new THREE.Mesh(geo, mat)        →  <mesh><boxGeometry /><meshStandardMaterial /></mesh>
 *
 * The args prop is spread into the constructor — <boxGeometry args={[w, h, d]} />
 * is literally new THREE.BoxGeometry(w, h, d).
 */

import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

// ─── BoxGeometry ─────────────────────────────────────────────────────────────
// BoxGeometry(width, height, depth, widthSegs, heightSegs, depthSegs)
// The last three args are subdivision counts — more segments let you deform the
// mesh (for displacement maps, morphing, etc.) but cost more vertices.
// For a flat rigid box, 1 segment per axis is all you need.
function DemoBox({ x = 0 }: { x?: number }) {
  return (
    // mesh is the scene object. position=[x,y,z] sets mesh.position.set(x,y,z).
    <mesh position={[x, 0, 0]}>
      {/* 1.2 wide, 1.2 tall, 1.2 deep — a unit-ish cube */}
      <boxGeometry args={[1.2, 1.2, 1.2]} />
      {/*
        meshStandardMaterial uses PBR (Physically-Based Rendering).
        It responds to lights — without an ambientLight + directionalLight in
        the scene, this renders pitch black. See the Canvas lights below.
      */}
      <meshStandardMaterial color="blue" />
    </mesh>
  )
}

// ─── SphereGeometry ──────────────────────────────────────────────────────────
// SphereGeometry(radius, widthSegments, heightSegments)
// widthSegments = horizontal subdivisions around the equator
// heightSegments = vertical subdivisions from pole to pole
// LOW count (4, 4) → diamond/gemstone look. HIGH count (64, 32) → smooth ball.
// 32 × 16 is the practical "good enough" default.
function DemoSphere({ x = 0 }: { x?: number }) {
  return (
    <mesh position={[x, 0, 0]}>
      {/* radius=0.7, 32 horizontal slices, 16 vertical slices */}
      <sphereGeometry args={[0.7, 32, 16]} />
      <meshStandardMaterial color="skyblue" />
    </mesh>
  )
}

// ─── CylinderGeometry ────────────────────────────────────────────────────────
// CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, heightSegments)
// radiusTop === radiusBottom → straight cylinder
// radiusTop = 0 → cone
// radialSegments: how many sides (3 = triangle prism, 32 = looks round)
function DemoCylinder({ x = 0 }: { x?: number }) {
  return (
    <mesh position={[x, 0, 0]}>
      {/* Equal top/bottom radius = cylinder. 32 sides looks circular. */}
      <cylinderGeometry args={[0.5, 0.5, 1.4, 32]} />
      <meshStandardMaterial color="lightgreen" />
    </mesh>
  )
}

// ─── Scene ───────────────────────────────────────────────────────────────────
export default function Lesson01Geometry() {
  return (
    /*
      Canvas is the R3F entry point — it creates:
        - a WebGL renderer (THREE.WebGLRenderer)
        - a scene (THREE.Scene)
        - a PerspectiveCamera
        - a requestAnimationFrame render loop
      Everything inside Canvas renders into that WebGL context.

      camera prop sets the initial camera state.
      fov: field of view in degrees. 50 is "natural" — 35 is telephoto, 90 is wide.
      position: where the camera starts [x, y, z].
    */
    <Canvas
      style={{ width: '100%', height: '100%' }}
      camera={{ fov: 50, position: [3, 2.5, 8] }}
    >
      {/*
        ambientLight: uniform light that hits every surface equally from all
        directions. It prevents fully-dark shadow sides.
        intensity: 0 = black, 1 = full brightness. 0.5 = soft fill.
      */}
      <ambientLight intensity={0.5} />

      {/*
        directionalLight: parallel rays from a direction (like the sun).
        position is NOT a point-light position — it's a direction vector.
        The light rays travel opposite to this vector toward the origin.
        This creates highlights and gives objects apparent depth.
      */}
      <directionalLight position={[5, -8, 5]} intensity={3} />

      {/*
        OrbitControls (from @react-three/drei): adds mouse interaction.
        Left-drag: orbit. Right-drag: pan. Scroll: zoom.
        Without this, the camera is locked in place.
      */}
      <OrbitControls />

      {/* Three shapes spaced 3 units apart on the X axis */}
      <DemoBox      x={-3} />
      <DemoSphere   x={0}  />
      <DemoCylinder x={3}  />

      {/*
        gridHelper args=[size, divisions, colorCenter, colorGrid]
        Draws a reference grid on the XZ plane. Purely visual — not a mesh.
        Helps you understand scale and the ground plane.
        rotation is not needed — gridHelper already lies flat on XZ.
      */}
      <gridHelper args={[20, 20, '#3333', '#222']} />
    </Canvas>
  )
}

// ─── QUESTIONS ───────────────────────────────────────────────────────────────
// Q1: BoxGeometry takes 3 size arguments (w, h, d). What happens if you only
//     pass one, like <boxGeometry args={[2]} />? Try it and explain why.
//
// Q2: Change DemoSphere's widthSegments from 32 down to 4. What does it look
//     like? At what segment count does further increase become imperceptible?
//
// Q3: In the main app's ContainerMesh.tsx, a BoxGeometry is created and then
//     immediately disposed after passing it to EdgesGeometry. Why does the
//     BoxGeometry get disposed but the EdgesGeometry does not?
//
// ANSWERS: (hidden — try yourself first)
// A1: Three.js uses the single value for ALL three dimensions. BoxGeometry(2)
//     produces a 2×2×2 cube — missing args default to the first provided value.
//     This is just how the JS constructor signature works, not a Three.js rule.
//
// A2: At 4 segments it looks like a diamond/octahedron. The improvement
//     becomes essentially invisible somewhere between 32–64 segments at normal
//     viewing distances. More segments = more GPU vertices = more memory and
//     more vertex shader invocations per frame.
//
// A3: BoxGeometry is a temporary scaffold only needed to compute edges.
//     Once EdgesGeometry copies the edge data from it, the BoxGeometry is no
//     longer needed by anything rendered — so dispose() frees its GPU buffers.
//     EdgesGeometry IS what's rendered (attached to lineSegments), so it must
//     stay alive until the component unmounts (handled by the useEffect cleanup).
//     Forgetting to dispose leaks GPU-side vertex buffer memory indefinitely.
// ─────────────────────────────────────────────────────────────────────────────

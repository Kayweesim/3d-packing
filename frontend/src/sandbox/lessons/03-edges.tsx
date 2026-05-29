/**
 * LESSON 03 — EdgesGeometry vs wireframe material
 *
 * This lesson exists because ContainerMesh.tsx in the main app uses a specific
 * pattern — EdgesGeometry + lineSegments + lineBasicMaterial — rather than
 * the simpler wireframe flag. Here is exactly why.
 *
 * PROBLEM WITH wireframe=true on a mesh material:
 *   A BoxGeometry's surface is made of triangles (every quad face = 2 triangles).
 *   wireframe mode draws ALL triangle edges — including the diagonal that splits
 *   each rectangular face. A 6-faced box shows 18 lines instead of 12.
 *   This looks visually noisy and doesn't represent the container as a clean box.
 *
 * SOLUTION — EdgesGeometry:
 *   EdgesGeometry takes any BufferGeometry and outputs only edges where the angle
 *   between adjacent faces exceeds a threshold (default: 1°). For a box, that
 *   means exactly the 12 outer edges — no diagonals, no internal subdivisions.
 *   You pair it with LineSegments (not Mesh) so it draws as lines, not triangles.
 *
 * Scene layout:
 *   Left  — wireframe material (noisy diagonals visible)
 *   Right — EdgesGeometry + lineSegments (clean 12-edge box)
 */

import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { BoxGeometry, EdgesGeometry } from 'three'

// ─── Approach A: wireframe flag on meshStandardMaterial ──────────────────────
// Simple to write, but renders ALL triangle edges including face diagonals.
// Rotate the camera to clearly see the X-shaped diagonal on each face.
function WireframeMesh({ x = 0 }: { x?: number }) {
  return (
    <mesh position={[x, 0, 0]}>
      <boxGeometry args={[2, 2, 2]} />
      {/*
        wireframe={true}: renders the geometry as lines along triangle edges.
        A BoxGeometry face = 2 triangles = 3 lines (including 1 diagonal).
        This is fast to write but looks messy for container outlines.
        Note: still a Mesh under the hood — uses the triangle edge topology.
      */}
      <meshStandardMaterial color="#60a5fa" wireframe={true} />
    </mesh>
  )
}

// ─── Approach B: EdgesGeometry + lineSegments + lineBasicMaterial ─────────────
// This is the exact pattern used in ContainerMesh.tsx.
function EdgesMesh({ x = 0 }: { x?: number }) {
  const edges = useMemo(() => {
    // Step 1: create the source geometry — defines the shape.
    const box = new BoxGeometry(2, 2, 2)

    // Step 2: derive edges. EdgesGeometry walks the source geometry and finds
    // every edge where adjacent face normals differ by more than `thresholdAngle`
    // degrees (default 1°). On a box, every edge is a true corner edge (90°),
    // so all 12 are kept. Internal triangle diagonals sit on a FLAT face (0°
    // between adjacent triangles), so they are DISCARDED.
    const geo = new EdgesGeometry(box, 5) // second arg = thresholdAngle in degrees

    // Step 3: free the source geometry's GPU buffers — we're done with it.
    // Only the EdgesGeometry needs to survive (it's what gets rendered).
    box.dispose()

    return geo
  }, []) // empty deps → created once, never recreated

  return (
    /*
      lineSegments (not <mesh>!) — EdgesGeometry outputs vertex pairs
      [edge0_start, edge0_end, edge1_start, edge1_end, ...].
      LineSegments draws each consecutive pair as a separate line segment.
      If you used <line> instead, it would draw ONE continuous polyline
      connecting all points in sequence — which looks completely wrong.
    */
    <lineSegments position={[x, 0, 0]}>
      {/*
        primitive + attach="geometry" is how you attach an imperatively-created
        Three.js object to an R3F element. R3F will call:
          lineSegmentsInstance.geometry = edges
        and will clean it up when this element unmounts.
      */}
      <primitive object={edges} attach="geometry" />

      {/*
        lineBasicMaterial is the only material that works on LineSegments.
        No roughness, no metalness, no response to lights — just color and
        optional opacity.
      */}
      <lineBasicMaterial color="#6a5fa" opacity ="1.0"/>
    </lineSegments>
  )
}

// ─── Reference box to show "what should it look like" ────────────────────────
// Solid opaque box so you can compare the edges visually.
function SolidBox({ x = 0 }: { x?: number }) {
  return (
    <mesh position={[x, 0, 0]}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="#1e3a5f" />
    </mesh>
  )
}

// ─── Scene ───────────────────────────────────────────────────────────────────
export default function Lesson03Edges() {
  return (
    <Canvas
      style={{ width: '100%', height: '100%' }}
      camera={{ fov: 50, position: [0, 3, 10] }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 4]} intensity={1} />
      <OrbitControls dampingFactor={0.1} zoomSpeed={0.5}/>

      {/*
        Left group: wireframe flag. Orbit around it — notice the diagonal
        line cutting across each face (evidence of underlying triangulation).
      */}
      <WireframeMesh x={-3} />

      {/*
        Right group: EdgesGeometry. Clean 12-edge box. No diagonals.
        Orbit around it — every face shows exactly 4 edges.
        This is what the container wireframes look like in the main app.
      */}
      <EdgesMesh x={3} />

      {/*
        Underneath each wireframe: a solid box for reference.
        Helps you see how accurately each wireframe approach traces the box.
        Note that EdgesGeometry perfectly matches the solid edges.
      */}
      <SolidBox x={-3} />
      <SolidBox x={3}  />

      <gridHelper args={[20, 20, '#333', '#222']} />
    </Canvas>
  )
}

// ─── QUESTIONS ───────────────────────────────────────────────────────────────
// Q1: A BoxGeometry(2, 2, 2) with no extra segments has 6 faces × 2 triangles
//     = 12 triangles. How many total line segments does wireframe mode draw?
//     (Each triangle has 3 edges, but shared edges are drawn twice — think about
//     how many unique edges a box actually has and how many are internal.)
//
// Q2: Change the EdgesGeometry threshold angle from 1 to 89 degrees. What
//     happens? Then try 91. What is the threshold actually filtering?
//
// Q3: In ContainerMesh.tsx, the geometry is created inside useMemo. What would
//     happen if you moved it outside useMemo (created inline in the component
//     body instead)? How many GPU allocations would occur and when?
//
// ANSWERS: (hidden — try yourself first)
// A1: A box with no extra segments has 12 triangles. wireframe draws each
//     triangle's 3 edges. But many are shared between triangles:
//     12 triangles × 3 = 36 edge draws, but only 18 unique edges (12 outer box
//     edges + 6 face diagonals, one per face). So wireframe shows 18 lines, not 12.
//     The 6 extra lines are the face diagonals that split each quad into 2 triangles.
//
// A2: At 89°: the 90° corners of the box are just below threshold (each box
//     corner is exactly 90° between faces), so they get filtered out — box
//     disappears or shows only some edges. At 91°: all 90° corners pass the
//     threshold and you see the clean 12 edges as expected. The threshold is
//     the minimum dihedral angle between adjacent faces for an edge to be kept.
//     Face diagonals on a flat face have 0° dihedral, so they're always filtered
//     below 1°.
//
// A3: Without useMemo, the geometry is created on EVERY render. Every React
//     re-render (container list changes, camera moves, any parent re-render)
//     would call new BoxGeometry() + new EdgesGeometry() and upload new vertex
//     buffers to the GPU. The old buffers would be leaked (never disposed).
//     Over time this fills GPU memory. useMemo ensures creation happens once
//     per unique [w, h, d] combination.
// ─────────────────────────────────────────────────────────────────────────────

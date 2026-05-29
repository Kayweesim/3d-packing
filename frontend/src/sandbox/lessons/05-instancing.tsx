/**
 * LESSON 05 — InstancedMesh
 *
 * WHY THIS MATTERS:
 * The main app will render potentially hundreds of packed boxes inside containers.
 * The naive approach — one <mesh> per box — costs one "draw call" per box.
 * Each draw call has CPU overhead: uploading transform matrices, binding buffers,
 * issuing a GPU command. At 500 boxes that's 500 draw calls → frame-rate collapse.
 *
 * InstancedMesh solves this by:
 *   1. Storing all instance transforms in a single GPU buffer (instanceMatrix).
 *   2. Issuing exactly ONE draw call: "draw this geometry N times with these transforms."
 *   3. The GPU handles the N instances in parallel — no per-instance CPU overhead.
 *
 * This is the NON-NEGOTIABLE rendering strategy for InstancedBoxes.tsx in Phase 5.
 *
 * CORE API:
 *   new THREE.InstancedMesh(geometry, material, count)
 *   mesh.setMatrixAt(index, matrix4)       — sets position/rotation/scale for instance i
 *   mesh.instanceMatrix.needsUpdate = true — tell GPU to re-upload the matrix buffer
 *   mesh.setColorAt(index, color)          — per-instance color (optional)
 *   mesh.instanceColor.needsUpdate = true  — same pattern as instanceMatrix
 *
 * Scene layout:
 *   Top row    — 8 boxes via individual <mesh> components (naive, for comparison)
 *   Bottom row — 8 boxes via a single InstancedMesh (one draw call)
 *   Far right  — 64 boxes in a grid via InstancedMesh with per-instance colors
 */

import { useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { InstancedMesh, Object3D, Color } from 'three'

const BOX_W = 0.8
const BOX_H = 0.8
const BOX_D = 0.8
const SPACING = 1.2  // center-to-center distance between adjacent boxes

// ─── Approach A: individual meshes (naive) ───────────────────────────────────
// Each <mesh> is a separate Three.js object with its own draw call.
// Fine for <10 objects. Unacceptable at hundreds.
// This creates 8 React components, 8 Three.js Mesh objects, 8 draw calls.
function NaiveMeshRow({ y = 0, count = 8 }: { y?: number; count?: number }) {
  return (
    // Render `count` individual meshes at evenly-spaced X positions.
    // Array.from creates [0, 1, 2, ..., count-1] to map over.
    <>
      {Array.from({ length: count }, (_, i) => (
        <mesh
          key={i}
          // Center the row on X=0 by subtracting half the total span.
          position={[i * SPACING - (count * SPACING) / 2, y, 0]}
        >
          <boxGeometry args={[BOX_W, BOX_H, BOX_D]} />
          {/*
            Each mesh gets its own material instance here. In production you'd
            share a material across meshes to reduce state changes, but this
            illustrates the "one object per box" problem clearly.
          */}
          <meshStandardMaterial color="tomato" />
        </mesh>
      ))}
    </>
  )
}

// ─── Approach B: InstancedMesh (correct approach) ────────────────────────────
// ONE Three.js object, ONE draw call, N instances.
// The geometry and material are shared — only the TRANSFORMS differ per instance.
function InstancedRow({ y = 0, count = 8 }: { y?: number; count?: number }) {
  // useRef stores a reference to the THREE.InstancedMesh object after R3F creates it.
  // The <instancedMesh> JSX below creates the object; useEffect then configures it.
  const ref = useRef<InstancedMesh>(null)

  useEffect(() => {
    if (!ref.current) return

    // Object3D is a lightweight scene-graph object used purely as a "dummy" to
    // compose transforms. We set position/rotation/scale on it, call
    // updateMatrix() to bake those into its .matrix property, then copy that
    // matrix into the InstancedMesh. We reuse ONE dummy across all instances
    // to avoid 'count' unnecessary allocations.
    const dummy = new Object3D()

    for (let i = 0; i < count; i++) {
      // Set the dummy's position to where instance i should appear.
      dummy.position.set(
        i * SPACING - (count * SPACING) / 2,  // centered on X
        y,                                      // Y from prop
        0                                       // flat on Z
      )

      // updateMatrix() computes dummy.matrix from position + rotation + scale.
      // This step is REQUIRED before reading dummy.matrix — the matrix is
      // only recalculated when you explicitly call updateMatrix() (it is NOT
      // automatically kept in sync with position/rotation/scale).
      dummy.updateMatrix()

      // Copy dummy.matrix into slot i of the InstancedMesh's matrix buffer.
      // Index must be 0 ≤ i < count (the count passed to InstancedMesh constructor).
      ref.current.setMatrixAt(i, dummy.matrix)
    }

    // REQUIRED: tells Three.js (and ultimately the GPU driver) that the
    // instanceMatrix buffer has changed and must be re-uploaded to the GPU.
    // Without this line, the GPU sees stale (identity) matrices and all
    // instances stack at the origin.
    ref.current.instanceMatrix.needsUpdate = true
  }, [y, count]) // re-run if y or count changes

  return (
    /*
      <instancedMesh> is the R3F primitive for THREE.InstancedMesh.
      args={[undefined, undefined, count]}:
        args[0] = geometry  (undefined here — supplied by <boxGeometry> child)
        args[1] = material  (undefined here — supplied by <meshStandardMaterial> child)
        args[2] = count     — MUST be set at construction, cannot change later.
                              Set it to the MAXIMUM number of instances you'll
                              ever need (or rebuild the mesh if the max changes).

      R3F attaches child geometry/material to the InstancedMesh via its reconciler.
    */
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      {/* All instances share this single geometry. */}
      <boxGeometry args={[BOX_W, BOX_H, BOX_D]} />
      {/* All instances share this single material (unless you use setColorAt). */}
      <meshStandardMaterial color="royalblue" />
    </instancedMesh>
  )
}

// ─── Approach C: InstancedMesh with per-instance colors ──────────────────────
// The main app needs different colors per box TYPE (colorIndex in the store).
// setColorAt() writes per-instance colors into instanceColor (a BufferAttribute).
// This does NOT require a separate material per color — the GPU reads the
// instanceColor buffer and multiplies it with the material's base color.
function ColoredGrid({ x = 0, cols = 8, rows = 8 }: { x?: number; cols?: number; rows?: number }) {
  const count = cols * rows
  const ref = useRef<InstancedMesh>(null)

  useEffect(() => {
    if (!ref.current) return
    const dummy = new Object3D()
    const color = new Color()  // reuse one Color object to avoid N allocations

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col

        dummy.position.set(
          x + col * SPACING,
          row * SPACING,
          0
        )
        dummy.updateMatrix()
        ref.current.setMatrixAt(i, dummy.matrix)

        // setColorAt(index, THREE.Color): sets the instance color for slot i.
        // hsl(hue, saturation, lightness) — hue cycling through 0–360 gives
        // a rainbow across the grid. This is analogous to how the main app
        // will assign a deterministic color per colorIndex.
        color.setHSL((i / count) % 1, 0.7, 0.55)
        ref.current.setColorAt(i, color)
      }
    }

    ref.current.instanceMatrix.needsUpdate = true

    // instanceColor might be null if no color was set before — guard required.
    // Once at least one setColorAt has been called, instanceColor exists.
    if (ref.current.instanceColor) {
      ref.current.instanceColor.needsUpdate = true
    }
  }, [x, cols, rows, count])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <boxGeometry args={[BOX_W, BOX_H, BOX_D]} />
      {/*
        meshStandardMaterial color="white" — the base color acts as a tint
        multiplier on top of instanceColor. White (1,1,1) means instanceColor
        passes through unchanged. A non-white base color would tint all instances.
      */}
      <meshStandardMaterial color="white" roughness={0.6} />
    </instancedMesh>
  )
}

// ─── Scene ───────────────────────────────────────────────────────────────────
export default function Lesson05Instancing() {
  return (
    <Canvas
      style={{ width: '100%', height: '100%' }}
      camera={{ fov: 50, position: [5, 5, 18] }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 10, 6]} intensity={1.2} />
      <OrbitControls />

      {/* Row at y=3: naive individual meshes (8 draw calls) */}
      <NaiveMeshRow y={3} count={8} />

      {/* Row at y=1.5: InstancedMesh (1 draw call) — visually identical */}
      <InstancedRow y={1.5} count={8} />

      {/*
        8×8 color grid (64 instances, 1 draw call).
        Positioned to the right so it doesn't overlap the rows.
        This is the closest thing to what InstancedBoxes.tsx will do in Phase 5:
        iterate placements, set position matrix + colorIndex-based color per instance.
      */}
      <ColoredGrid x={6} cols={8} rows={8} />

      <gridHelper args={[40, 40, '#333', '#222']} />
    </Canvas>
  )
}

// ─── QUESTIONS ───────────────────────────────────────────────────────────────
// Q1: The `count` passed to InstancedMesh must be set at construction and
//     cannot change afterwards. How should InstancedBoxes.tsx in the main app
//     handle the case where the user adds more boxes after the mesh is created?
//     (Think about what value to use for the initial count.)
//
// Q2: In ColoredGrid, the material color is set to "white". Change it to "red".
//     What happens to all the instance colors? Why?
//     Now change it to "black". What happens and why?
//
// Q3: updateMatrix() must be called before setMatrixAt() — but what if you
//     forget it? What do all instances look like, and why? Try it: comment out
//     dummy.updateMatrix() and observe the result.
//
// ANSWERS: (hidden — try yourself first)
// A1: The simplest approach is to set count to the TOTAL number of placements
//     returned by the packing result (which is known before rendering). If the
//     packing re-runs with a new result, unmount and remount the InstancedMesh
//     with the new count. In R3F this happens naturally when the `key` prop on
//     <instancedMesh> changes (e.g. key={placements.length} or key={packingId}).
//
// A2: "red" tints everything red — the instanceColor is multiplied component-wise
//     with the material color. (r:1, g:0, b:0) × instanceColor means the green
//     and blue channels are zeroed — all instances appear in red shades only.
//     "black" (r:0, g:0, b:0) multiplies everything to zero — all instances
//     go black regardless of instanceColor. White (1,1,1) is the identity for
//     color multiplication, letting instanceColor pass through unchanged.
//
// A3: Without updateMatrix(), dummy.matrix still holds the identity matrix
//     (no translation, no rotation, scale=1). setMatrixAt copies this identity
//     matrix into EVERY slot. All instances render as one cube stacked at the
//     group origin — you see only one box (they all overlap perfectly). The
//     Object3D.position/rotation/scale setters do NOT automatically update .matrix;
//     you must explicitly call updateMatrix() to bake them in.
// ─────────────────────────────────────────────────────────────────────────────

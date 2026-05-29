/**
 * LESSON 02 — Materials
 *
 * A material controls HOW a geometry's surface appears: color, shininess,
 * transparency, whether it responds to light, etc.
 *
 * The three materials you'll use most in this project:
 *
 *   meshBasicMaterial   — Flat, unlit. Color is always the same regardless of
 *                         lights. Useful for UI overlays, skyboxes, or when you
 *                         explicitly don't want shading.
 *
 *   meshStandardMaterial — PBR (Physically-Based Rendering). Responds to lights.
 *                          Has roughness and metalness properties. This is what
 *                          the packed boxes will use.
 *
 *   lineBasicMaterial   — For Line and LineSegments primitives. Cannot be applied
 *                         to a Mesh — it has no concept of faces. This is what
 *                         the wireframe containers use in the main app.
 *
 * Scene layout (left → right):
 *   -6  meshBasicMaterial (flat, ignores lights)
 *   -2  meshStandardMaterial, rough (matte)
 *    2  meshStandardMaterial, metallic + glossy
 *    6  meshStandardMaterial, semi-transparent (opacity)
 *
 *   Centre back: a LineSegments box using lineBasicMaterial
 */

import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { BoxGeometry, EdgesGeometry } from 'three'

// ─── meshBasicMaterial ───────────────────────────────────────────────────────
// Renders with a flat, constant color. No light interaction at all.
// If you remove all lights from the scene, only this box remains visible.
// Useful when you want exact color control, e.g. UI indicators.
function BasicBox({ x = 0 }: { x?: number }) {
  return (
    <mesh position={[x, 0, 0]}>
      <boxGeometry args={[1.5, 1.5, 1.5]} />
      {/*
        meshBasicMaterial: the simplest material — just outputs color.
        No roughness, no metalness, no response to scene lights.
        color can be a hex string, CSS name, or THREE.Color instance.
      */}
      <meshBasicMaterial color="#e39" />
    </mesh>
  )
}

// ─── meshStandardMaterial — matte ────────────────────────────────────────────
// roughness=1: completely matte — light scatters in all directions (diffuse).
// metalness=0: non-metallic — the highlight colour equals the light colour.
function MatteBox({ x = 0 }: { x?: number }) {
  return (
    <mesh position={[x, 0, 0]}>
      <boxGeometry args={[1.5, 1.5, 1.5]} />
      {/*
        roughness: 0 = mirror-smooth, 1 = completely matte.
        metalness: 0 = plastic/dielectric, 1 = metallic (reflections tinted by color).
      */}
      <meshStandardMaterial color="royalblue" roughness={1} metalness={1} />
    </mesh>
  )
}

// ─── meshStandardMaterial — glossy metallic ──────────────────────────────────
// roughness=0.1: very smooth surface, tight specular highlight.
// metalness=0.9: metallic — the base color tints the reflections.
function GlossyBox({ x = 0 }: { x?: number }) {
  return (
    <mesh position={[x, 0, 0]}>
      <boxGeometry args={[1.5, 1.5, 1.5]} />
      {/* <meshStandardMaterial color="gold" roughness={0.7} metalness={0.9} /> */}
      <meshStandardMaterial color="yellow" roughness={0.5} metalness={0.2} />
    </mesh>
  )
}

// ─── meshStandardMaterial — opacity / transparency ───────────────────────────
// Two flags MUST both be set to get a semi-transparent surface:
//   transparent={true} — tells the renderer to use alpha blending for this material.
//   opacity={0–1}     — 0 = invisible, 1 = opaque.
// If you set opacity without transparent={true}, the mesh stays fully opaque.
// If you set transparent without changing opacity, nothing changes (default opacity is 1).
function GlassBox({ x = 0 }: { x?: number }) {
  return (
    <mesh position={[x, 0, 0]}>
      <boxGeometry args={[1.5, 1.5, 1.5]} />
      {/*
        depthWrite={false}: prevents the transparent surface from writing to the
        depth buffer, which avoids sorting artefacts when multiple transparent
        objects overlap. For a single isolated transparent mesh it's optional, but
        it's a good habit to always pair it with transparent={true}.
      */}
      <meshStandardMaterial
        color="aquamarine"
        transparent={true}
        opacity={0.35}
        roughness={0.05}
        metalness={0.05}
        depthWrite={false}
      />
    </mesh>
  )
}

// ─── lineBasicMaterial on LineSegments ───────────────────────────────────────
// lineBasicMaterial can only be applied to Line, LineLoop, or LineSegments.
// It has no concept of faces — only colour and linewidth.
// (Note: linewidth > 1 is ignored on most platforms due to WebGL limitations.)
// This is EXACTLY what ContainerMesh.tsx uses for the wireframe containers.
function EdgeBox({ x = 0 }: { x?: number }) {
  // useMemo so the EdgesGeometry is only created once, not every render.
  // Without useMemo this would allocate new GPU geometry every frame — a memory leak.
  const edges = useMemo(() => {
    const box = new BoxGeometry(1.5, 1.5, 1.5)
    // EdgesGeometry takes a geometry and returns only its outer edges as segments.
    // See Lesson 03 for a deep dive on WHY we use EdgesGeometry over wireframe.
    const geo = new EdgesGeometry(box)
    // Dispose the source geometry immediately — we only needed it to derive edges.
    box.dispose()
    return geo
  }, [])

  return (
    /*
      lineSegments (lowercase) is the R3F primitive for THREE.LineSegments.
      It expects pairs of vertices: [start, end, start, end, ...].
      EdgesGeometry already outputs its vertices in this paired format.
    */
    <lineSegments position={[x, 0, 0]}>
      {/*
        Attaching the geometry object directly via <primitive>.
        The attach="geometry" prop tells R3F to set lineSegments.geometry = edges.
      */}
      <primitive object={edges} attach="geometry" />
      {/*
        lineBasicMaterial: the only material that works on Line/LineSegments.
        color: any valid Three.js color.
        linewidth: always 1 in WebGL (hardware limitation — ignored on most GPUs).
      */}
      <lineBasicMaterial color="white" />
    </lineSegments>
  )
}

// ─── Scene ───────────────────────────────────────────────────────────────────
export default function Lesson02Materials() {
  return (
    <Canvas
      style={{ width: '100%', height: '100%' }}
      camera={{ fov: 50, position: [0, 3, 12] }}
    >
      {/*
        These two lights are required for meshStandardMaterial to show colour.
        The BasicBox (meshBasicMaterial) and the EdgeBox (lineBasicMaterial) do NOT
        need lights — try removing these two lines and see which boxes go dark.
      */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[6, 10, 6]} intensity={1.5} />
      {/* Second light from the other side so the back faces aren't too dark */}
      <directionalLight position={[-4, 3, -4]} intensity={0.4} />

      <OrbitControls />

      {/* Four material demos, evenly spaced on X */}
      <BasicBox  x={-6} />   {/* flat, unlit */}
      <MatteBox  x={-2} />   {/* PBR, rough */}
      <GlossyBox x={2}  />   {/* PBR, metallic */}
      <GlassBox  x={6}  />   {/* PBR, transparent */}

      {/* LineSegments demo, slightly behind on Z so it doesn't overlap */}
      <EdgeBox   x={0}  />

      <gridHelper args={[24, 24, '#333', '#222']} />
    </Canvas>
  )
}

// ─── QUESTIONS ───────────────────────────────────────────────────────────────
// Q1: What happens to the BasicBox (meshBasicMaterial) if you delete both
//     <ambientLight> and <directionalLight> from the scene? What about the
//     MatteBox (meshStandardMaterial)? Why are the results different?
//
// Q2: Set GlassBox's opacity to 0.5 WITHOUT setting transparent={true}.
//     What do you see? Now add transparent={true} back. What changed?
//     Also try removing depthWrite={false} and overlapping two GlassBox
//     meshes — can you spot the sorting artefact?
//
// Q3: The main app uses lineBasicMaterial in ContainerMesh.tsx for the
//     container wireframe. Why can't it just use meshStandardMaterial with
//     wireframe={true} instead? (Hint: look at Lesson 03 for the full answer,
//     but think about what a wireframe flag does to the material first.)
//
// ANSWERS: (hidden — try yourself first)
// A1: BasicBox stays exactly the same colour — meshBasicMaterial ignores all
//     scene lights. MatteBox goes completely black — meshStandardMaterial
//     with zero light input outputs zero colour (it models physical reality).
//     This is the fundamental tradeoff: basic = predictable colour, standard =
//     realistic response to environment.
//
// A2: Without transparent={true}, opacity has no visible effect — the mesh
//     renders fully opaque regardless of the opacity value. The renderer only
//     enables alpha blending when transparent=true. Without depthWrite={false},
//     if two transparent boxes overlap, the one rendered last may incorrectly
//     occlude the other depending on depth buffer state — you'll see one face
//     pop in/out as you rotate the camera.
//
// A3: meshStandardMaterial with wireframe=true still IS a mesh material — it
//     renders triangle edges including the diagonal that splits each quad face
//     into two triangles. A box face has 2 triangles = 3 visible edges per face
//     instead of 4. EdgesGeometry + lineBasicMaterial renders only the 12 true
//     outer edges of the box. See Lesson 03 for a side-by-side comparison.
// ─────────────────────────────────────────────────────────────────────────────

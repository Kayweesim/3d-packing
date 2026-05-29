/**
 * THREE.js / R3F Learning Sandbox
 *
 * ─── HOW TO MOUNT ────────────────────────────────────────────────────────────
 * Temporarily edit src/main.tsx:
 *   1. Add import:   import Sandbox from './sandbox'
 *   2. Replace:      <App />  →  <Sandbox />
 *   3. Switch back to <App /> when done learning.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * ─── HOW TO SWITCH LESSONS ───────────────────────────────────────────────────
 * Uncomment exactly ONE import below, comment out the rest, then save.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * Lesson map:
 *   01 — BoxGeometry, SphereGeometry, CylinderGeometry, mesh = geometry + material
 *   02 — meshBasicMaterial vs meshStandardMaterial, opacity, lineBasicMaterial
 *   03 — wireframe material vs EdgesGeometry — why EdgesGeometry wins
 *   04 — X/Y/Z axes, center-origin anchoring, worldX offset pattern
 *   05 — InstancedMesh basics — one draw call for N boxes, matrix transforms
 */

// import ActiveLesson from './lessons/01-geometry'
// import ActiveLesson from './lessons/02-materials'
// import ActiveLesson from './lessons/03-edges'
// import ActiveLesson from './lessons/04-positioning'
import ActiveLesson from './lessons/05-instancing'

export default function Sandbox() {
  return (
    // Full-viewport dark container — same background as the main app.
    // Each lesson renders its own R3F <Canvas> which fills this div.
    <div style={{ width: '100vw', height: '100vh', background: '#0d0d0d' }}>
      <ActiveLesson />
    </div>
  )
}

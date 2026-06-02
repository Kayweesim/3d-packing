/**
 * Zustand Learning Sandbox
 *
 * ─── HOW TO MOUNT ────────────────────────────────────────────────────────────
 * Temporarily edit src/main.tsx:
 *   1. Add import:   import ZustandSandbox from './sandbox/zustand'
 *   2. Replace:      <App />  →  <ZustandSandbox />
 *   3. Switch back to <App /> when done learning.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * ─── HOW TO SWITCH LESSONS ───────────────────────────────────────────────────
 * Uncomment exactly ONE import below, comment out the rest, then save.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * Lesson map:
 *   01 — create(), interface, useStore, reading state, direct set
 *   02 — set updater function: set((s) => ...) vs set({ ... })
 *   03 — multiple fields, complex actions, resetting state
 *   04 — slices: StateCreator, combining slices, cross-slice access with get()
 *   05 — selectors: picking minimal state, preventing unnecessary re-renders
 */

// import ActiveLesson from './lessons/01-basic-store'
// import ActiveLesson from './lessons/02-updater-fn'
// import ActiveLesson from './lessons/03-actions'
// import ActiveLesson from './lessons/04-slices'
import ActiveLesson from './lessons/05-selectors'

export default function ZustandSandbox() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white p-8 font-mono text-sm">
      <ActiveLesson />
    </div>
  )
}

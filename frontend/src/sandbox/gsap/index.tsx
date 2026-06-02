/**
 * GSAP Learning Sandbox
 *
 * ─── HOW TO MOUNT ────────────────────────────────────────────────────────────
 * Temporarily edit src/main.tsx:
 *   1. Add import:   import GsapSandbox from './sandbox/gsap'
 *   2. Replace:      <App />  →  <GsapSandbox />
 *   3. Switch back to <App /> when done learning.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * ─── HOW TO SWITCH LESSONS ───────────────────────────────────────────────────
 * Uncomment exactly ONE import below, comment out the rest, then save.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * Lesson map:
 *   01 — gsap.to / gsap.from / gsap.fromTo — the three tween functions
 *   02 — gsap.timeline() — sequencing, position parameter, defaults
 *   03 — easing — power, back, bounce, elastic, none — visual comparison
 *   04 — React + GSAP — useRef, useEffect, gsap.context(), cleanup
 *   05 — Playback — play/pause/reverse/scrub/timeScale/onUpdate
 */

// import ActiveLesson from './lessons/01-basics'
// import ActiveLesson from './lessons/02-timeline'
// import ActiveLesson from './lessons/03-easing'
// import ActiveLesson from './lessons/04-react-refs'
import ActiveLesson from './lessons/05-playback'

export default function GsapSandbox() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white p-8 font-mono text-sm">
      <ActiveLesson />
    </div>
  )
}

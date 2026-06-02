/**
 * LESSON 03 — Easing: controlling acceleration
 *
 * An ease controls HOW an animation accelerates and decelerates over time.
 * With ease:'none' (linear), x moves at a constant rate.
 * With ease:'power2.out', it starts fast and slows to a stop — feels natural.
 *
 * NAMING CONVENTION: "family.direction"
 *
 *   Family:
 *     power1 / power2 / power3 / power4  — polynomial curves (most common)
 *     back    — overshoots the target then corrects back
 *     bounce  — bounces at the end like a ball dropping
 *     elastic — springy overshoot (more dramatic than back)
 *     circ    — circular arc (very fast start/end)
 *     expo    — exponential (extreme version of power)
 *     sine    — gentle sine wave curve
 *     none / linear — constant speed, no acceleration
 *
 *   Direction (for most families):
 *     .in     — starts slow, ends fast (accelerates into the target)
 *     .out    — starts fast, ends slow (decelerates into the target) ← most natural
 *     .inOut  — slow start, fast middle, slow end (symmetric)
 *
 * MOST USED IN PRACTICE:
 *   'power2.out'       — default feel, natural deceleration
 *   'power4.inOut'     — smooth professional transitions
 *   'back.out(1.7)'    — slight overshoot on arrival, energetic
 *   'none'             — constant rate (used in the main app for GSAP-to-Three bridge)
 *   'elastic.out(1,0.3)' — springy entrance
 *
 * The main app uses ease:'none' on the timeline that drives animState.current.progress
 * because the easing is applied PER BOX in useFrame (the Math.pow ease-out formula),
 * not at the timeline level. Two layers of easing would compound incorrectly.
 */

import React, { useRef } from 'react'
import gsap from 'gsap'

// ═══════════════════════════════════════════════════════════════════════════════
// WORKED EXAMPLE — Visual ease comparison
// All boxes travel the same distance (x: 0 → 220) in the same time (1.2s).
// Only the ease differs. Watch how they accelerate differently.
// ═══════════════════════════════════════════════════════════════════════════════

const EASES: { label: string; ease: string; color: string }[] = [
  { label: 'none (linear)',      ease: 'none',              color: 'bg-zinc-400' },
  { label: 'power1.in',          ease: 'power1.in',         color: 'bg-blue-400' },
  { label: 'power1.out',         ease: 'power1.out',        color: 'bg-blue-500' },
  { label: 'power1.inOut',       ease: 'power1.inOut',      color: 'bg-blue-600' },
  { label: 'power4.out',         ease: 'power4.out',        color: 'bg-indigo-500' },
  { label: 'back.out(1.7)',      ease: 'back.out(1.7)',     color: 'bg-violet-500' },
  { label: 'back.in(1.7)',       ease: 'back.in(1.7)',      color: 'bg-purple-500' },
  { label: 'bounce.out',         ease: 'bounce.out',        color: 'bg-emerald-500' },
  { label: 'elastic.out(1,0.3)', ease: 'elastic.out(1,0.3)',color: 'bg-amber-500' },
  { label: 'circ.out',           ease: 'circ.out',          color: 'bg-rose-500' },
]

function EaseRow({ label, ease, color }: { label: string; ease: string; color: string }) {
  const boxRef = useRef<HTMLDivElement>(null)

  // Exposed via a data attribute so the parent "Run All" button can trigger them.
  const animate = () => {
    gsap.fromTo(
      boxRef.current,
      { x: 0 },
      { x: 220, duration: 1.8, ease }
    )
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-zinc-500 text-[10px] w-36 shrink-0 text-right">{label}</span>
      <div className="flex-1 h-8 bg-zinc-800 rounded overflow-hidden flex items-center px-1">
        <div
          ref={boxRef}
          className={`w-8 h-6 ${color} rounded shrink-0 cursor-pointer`}
          onClick={animate}
          title={`Click to animate with ${ease}`}
        />
      </div>
    </div>
  )
}

function EaseComparison() {
  const rowRefs = useRef<Array<{ animate: () => void }>>([])

  // Animate all at the same time for direct comparison
  const runAll = () => {
    document.querySelectorAll('[data-ease-box]').forEach((el) => {
      const ease = el.getAttribute('data-ease')!
      gsap.fromTo(el, { x: 0 }, { x: 220, duration: 1.8, ease })
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {EASES.map(({ label, ease, color }) => (
          <div key={ease} className="flex items-center gap-3">
            <span className="text-zinc-500 text-[10px] w-40 shrink-0 text-right leading-tight">{label}</span>
            <div className="flex-1 h-8 bg-zinc-800 rounded relative overflow-hidden flex items-center px-1">
              <div
                data-ease-box
                data-ease={ease}
                className={`w-8 h-6 ${color} rounded shrink-0`}
              />
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={runAll}
        className="px-4 py-1.5 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-white transition-colors"
      >
        Run All
      </button>
      <p className="text-zinc-600 text-[10px]">
        All boxes travel the same distance in 1.8s — only the acceleration differs.
        Click "Run All" to compare them simultaneously.
      </p>
    </div>
  )
}

// ─── In vs Out vs InOut ───────────────────────────────────────────────────────
// A focused comparison of directions on the same family (power3)
function DirectionComparison() {
  const inRef    = useRef<HTMLDivElement>(null)
  const outRef   = useRef<HTMLDivElement>(null)
  const inoutRef = useRef<HTMLDivElement>(null)

  const run = () => {
    const opts = { x: 200, duration: 1.5 }
    gsap.fromTo(inRef.current,    { x: 0 }, { ...opts, ease: 'power3.in' })
    gsap.fromTo(outRef.current,   { x: 0 }, { ...opts, ease: 'power3.out' })
    gsap.fromTo(inoutRef.current, { x: 0 }, { ...opts, ease: 'power3.inOut' })
  }

  return (
    <div className="space-y-3">
      {[
        { ref: inRef,    label: 'power3.in    — slow start, fast end (like a launched rocket)',    color: 'bg-blue-400' },
        { ref: outRef,   label: 'power3.out   — fast start, slow end (like a braking car)',        color: 'bg-blue-600' },
        { ref: inoutRef, label: 'power3.inOut — slow start, fast middle, slow end (professional)', color: 'bg-indigo-500' },
      ].map(({ ref, label, color }) => (
        <div key={label} className="space-y-1">
          <p className="text-zinc-500 text-[10px]">{label}</p>
          <div className="h-8 bg-zinc-800 rounded overflow-hidden flex items-center px-1">
            <div ref={ref} className={`w-8 h-6 ${color} rounded shrink-0`} />
          </div>
        </div>
      ))}
      <button
        onClick={run}
        className="px-4 py-1.5 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-white transition-colors"
      >
        Run
      </button>
    </div>
  )
}

function WorkedExample() {
  return (
    <Section title="Worked Example — Ease Comparison">
      <p className="text-zinc-400 text-xs mb-6 leading-relaxed">
        All boxes travel the same distance in the same time. The only difference is the ease.
        Watch how each one accelerates and decelerates differently.
      </p>
      <EaseComparison />
      <div className="mt-8">
        <p className="text-zinc-400 text-xs mb-4">In / Out / InOut on the same family (power3):</p>
        <DirectionComparison />
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// YOUR TURN — Match the ease to the effect
// ═══════════════════════════════════════════════════════════════════════════════
//
// Four boxes need specific animation personalities. Fill in the ease for each.
// Hint: the descriptions tell you which family and direction to use.

function YourTurnExercise() {
  const aRef = useRef<HTMLDivElement>(null)
  const bRef = useRef<HTMLDivElement>(null)
  const cRef = useRef<HTMLDivElement>(null)
  const dRef = useRef<HTMLDivElement>(null)

  /**
 * LESSON 03 — Easing: controlling acceleration
 *
 * An ease controls HOW an animation accelerates and decelerates over time.
 * With ease:'none' (linear), x moves at a constant rate.
 * With ease:'power2.out', it starts fast and slows to a stop — feels natural.
 *
 * NAMING CONVENTION: "family.direction"
 *
 *   Family:
 *     power1 / power2 / power3 / power4  — polynomial curves (most common)
 *     back    — overshoots the target then corrects back
 *     bounce  — bounces at the end like a ball dropping
 *     elastic — springy overshoot (more dramatic than back)
 *     circ    — circular arc (very fast start/end)
 *     expo    — exponential (extreme version of power)
 *     sine    — gentle sine wave curve
 *     none / linear — constant speed, no acceleration
 *
 *   Direction (for most families):
 *     .in     — starts slow, ends fast (accelerates into the target)
 *     .out    — starts fast, ends slow (decelerates into the target) ← most natural
 *     .inOut  — slow start, fast middle, slow end (symmetric)
 *
 * MOST USED IN PRACTICE:
 *   'power2.out'       — default feel, natural deceleration
 *   'power4.inOut'     — smooth professional transitions
 *   'back.out(1.7)'    — slight overshoot on arrival, energetic
 *   'none'             — constant rate (used in the main app for GSAP-to-Three bridge)
 *   'elastic.out(1,0.3)' — springy entrance
 *
 * The main app uses ease:'none' on the timeline that drives animState.current.progress
 * because the easing is applied PER BOX in useFrame (the Math.pow ease-out formula),
 * not at the timeline level. Two layers of easing would compound incorrectly.
 */


  const run = () => {
    const dist = { x: 200, duration: 1.5 }
    gsap.fromTo(aRef.current, { x: 0 }, { ...dist,
      ease: 'bounce', // ??? replace: should feel like a ball BOUNCING at the end
    })
    gsap.fromTo(bRef.current, { x: 0 }, { ...dist,
      ease: 'back.out(1.5)', // ??? replace: should OVERSHOOT the target then snap back
    })
    gsap.fromTo(cRef.current, { x: 0 }, { ...dist,
      ease: 'none', // ??? replace: should be a perfectly constant rate (no acceleration)
    })
    gsap.fromTo(dRef.current, { x: 0 }, { ...dist,
      ease: 'elastic', // ??? replace: should feel springy/elastic on arrival
    })
  }

  return (
    <div className="space-y-4">
      {[
        { ref: aRef, label: 'A — bounces at the end like a dropped ball',    color: 'bg-emerald-500' },
        { ref: bRef, label: 'B — overshoots target slightly then settles',   color: 'bg-violet-500' },
        { ref: cRef, label: 'C — constant speed, no acceleration at all',    color: 'bg-zinc-400' },
        { ref: dRef, label: 'D — springy / elastic arrival',                 color: 'bg-amber-500' },
      ].map(({ ref, label, color }) => (
        <div key={label} className="space-y-1">
          <p className="text-zinc-400 text-[10px]">{label}</p>
          <div className="h-8 bg-zinc-800 rounded overflow-hidden flex items-center px-1">
            <div ref={ref} className={`w-8 h-6 ${color} rounded shrink-0`} />
          </div>
        </div>
      ))}
      <button
        onClick={run}
        className="px-4 py-1.5 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-white"
      >
        Run
      </button>
    </div>
  )
}

function YourTurn() {
  return (
    <Section title="Your Turn — Match the ease to the description">
      <p className="text-zinc-400 text-xs mb-6 leading-relaxed">
        Replace <Code>'none'</Code> in each animation with the correct ease string.
        Use the ease comparison above as a reference.
      </p>
      <YourTurnExercise />
    </Section>
  )
}

export default function Lesson03Easing() {
  return (
    <div className="max-w-2xl mx-auto space-y-10">
      <h1 className="text-lg font-semibold text-white">Lesson 03 — Easing</h1>
      <WorkedExample />
      <YourTurn />
    </div>
  )
}

// ─── QUESTIONS ───────────────────────────────────────────────────────────────
// Q1: The main app uses ease:'none' on the GSAP timeline, but the boxes still
//     appear to decelerate as they slide into position. How is that possible?
//
// Q2: back.out(1.7) — what does the number 1.7 control? Try changing it to
//     back.out(4) and back.out(0.5) and observe the difference.
//
// Q3: When would you use ease:'power2.in' (slow start, fast end) for a UI element?
//     Think about what feeling that creates for the user.
//
// ANSWERS: (hidden — try yourself first)
// A1: The ease is applied in two places — the GSAP timeline uses ease:'none'
//     (linear progress from 0 to totalCount), but inside useFrame in InstancedBoxes.tsx
//     there's a manual easing formula: `const eased = 1 - Math.pow(1 - t, 2)`
//     This is a quadratic ease-out applied to each box's individual progress (t).
//     Using ease:'none' at the timeline level keeps the progress ticking linearly,
//     so the per-box ease-out in useFrame works correctly without compounding.
//
// A2: The number is the "overshoot amount" (amplitude). 1.7 = slight overshoot,
//     4 = exaggerated overshoot (bounces far past the target), 0.5 = barely any
//     overshoot. Negative values would make it pull back before going forward.
//     The GSAP visualizer at gsap.com/ease-visualizer lets you see this live.
//
// A3: power2.in (slow start → fast end) feels like something being sucked away
//     or dismissed — an "exit" feeling. It's used for elements leaving the screen:
//     drawers closing, modals dismissing, notifications fading out. It feels like
//     the element is being pulled away rather than landing somewhere.
// ─────────────────────────────────────────────────────────────────────────────

// ─── ANSWERS FOR YOUR TURN ────────────────────────────────────────────────────
// A: ease: 'bounce.out'
// B: ease: 'back.out(1.7)'
// C: ease: 'none'
// D: ease: 'elastic.out(1, 0.3)'
// ─────────────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-zinc-300 font-semibold mb-4 border-b border-zinc-800 pb-2">{title}</h2>
      {children}
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="text-amber-400 bg-zinc-800 px-1 rounded text-xs">{children}</code>
}

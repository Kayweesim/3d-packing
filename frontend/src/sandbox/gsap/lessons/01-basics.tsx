/**
 * LESSON 01 — The three tween functions: to, from, fromTo
 *
 * A "tween" is a single animation between two states.
 * GSAP provides three functions to create tweens:
 *
 *   gsap.to(target, vars)
 *     Animates FROM the element's current state TO the values in vars.
 *     Most common — used when you know where it should end up.
 *
 *   gsap.from(target, vars)
 *     Animates FROM the values in vars TO the element's current state.
 *     Good for "enter" animations — element appears from off-screen or invisible.
 *
 *   gsap.fromTo(target, fromVars, toVars)
 *     Explicitly sets BOTH start and end. Gives you full control.
 *     Use when you want the animation to be identical every time it runs
 *     regardless of where the element currently is.
 *
 * KEY VARS PROPERTIES:
 *   duration  — seconds (default 0.5)
 *   ease      — easing function (default "power1.out") — see Lesson 03
 *   delay     — seconds before animation starts
 *   x / y     — translate in pixels (like CSS transform: translateX)
 *   rotation  — degrees
 *   scale     — multiplier (1 = original, 2 = double size)
 *   opacity   — 0 to 1
 *   repeat    — number of times to repeat (-1 = infinite)
 *   yoyo      — if true, alternates direction on repeat
 *
 * TARGET: can be a DOM element, a CSS selector string, or a ref.current.
 */

import React, { useRef } from 'react'
import gsap from 'gsap'

// ═══════════════════════════════════════════════════════════════════════════════
// WORKED EXAMPLE — to / from / fromTo side by side
// ═══════════════════════════════════════════════════════════════════════════════

function ToDemo() {
  const boxRef = useRef<HTMLDivElement>(null)

  const run = () => {
    // gsap.to: animates from current position TO x:200
    // The box starts wherever it currently is and slides right.
    gsap.to(boxRef.current, { x: 200, duration: 1, ease: 'power6.out' })
  }

  const reset = () => {
    // gsap.set: instant snap with no animation — used for resets
    gsap.set(boxRef.current, { x: 0 })
  }

  return (
    <DemoRow label="gsap.to() — animates TO a target value">
      <div className="relative h-14 bg-zinc-800 rounded overflow-hidden flex items-center px-2">
        <Box ref={boxRef} color="bg-blue-500" label="to" />
      </div>
      <BtnRow onRun={run} onReset={reset} />
      <Note>Box slides right. Click Run again without Reset — it stays put (already there).</Note>
    </DemoRow>
  )
}

function FromDemo() {
  const boxRef = useRef<HTMLDivElement>(null)

  const run = () => {
    // gsap.from: starts AT x:-150 and animates TO the element's current position (x:0)
    // The element's natural position is x:0 — from() enters it from off-screen left.
    gsap.from(boxRef.current, { x: -150, opacity: 0, duration: 1, ease: 'power2.out' })
  }

  const reset = () => {
    gsap.set(boxRef.current, { x: 0, opacity: 1 })
  }

  return (
    <DemoRow label="gsap.from() — enters FROM a value to current position">
      <div className="relative h-14 bg-zinc-800 rounded overflow-hidden flex items-center px-2">
        <Box ref={boxRef} color="bg-emerald-500" label="from" />
      </div>
      <BtnRow onRun={run} onReset={reset} />
      <Note>Box enters from the left. The final position is wherever it sits in the DOM.</Note>
    </DemoRow>
  )
}

function FromToDemo() {
  const boxRef = useRef<HTMLDivElement>(null)

  const run = () => {
    // gsap.fromTo: explicitly define BOTH start and end
    // Doesn't matter where the element currently is — it always starts at x:-100
    gsap.fromTo(
      boxRef.current,
      { x: 150,  opacity: 1, scale: 1, duration: 1, ease: 'back.out(1.7)' },  // toVars — ending state
      { x: -100, opacity: 0, scale: 0.5 },     // fromVars — starting state

    )
  }

  const reset = () => {
    gsap.set(boxRef.current, { x: 0, opacity: 1, scale: 1 })
  }

  return (
    <DemoRow label="gsap.fromTo() — explicit start AND end">
      <div className="relative h-14 bg-zinc-800 rounded overflow-hidden flex items-center px-2">
        <Box ref={boxRef} color="bg-violet-500" label="fromTo" />
      </div>
      <BtnRow onRun={run} onReset={reset} />
      <Note>Always starts from x:-100 regardless of current position. back.out(1.7) overshoots slightly.</Note>
    </DemoRow>
  )
}

// Multiple properties at once
function MultiPropDemo() {
  const boxRef = useRef<HTMLDivElement>(null)

  const run = () => {
    // Multiple properties animate simultaneously in one tween.
    gsap.to(boxRef.current, {
      x:        180,
      rotation: 360,
      scale:    1.4,
      opacity:  0.6,
      duration: 1.2,
      ease:     'power1.inOut',
      yoyo: true,
      repeat: 3
    })
  }

  const reset = () => {
    gsap.set(boxRef.current, { x: 0, rotation: 0, scale: 1, opacity: 1 })
  }

  return (
    <DemoRow label="Multiple properties — x, rotation, scale, opacity together">
      <div className="relative h-16 bg-zinc-800 rounded overflow-hidden flex items-center px-2">
        <Box ref={boxRef} color="bg-amber-500" label="multi" />
      </div>
      <BtnRow onRun={run} onReset={reset} />
      <Note>All properties animate in parallel within the same tween. duration applies to all.</Note>
    </DemoRow>
  )
}

function WorkedExample() {
  return (
    <Section title="Worked Example — to / from / fromTo">
      <p className="text-zinc-400 text-xs mb-6 leading-relaxed">
        Click <Code>Run</Code> to trigger each animation. Click <Code>Reset</Code> to snap back
        (using <Code>gsap.set</Code> — instant, no animation).
      </p>
      <div className="space-y-6">
        <ToDemo />
        <FromDemo />
        <FromToDemo />
        <MultiPropDemo />
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// YOUR TURN — Three separate exercises
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Exercise A ───────────────────────────────────────────────────────────────
// The box should slide in from below (y: +100) and fade in.
// Fill in the gsap.from() call.
function ExerciseA() {
  const boxRef = useRef<HTMLDivElement>(null)

  const run = () => {
    // ??? fill in: use gsap.from to animate the box from y:100, opacity:0
    // to its current position over 0.8 seconds
    gsap.from(boxRef.current, { y: 100, opacity: 0, duration: 0.8, ease: 'power2.out' })  // ??? fill in the vars object
  }

  const reset = () => gsap.set(boxRef.current, { y: 0, opacity: 1 })

  return (
    <DemoRow label="Exercise A — box enters from below (gsap.from)">
      <div className="h-20 bg-zinc-800 rounded overflow-hidden flex items-end justify-start px-2 pb-2">
        <Box ref={boxRef} color="bg-sky-500" label="A" />
      </div>
      <BtnRow onRun={run} onReset={reset} />
      <Note>Should slide up from below and fade in.</Note>
    </DemoRow>
  )
}

// ─── Exercise B ───────────────────────────────────────────────────────────────
// The box should shrink to nothing (scale:0) and disappear (opacity:0).
// Fill in the gsap.to() call — this is an "exit" animation.
function ExerciseB() {
  const boxRef = useRef<HTMLDivElement>(null)

  const run = () => {
    // ??? fill in: use gsap.to to animate scale to 0 and opacity to 0
    gsap.to(boxRef.current, {scale: 0, opacity: 0})  // ??? fill in the vars object
  }

  const reset = () => gsap.set(boxRef.current, { scale: 1, opacity: 1 })

  return (
    <DemoRow label="Exercise B — box shrinks and disappears (gsap.to)">
      <div className="h-14 bg-zinc-800 rounded overflow-hidden flex items-center px-2">
        <Box ref={boxRef} color="bg-rose-500" label="B" />
      </div>
      <BtnRow onRun={run} onReset={reset} />
      <Note>Should shrink to scale:0 and fade out. Hit Reset to bring it back.</Note>
    </DemoRow>
  )
}

// ─── Exercise C ───────────────────────────────────────────────────────────────
// The box should bounce between x:0 and x:200, repeating 3 times,
// alternating direction (yoyo). Fill in the gsap.fromTo() call.
function ExerciseC() {
  const boxRef = useRef<HTMLDivElement>(null)

  const run = () => {
    // ??? fill in: gsap.fromTo from x:0 to x:200, repeat:3, yoyo:true
    // use ease:'power1.inOut', duration: 0.6
    gsap.fromTo(boxRef.current, {}, {})  // ??? fill in fromVars and toVars
  }

  const reset = () => gsap.set(boxRef.current, { x: 0 })

  return (
    <DemoRow label="Exercise C — bouncing back and forth (gsap.fromTo + yoyo)">
      <div className="relative h-14 bg-zinc-800 rounded overflow-hidden flex items-center px-2">
        <Box ref={boxRef} color="bg-orange-500" label="C" />
      </div>
      <BtnRow onRun={run} onReset={reset} />
      <Note>Should slide right then back, 3 times. Use repeat:3 and yoyo:true.</Note>
    </DemoRow>
  )
}

function YourTurn() {
  return (
    <Section title="Your Turn">
      <p className="text-zinc-400 text-xs mb-6 leading-relaxed">
        Fill in the GSAP call in each exercise. The box is wired up — you just need to
        provide the right arguments.
      </p>
      <div className="space-y-6">
        <ExerciseA />
        <ExerciseB />
        <ExerciseC />
      </div>
    </Section>
  )
}

export default function Lesson01Basics() {
  return (
    <div className="max-w-2xl mx-auto space-y-10">
      <h1 className="text-lg font-semibold text-white">Lesson 01 — GSAP Basics: to / from / fromTo</h1>
      <WorkedExample />
      <YourTurn />
    </div>
  )
}

// ─── QUESTIONS ───────────────────────────────────────────────────────────────
// Q1: gsap.to moves to a target value. What happens if you call gsap.to twice
//     in a row with different x values without resetting? Try it — click Run
//     on the ToDemo twice quickly. What does GSAP do?
//
// Q2: gsap.set() is used for instant resets. What do you think gsap.set is
//     internally? (Hint: it's the same as gsap.to with a specific duration.)
//
// Q3: In the main app's InstancedBoxes.tsx, boxes animate from entryZ (outside
//     the container door) to finalZ (their packed position). Which of the three
//     tween functions is used — to, from, or fromTo? Why that one specifically? To, because the final position is TO where it is
//
// ANSWERS: (hidden — try yourself first)
// A1: GSAP kills the first tween and starts the second immediately. This is the
//     default "overwrite" behaviour — new tweens targeting the same property on
//     the same element automatically overwrite in-progress tweens. You can
//     control this with the `overwrite` property.
//
// A2: gsap.set() is exactly gsap.to() with duration:0. It jumps to the target
//     values in zero time — same machinery, just no interpolation. You could
//     write gsap.to(el, { x: 0, duration: 0 }) and get the same result.
//
// A3: The main app uses a GSAP timeline with .to() on a plain JS object
//     (animState.current.progress). It doesn't animate the DOM element directly —
//     instead it animates a number, and useFrame reads that number every frame
//     to compute where each box should be. This decouples GSAP from Three.js.
// ─────────────────────────────────────────────────────────────────────────────

// ─── ANSWERS FOR YOUR TURN ────────────────────────────────────────────────────
// A: gsap.from(boxRef.current, { y: 100, opacity: 0, duration: 0.8, ease: 'power2.out' })
//
// B: gsap.to(boxRef.current, { scale: 0, opacity: 0, duration: 0.6, ease: 'power2.in' })
//
// C: gsap.fromTo(boxRef.current,
//      { x: 0 },
//      { x: 200, duration: 0.6, ease: 'power1.inOut', repeat: 3, yoyo: true }
//    )
// ─────────────────────────────────────────────────────────────────────────────

// ─── SHARED UI HELPERS ────────────────────────────────────────────────────────

const Box = React.forwardRef<HTMLDivElement, { color: string; label: string }>(
  ({ color, label }, ref) => (
    <div
      ref={ref}
      className={`w-15 h-10 ${color} rounded flex items-center justify-center text-white text-xs font-bold shrink-0`}
    >
      {label}
    </div>
  )
)

function DemoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-zinc-400 text-xs">{label}</p>
      {children}
    </div>
  )
}

function BtnRow({ onRun, onReset }: { onRun: () => void; onReset: () => void }) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onRun}
        className="px-3 py-1 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-white transition-colors"
      >
        Run
      </button>
      <button
        onClick={onReset}
        className="px-3 py-1 rounded text-xs font-medium border border-zinc-700 text-zinc-400 hover:text-white transition-colors"
      >
        Reset
      </button>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-zinc-600 text-[10px]">{children}</p>
}

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

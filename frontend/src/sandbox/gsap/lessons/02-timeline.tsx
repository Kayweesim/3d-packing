/**
 * LESSON 02 — gsap.timeline(): sequencing animations
 *
 * A timeline groups multiple tweens into a sequence that plays as one unit.
 * Without a timeline you'd need nested callbacks or delay calculations.
 * With a timeline, each tween is placed relative to the others.
 *
 * BASIC USAGE:
 *   const tl = gsap.timeline()
 *   tl.to(a, { x: 100, duration: 0.5 })   // plays first
 *   tl.to(b, { x: 100, duration: 0.5 })   // plays after a finishes
 *   tl.to(c, { x: 100, duration: 0.5 })   // plays after b finishes
 *
 * THE POSITION PARAMETER (3rd argument):
 *   The most powerful feature — controls WHEN in the timeline each tween starts.
 *
 *   tl.to(el, vars)          — default: starts when the previous tween ends
 *   tl.to(el, vars, "<")     — starts at the SAME TIME as the previous tween
 *   tl.to(el, vars, "<0.2")  — starts 0.2s AFTER the previous tween started
 *   tl.to(el, vars, "+=0.3") — starts 0.3s AFTER the previous tween ended (gap)
 *   tl.to(el, vars, "-=0.2") — starts 0.2s BEFORE the previous tween ends (overlap)
 *   tl.to(el, vars, 1.5)     — starts at absolute time 1.5s from timeline start
 *   tl.to(el, vars, "step1") — starts at the label "step1"
 *
 * DEFAULTS:
 *   gsap.timeline({ defaults: { duration: 0.4, ease: 'power2.out' } })
 *   Every tween in this timeline inherits those defaults — no need to repeat them.
 *
 * CONTROL METHODS:
 *   tl.play()    tl.pause()    tl.reverse()    tl.restart()
 *   tl.progress(0–1)   tl.timeScale(n)
 *   These are covered in depth in Lesson 05.
 */

import React, { useRef } from 'react'
import gsap from 'gsap'

// ═══════════════════════════════════════════════════════════════════════════════
// WORKED EXAMPLE A — Basic sequence (default position)
// ═══════════════════════════════════════════════════════════════════════════════

function SequenceDemo() {
  const aRef = useRef<HTMLDivElement>(null)
  const bRef = useRef<HTMLDivElement>(null)
  const cRef = useRef<HTMLDivElement>(null)

  const run = () => {
    gsap.set([aRef.current, bRef.current, cRef.current], { x: 0, opacity: 1 })

    const tl = gsap.timeline()

    // Default position: each tween starts when the previous one ends.
    // Total duration = 0.4 + 0.4 + 0.4 = 1.2 seconds
    tl.to(aRef.current, { x: 200, duration: 0.4, ease: 'power2.out' })
    tl.to(bRef.current, { x: 200, duration: 0.4, ease: 'power2.out' })
    tl.to(cRef.current, { x: 200, duration: 0.4, ease: 'power2.out' })
  }

  return (
    <DemoRow label="Default: each tween starts when the previous ends (sequential)">
      <Stage>
        <Box ref={aRef} color="bg-blue-500" label="A" />
        <Box ref={bRef} color="bg-emerald-500" label="B" />
        <Box ref={cRef} color="bg-violet-500" label="C" />
      </Stage>
      <BtnRow onRun={run} />
      <Note>A → B → C one after the other. Total: 1.2s</Note>
    </DemoRow>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORKED EXAMPLE B — Position parameter
// ═══════════════════════════════════════════════════════════════════════════════

function PositionDemo() {
  const aRef = useRef<HTMLDivElement>(null)
  const bRef = useRef<HTMLDivElement>(null)
  const cRef = useRef<HTMLDivElement>(null)
  const dRef = useRef<HTMLDivElement>(null)

  const run = () => {
    gsap.set([aRef.current, bRef.current, cRef.current, dRef.current], { x: 0, opacity: 1 })

    const tl = gsap.timeline()

    tl.to(aRef.current, { x: 180, duration: 0.6 })
    // "<" — starts at the SAME TIME as A. A and B animate simultaneously.
    tl.to(bRef.current, { x: 180, duration: 0.4 }, '<')
    // "<0.3" — starts 0.3s after A started (0.3s into A's animation)
    tl.to(dRef.current, { x: 180, duration: 0.5 }, '+=0.2')
    tl.to(cRef.current, { x: 180, duration: 0.4 }, '<0.3')
    // "+=0.2" — starts 0.2s AFTER the previous tween (C) ends. Gap between C and D.
  }

  return (
    <DemoRow label='Position parameter: "<" simultaneous, "<0.3" offset, "+=0.2" gap'>
      <Stage>
        <Box ref={aRef} color="bg-blue-500"    label="A" />
        <Box ref={bRef} color="bg-emerald-500" label='B "<"' />
        <Box ref={cRef} color="bg-violet-500"  label='C "<0.3"' />
        <Box ref={dRef} color="bg-amber-500"   label='D "+=0.2"' />
      </Stage>
      <BtnRow onRun={run} />
      <Note>A+B start together. C starts 0.3s into A. D starts 0.2s after C ends.</Note>
    </DemoRow>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORKED EXAMPLE C — Defaults + labels
// ═══════════════════════════════════════════════════════════════════════════════

function DefaultsDemo() {
  const boxRefs = useRef<(HTMLDivElement | null)[]>([])

  const run = () => {
    boxRefs.current.forEach((el) => gsap.set(el, { x: 0, opacity: 1, scale: 1 }))

    // defaults: applied to every tween in this timeline unless overridden.
    // No need to repeat duration: 0.35 and ease: 'back.out(1.4)' on every tween.
    const tl = gsap.timeline({
      defaults: { duration: 0.35, ease: 'back.out(1.4)' },
    })

    // Add label — marks a specific point in the timeline.
    // tl.play('enter') would start from here.
    tl.addLabel('enter')

    boxRefs.current.forEach((el, i) => {
      // "<0.08" — each box starts 0.08s after the previous one started (stagger effect)
      // duration and ease are inherited from defaults — not repeated here
      tl.from(el, { x: -120, opacity: 0 }, i === 0 ? 'enter' : '<0.08')
    })
  }

  return (
    <DemoRow label="Defaults + stagger via position offset — 5 boxes enter from left">
      <Stage tall>
        {[0, 1, 2, 3, 4].map((i) => (
          <Box
            key={i}
            ref={(el) => { boxRefs.current[i] = el }}
            color={COLORS[i]}
            label={String(i + 1)}
          />
        ))}
      </Stage>
      <BtnRow onRun={run} />
      <Note>All 5 boxes use the same duration+ease from defaults. Stagger = "0.08" offset.</Note>
    </DemoRow>
  )
}

function WorkedExample() {
  return (
    <Section title="Worked Example — Timeline sequencing">
      <p className="text-zinc-400 text-xs mb-6 leading-relaxed">
        The <Code>position parameter</Code> is the 3rd argument to <Code>tl.to()</Code>.
        It controls when in the timeline each tween starts.
      </p>
      <div className="space-y-8">
        <SequenceDemo />
        <PositionDemo />
        <DefaultsDemo />
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// YOUR TURN — Build a box-loading animation
// ═══════════════════════════════════════════════════════════════════════════════
//
// Animate 4 boxes entering a "container" (the grey area) one by one.
// Requirements:
//   1. Boxes enter from the RIGHT (positive x, outside the container)
//   2. Each box starts 0.15s after the previous one started (use "<0.15")
//   3. All boxes use duration: 0.5, ease: 'power2.out' (set via defaults)
//   4. After all boxes are in, fade the container label from opacity:0 to 1
//      (add it as a final tween on the timeline, 0.3s after the last box)

function YourTurnDemo() {
  const containerRef = useRef<HTMLDivElement>(null)
  const labelRef     = useRef<HTMLDivElement>(null)
  const boxRefs      = useRef<(HTMLDivElement | null)[]>([])

  const run = () => {
    // Reset
    boxRefs.current.forEach((el) => gsap.set(el, { x: 0, opacity: 1 }))
    gsap.set(labelRef.current, { opacity: 0 })

    // ??? Create a timeline with defaults: { duration: 0.5, ease: 'power2.out' }
    const tl = gsap.timeline({ duration: 0.5, ease: 'power2.out' })

    // ??? Animate each box FROM x:200 opacity:0 with "<0.15" position offset
    boxRefs.current.forEach((el, i) => {
      tl.from(el, {x:200, opacity: 0}, i === 0 ? '>' : '<0.15')
    })

    // ??? After the last box, fade in the label (opacity: 1) with a "+=0.3" delay
    tl.to(labelRef.current, {opacity: 1}, '+=0.3')
  }

  return (
    <DemoRow label="Your Turn — boxes enter from right, label fades in last">
      <div
        ref={containerRef}
        className="relative h-24 bg-zinc-800 rounded border border-zinc-700 overflow-hidden flex flex-col items-start justify-center gap-1 px-3"
      >
        <div ref={labelRef} className="absolute top-2 right-3 text-zinc-500 text-[10px] opacity-0">
          loaded ✓
        </div>
        {[0, 1, 2, 3].map((i) => (
          <Box
            key={i}
            ref={(el) => { boxRefs.current[i] = el }}
            color={COLORS[i]}
            label={`box ${i + 1}`}
            wide
          />
        ))}
      </div>
      <BtnRow onRun={run} />
      <Note>Boxes should slide in from right one by one. "loaded ✓" fades in after.</Note>
    </DemoRow>
  )
}

function YourTurn() {
  return (
    <Section title="Your Turn — Box Loading Animation">
      <p className="text-zinc-400 text-xs mb-6 leading-relaxed">
        Fill in the timeline. Use <Code>defaults</Code>, <Code>tl.from()</Code> with the
        position parameter, and a final <Code>tl.to()</Code> for the label.
      </p>
      <YourTurnDemo />
    </Section>
  )
}

export default function Lesson02Timeline() {
  return (
    <div className="max-w-2xl mx-auto space-y-10">
      <h1 className="text-lg font-semibold text-white">Lesson 02 — Timeline & Position Parameter</h1>
      <WorkedExample />
      <YourTurn />
    </div>
  )
}

// ─── QUESTIONS ───────────────────────────────────────────────────────────────
// Q1: What is the total duration of a timeline where:
//     tl.to(a, { duration: 1 })
//     tl.to(b, { duration: 1 }, "<")
//     tl.to(c, { duration: 1 }, "+=0.5")
//     Calculate it before running the code.
//
// Q2: In DefaultsDemo, we use "<0.08" on each box for a manual stagger.
//     GSAP has a built-in `stagger` property: gsap.to(".box", { x: 100, stagger: 0.08 })
//     Why do we use the manual timeline approach in the main app instead?
//
// Q3: What does addLabel() do and when would you use it over an absolute time?
//
// ANSWERS: (hidden — try yourself first)
// A1: a starts at 0, ends at 1.
//     b starts at same time as a ("< "), ends at 1.
//     The "previous tween" for "+=0.5" is b, which ends at 1.
//     c starts at 1 + 0.5 = 1.5, ends at 2.5.
//     Total duration = 2.5 seconds.
//
// A2: The main app animates InstancedMesh instances — there's no CSS selector
//     to target. Each instance is a Three.js matrix, not a DOM element.
//     gsap.stagger works on DOM element arrays. The manual "<0.08" offset
//     approach works with any target including plain JS objects.
//     Also, the app needs to control each placement's timing via globalIndex,
//     which is more complex than a uniform stagger.
//
// A3: addLabel() marks a named point in time. You can then jump to it:
//     tl.play('enter') or use it as a position: tl.to(el, vars, 'enter+=0.2').
//     Use labels when the meaningful moment is semantic (e.g. 'boxesIn',
//     'labelVisible') rather than a hardcoded number that breaks if you
//     change earlier durations.
// ─────────────────────────────────────────────────────────────────────────────

// ─── ANSWERS FOR YOUR TURN ────────────────────────────────────────────────────
// const tl = gsap.timeline({ defaults: { duration: 0.5, ease: 'power2.out' } })
//
// boxRefs.current.forEach((el, i) => {
//   tl.from(el, { x: 200, opacity: 0 }, i === 0 ? '>' : '<0.15')
// })
//
// tl.to(labelRef.current, { opacity: 1 }, '+=0.3')
// ─────────────────────────────────────────────────────────────────────────────

// ─── SHARED UI HELPERS ────────────────────────────────────────────────────────

const COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500']

const Box = React.forwardRef<HTMLDivElement, { color: string; label: string; wide?: boolean }>(
  ({ color, label, wide }, ref) => (
    <div
      ref={ref}
      className={`${wide ? 'w-28 h-6' : 'w-12 h-10'} ${color} rounded flex items-center justify-center text-white text-xs font-bold shrink-0`}
    >
      {label}
    </div>
  )
)

function Stage({ children, tall }: { children: React.ReactNode; tall?: boolean }) {
  return (
    <div className={`relative ${tall ? 'h-36' : 'h-16'} bg-zinc-800 rounded overflow-hidden flex ${tall ? 'flex-col justify-center gap-1' : 'items-center'} px-2 gap-1`}>
      {children}
    </div>
  )
}

function DemoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-zinc-400 text-xs">{label}</p>
      {children}
    </div>
  )
}

function BtnRow({ onRun }: { onRun: () => void }) {
  return (
    <button
      onClick={onRun}
      className="px-3 py-1 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-white transition-colors"
    >
      Run
    </button>
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

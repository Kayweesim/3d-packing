/**
 * LESSON 04 — GSAP + React: useRef, useEffect, gsap.context()
 *
 * In the previous lessons you called gsap.to() inside click handlers.
 * That works for on-demand animations but GSAP is often needed on mount
 * (entrance animations) or when props change (reactive animations).
 *
 * THREE RULES for GSAP in React:
 *
 *   1. Target elements via useRef — never query the DOM directly (querySelector).
 *      React controls the DOM; you should too.
 *
 *   2. Run GSAP inside useEffect — the DOM element only exists after mount.
 *      If you call gsap.to(ref.current) at the top level of a component,
 *      ref.current is null because the element hasn't been created yet.
 *
 *   3. Always clean up — return a cleanup function from useEffect.
 *      Use gsap.context() which automatically kills all tweens scoped to it.
 *      Without cleanup, React StrictMode (which mounts/unmounts twice) will
 *      leak animations and create ghost tweens.
 *
 * GSAP CONTEXT:
 *   const ctx = gsap.context(() => {
 *     gsap.to(ref.current, { x: 100 })
 *   }, ref)  // ← scoping ref: all animations targeting children of ref are tracked
 *
 *   return () => ctx.revert()  // kills all tracked animations and resets styles
 *
 * DEPENDENCY ARRAY:
 *   useEffect(() => { ... }, [])        — runs once on mount
 *   useEffect(() => { ... }, [value])   — re-runs when value changes
 *   useEffect(() => { ... })            — runs after every render (dangerous with GSAP)
 */

import React, { useRef, useEffect, useState } from 'react'
import gsap from 'gsap'

// ═══════════════════════════════════════════════════════════════════════════════
// WORKED EXAMPLE A — Mount animation (runs once when component appears)
// ═══════════════════════════════════════════════════════════════════════════════

function MountAnimation() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // gsap.context scopes all animations to containerRef.
    // It tracks every tween created inside the callback.
    const ctx = gsap.context(() => {
      // ".box" selector works WITHIN containerRef — no global DOM query needed.
      gsap.from('.box', {
        y:        40,
        opacity:  0,
        duration: 0.5,
        stagger:  0.1,   // stagger: each element starts 0.1s after the previous
        ease:     'power2.out',
      })
    }, containerRef)


    // Cleanup: kills all tweens scoped to ctx and resets animated styles.
    // React StrictMode mounts → unmounts → remounts, so this runs twice.
    // Without cleanup the second mount would have ghost tweens from the first.
    return () => ctx.revert()
  }, [])  // [] = run once on mount, never re-run

  return (
    <div ref={containerRef} className="flex gap-2 p-4 bg-zinc-900 rounded border border-zinc-800">
      {['A', 'B', 'C', 'D'].map((label) => (
        <div
          key={label}
          className="box w-12 h-12 bg-red-500 rounded flex items-center justify-center text-white font-bold text-sm"
        >
          {label}
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORKED EXAMPLE B — Reactive animation (re-runs when a value changes)
// ═══════════════════════════════════════════════════════════════════════════════

function ReactiveAnimation() {
  const boxRef  = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)

  // This effect re-runs whenever `active` changes.
  // Each time it runs, it kills the previous animation (via ctx.revert)
  // before starting the new one — no overlapping tweens.
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.to(boxRef.current, {
        x:        active ? 180 : 0,
        scale:    active ? 1.2 : 1,
        backgroundColor: active ? '#10b981' : '#3b82f6',
        duration: 0.4,
        ease:     'power2.inOut',
      })
    })
    return () => ctx.revert()
  }, [active])  // re-runs when active changes

  return (
    <div className="space-y-3">
      <div className="relative h-16 bg-zinc-900 rounded border border-zinc-800 overflow-hidden flex items-center px-2">
        <div
          ref={boxRef}
          className="w-12 h-10 bg-blue-500 rounded flex items-center justify-center text-white text-xs font-bold"
        >
          {active ? 'ON' : 'OFF'}
        </div>
      </div>
      <button
        onClick={() => setActive((v) => !v)}
        className="px-4 py-1.5 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-white"
      >
        Toggle ({active ? 'ON' : 'OFF'})
      </button>
      <Note>Animation re-runs every time active flips. The box slides + changes colour.</Note>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORKED EXAMPLE C — Animating a plain JS object (the main app pattern)
// ═══════════════════════════════════════════════════════════════════════════════
// The main app doesn't animate DOM elements — it animates a plain JS object
// (animState.current.progress) and reads that value every frame in useFrame.
// This is how you bridge GSAP to non-DOM targets like Three.js or Canvas.

function JsObjectAnimation() {
  const progressRef = useRef({ value: 0 })
  const displayRef  = useRef<HTMLDivElement>(null)
  const tlRef       = useRef<gsap.core.Timeline | null>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Animate a plain JS object — GSAP can tween any numeric property on any object.
      // This is EXACTLY what InstancedBoxes.tsx does with animState.current.progress.
      tlRef.current = gsap.timeline({ paused: true })
      tlRef.current.to(progressRef.current, {
        value:    100,
        duration: 2,
        ease:     'none',  // linear — per-item easing is applied separately (see Lesson 03 Q1)
        onUpdate: () => {
          // onUpdate fires every frame while the tween is playing.
          // Read the animated value and push it to the DOM manually.
          if (displayRef.current) {
            displayRef.current.style.width = `${progressRef.current.value}%`
            displayRef.current.textContent = `${Math.round(progressRef.current.value)}%`
          }
        },
      })
    })
    return () => ctx.revert()
  }, [])

  const play  = () => tlRef.current?.play()
  const pause = () => tlRef.current?.pause()
  const reset = () => {
    tlRef.current?.progress(0).pause()
    progressRef.current.value = 0
    if (displayRef.current) { displayRef.current.style.width = '0%'; displayRef.current.textContent = '0%' }
  }

  return (
    <div className="space-y-3">
      <div className="h-8 bg-zinc-800 rounded overflow-hidden relative">
        <div
          ref={displayRef}
          className="h-full bg-emerald-600 flex items-center justify-end pr-2 text-[10px] text-white font-bold transition-none"
          style={{ width: '0%' }}
        >
          0%
        </div>
      </div>
      <div className="flex gap-2">
        <Btn onClick={play}>Play</Btn>
        <Btn onClick={pause} muted>Pause</Btn>
        <Btn onClick={reset} muted>Reset</Btn>
      </div>
      <Note>GSAP animates progressRef.current.value (a plain number). onUpdate reads it and updates the DOM. Same pattern as InstancedBoxes.tsx.</Note>
    </div>
  )
}

function WorkedExample() {
  return (
    <Section title="Worked Example — GSAP + React patterns">
      <div className="space-y-8">
        <div>
          <p className="text-zinc-400 text-xs mb-3">
            <strong className="text-zinc-300">Mount animation</strong> — useEffect with <Code>[]</Code>,
            boxes enter on component mount using <Code>gsap.context()</Code>:
          </p>
          <MountAnimation />
        </div>

        <div>
          <p className="text-zinc-400 text-xs mb-3">
            <strong className="text-zinc-300">Reactive animation</strong> — useEffect with <Code>[active]</Code>,
            re-runs when state changes:
          </p>
          <ReactiveAnimation />
        </div>

        <div>
          <p className="text-zinc-400 text-xs mb-3">
            <strong className="text-zinc-300">Plain JS object animation</strong> — animating a number,
            reading it via <Code>onUpdate</Code> (the main app pattern):
          </p>
          <JsObjectAnimation />
        </div>
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// YOUR TURN — Wire up GSAP correctly
// ═══════════════════════════════════════════════════════════════════════════════
//
// The component below has three bugs. Fix each one:
//
//   Bug 1: GSAP is called at the top level — ref.current is null at that point.
//          Move it into a useEffect.
//
//   Bug 2: The useEffect has no cleanup — this leaks animations in StrictMode.
//          Add gsap.context() and return () => ctx.revert().
//
//   Bug 3: The animation should re-run when `count` changes but the dependency
//          array is wrong.

function BuggyComponent() {
  const boxRef = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(0)

  // ??? Bug 1: this runs before the DOM exists — ref.current is null here
  // ??? Bug 2: no cleanup — gsap.context() is missing
  // ??? Bug 3: wrong dependency array — should re-run when count changes
  useEffect(() => {
    const context = gsap.context(() => {
      gsap.to(boxRef.current, {
      x:        count * 40,
      rotation: count * 30,
      duration: 0.5,
      ease:     'back.out(1.7)',
    })
  })

  return () => context.revert()
  }, [count])  // ??? wrong deps

  return (
    <div className="space-y-3">
      <div className="relative h-20 bg-zinc-800 rounded border border-zinc-700 overflow-hidden flex items-center px-3">
        <div
          ref={boxRef}
          className="w-12 h-12 bg-rose-500 rounded flex items-center justify-center text-white text-xs font-bold shrink-0"
        >
          {count}
        </div>
      </div>
      <div className="flex gap-2">
        <Btn onClick={() => setCount((c) => c + 1)}>count +1</Btn>
        <Btn onClick={() => setCount(0)} muted>reset</Btn>
      </div>
      <Note>Box should slide right and rotate more with each count increment. Fix the 3 bugs.</Note>
    </div>
  )
}

function YourTurn() {
  return (
    <Section title="Your Turn — Fix the three bugs">
      <p className="text-zinc-400 text-xs mb-4 leading-relaxed">
        The component has 3 bugs marked with <Code>???</Code>. Fix them so the box
        animates correctly on mount AND on every count change.
      </p>
      <BuggyComponent />
    </Section>
  )
}

export default function Lesson04ReactRefs() {
  return (
    <div className="max-w-2xl mx-auto space-y-10">
      <h1 className="text-lg font-semibold text-white">Lesson 04 — React + GSAP: refs, effects, cleanup</h1>
      <WorkedExample />
      <YourTurn />
    </div>
  )
}

// ─── QUESTIONS ───────────────────────────────────────────────────────────────
// Q1: What does React StrictMode do that makes GSAP cleanup critical?
//     Open React DevTools and observe how many times the mount animation
//     in MountAnimation fires if you remove the ctx.revert() cleanup.
//
// Q2: In JsObjectAnimation, GSAP animates progressRef.current.value, not a
//     DOM element. What types of targets can GSAP animate?
//
// Q3: Why does ReactiveAnimation wrap the GSAP call in useEffect([active])
//     instead of just calling gsap.to() directly inside the onClick handler
//     like we did in the earlier lessons?
//
// ANSWERS: (hidden — try yourself first)
// A1: React StrictMode intentionally mounts → unmounts → remounts every
//     component to detect side effects. Without ctx.revert() cleanup, the first
//     mount's tweens keep running after unmount. The second mount starts new
//     tweens on top of the ghost ones — you'd see double-speed or stuttering
//     animations. ctx.revert() kills all tracked tweens and resets element
//     styles to pre-animation state.
//
// A2: GSAP can animate ANY JavaScript object with numeric properties:
//     - DOM elements (via their inline style)
//     - Plain objects: { value: 0 }, { progress: 0.5 }
//     - Three.js objects: mesh.position, material.opacity
//     - Arrays of any of the above
//     GSAP just interpolates numbers — it doesn't care what holds them.
//
// A3: The onClick pattern (Lesson 01) is fine for triggered animations.
//     But when the animation depends on React state, useEffect is the right
//     place because it runs AFTER React has re-rendered with the new state.
//     Calling gsap.to() directly in a click handler that also calls setState
//     can read stale state values — the DOM hasn't updated yet when the handler
//     runs. useEffect([active]) runs after React commits the new render.
// ─────────────────────────────────────────────────────────────────────────────

// ─── ANSWERS FOR YOUR TURN ────────────────────────────────────────────────────
// Bug 1 + 2 + 3 fixed:
//
// useEffect(() => {
//   const ctx = gsap.context(() => {
//     gsap.to(boxRef.current, {
//       x:        count * 40,
//       rotation: count * 30,
//       duration: 0.5,
//       ease:     'back.out(1.7)',
//     })
//   })
//   return () => ctx.revert()
// }, [count])  // re-run when count changes
// ─────────────────────────────────────────────────────────────────────────────

// ─── SHARED UI HELPERS ────────────────────────────────────────────────────────

function Btn({ onClick, children, muted }: {
  onClick: () => void
  children: React.ReactNode
  muted?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
        muted
          ? 'border border-zinc-700 text-zinc-400 hover:text-white'
          : 'bg-zinc-700 hover:bg-zinc-600 text-white'
      }`}
    >
      {children}
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

/**
 * LESSON 05 — Selectors: picking minimal state, preventing re-renders
 *
 * WHAT IS A SELECTOR?
 * The arrow function you pass to useStore is a "selector":
 *   useStore((s) => s.count)    ← selector
 *
 * Zustand runs your selector after every state change. If the returned value
 * is the same as before (via Object.is comparison), it skips the re-render.
 * If different, the component re-renders.
 *
 * THREE RULES:
 *   1. Select ONLY what the component needs — not the whole store.
 *   2. Never return a NEW object/array from a selector unless you want every
 *      state change to trigger a re-render (Object.is sees new reference = changed).
 *   3. For derived values that combine multiple fields, compute them outside the
 *      selector or use a stable reference.
 *
 * This lesson shows the problem visually with a render counter.
 */

import { create } from 'zustand'
import React, { useRef, useState } from 'react'

// ─── Shared store ─────────────────────────────────────────────────────────────
interface DemoStore {
  count:  number
  name:   string
  theme:  'dark' | 'light'
  increment: () => void
  setName:   (n: string) => void
  toggleTheme: () => void
}

const useDemoStore = create<DemoStore>((set) => ({
  count: 0,
  name:  'Alice',
  theme: 'dark',
  increment:   () => set((s) => ({ count: s.count + 1 })),
  setName:     (n) => set({ name: n }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
}))

// ═══════════════════════════════════════════════════════════════════════════════
// WORKED EXAMPLE — Comparing bad vs good selectors
// ═══════════════════════════════════════════════════════════════════════════════

// A render counter hook — tells you how many times a component has rendered.
function useRenderCount() {
  const ref = useRef(0)
  ref.current += 1
  return ref.current
}

// ─── BAD: no selector (subscribes to the entire store) ───────────────────────
// This component only uses `count` — but it re-renders whenever ANY field
// in the store changes (name, theme, anything).
function BadCountDisplay() {
  const store  = useDemoStore()  // ← no selector: gets the whole store object
  const renders = useRenderCount()

  return (
    <DisplayBox label="No selector (whole store)" renders={renders} bad>
      <span className="text-3xl font-bold tabular-nums">{store.count}</span>
    </DisplayBox>
  )
}

// ─── GOOD: narrow selector ────────────────────────────────────────────────────
// Only re-renders when `count` changes. Changing name or theme does nothing.
function GoodCountDisplay() {
  const count   = useDemoStore((s) => s.count)  // ← selector: picks only count
  const renders = useRenderCount()

  return (
    <DisplayBox label="Narrow selector (s) => s.count" renders={renders}>
      <span className="text-3xl font-bold tabular-nums">{count}</span>
    </DisplayBox>
  )
}

// ─── BAD: selector returns a new object every time ───────────────────────────
// Even though it only reads count and name, returning { count, name } creates
// a NEW object on every selector run. Object.is({...}, {...}) = false always,
// so this re-renders on every store change — same as no selector at all.
function BadObjectSelector() {
  const { count, name } = useDemoStore((s) => ({ count: s.count, name: s.name }))
  const renders = useRenderCount()

  return (
    <DisplayBox label="Object selector { count, name } — still bad" renders={renders} bad>
      <span className="text-2xl font-bold">{name}: {count}</span>
    </DisplayBox>
  )
}

// ─── GOOD: two separate selectors ────────────────────────────────────────────
// Select each primitive separately. Primitives compare by value, not reference.
// This component only re-renders when count OR name changes.
function GoodTwoSelectors() {
  const count   = useDemoStore((s) => s.count)
  const name    = useDemoStore((s) => s.name)
  const renders = useRenderCount()

  return (
    <DisplayBox label="Two primitives: s.count + s.name" renders={renders}>
      <span className="text-2xl font-bold">{name}: {count}</span>
    </DisplayBox>
  )
}

// ─── Controls ─────────────────────────────────────────────────────────────────
function Controls() {
  const increment   = useDemoStore((s) => s.increment)
  const setName     = useDemoStore((s) => s.setName)
  const toggleTheme = useDemoStore((s) => s.toggleTheme)
  const [nameInput, setNameInput] = useState('')

  return (
    <div className="p-4 rounded border border-zinc-800 bg-zinc-900 space-y-3">
      <p className="text-zinc-500 text-xs mb-2">
        Use these controls and watch the render counts above.
        "Toggle theme" changes a field NONE of the displays use — see which ones still re-render.
      </p>
      <div className="flex gap-2 flex-wrap">
        <Btn onClick={increment}>count +1</Btn>
        <Btn onClick={toggleTheme} muted>toggle theme</Btn>
      </div>
      <div className="flex gap-2">
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="new name..."
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 placeholder-zinc-600"
        />
        <Btn onClick={() => { setName(nameInput); setNameInput('') }}>set name</Btn>
      </div>
    </div>
  )
}

function WorkedExample() {
  return (
    <Section title="Worked Example — Selector comparison">
      <p className="text-zinc-400 mb-4 text-xs leading-relaxed">
        Four components all read from the same store. Watch the render counts as you
        change different fields. Only the "bad" ones re-render on <Code>toggleTheme</Code>.
      </p>
      <div className="space-y-2 mb-4">
        <BadCountDisplay />
        <GoodCountDisplay />
        <BadObjectSelector />
        <GoodTwoSelectors />
      </div>
      <Controls />
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// YOUR TURN — Fix the buggy components
// ═══════════════════════════════════════════════════════════════════════════════
//
// The three components below all have selector bugs. Fix each one so it only
// re-renders when the data it displays actually changes.
//
// Clue for each is in the comment above the component.

// ─── Bug 1: no selector at all ───────────────────────────────────────────────
// This component only shows `theme`. Fix the selector.
function BuggyTheme() {
  const theme   = useDemoStore((s) => s.theme)         // ??? fix: only select theme
  const renders = useRenderCount()

  return (
    <DisplayBox label="Bug 1 — theme display (re-renders on count changes)" renders={renders} bad>
      <span className="text-xl font-bold">{theme}</span>
    </DisplayBox>
  )
}

// ─── Bug 2: object selector returns new reference ────────────────────────────
// This component shows count + theme. Fix it to only re-render when either changes.
function BuggyCountAndTheme() {
  // ??? fix: don't return an object from the selector
  // const { count, theme } = useDemoStore((s) => ({ count: s.count, theme: s.theme }))
  const count = useDemoStore((s) => s.count)
  const theme = useDemoStore((s) => s.theme)

  const renders = useRenderCount()

  return (
    <DisplayBox label="Bug 2 — count + theme (re-renders on name changes)" renders={renders} bad>
      <span className="text-xl font-bold">{theme} / {count}</span>
    </DisplayBox>
  )
}

// ─── Bug 3: computing a value outside the selector correctly ─────────────────
// This component shows "count squared". It currently re-renders on name changes.
// Fix it: select only count, then compute the square in the component body.
function BuggySquared() {
  const everything = useDemoStore()   // ??? fix: only select count
  const squared    = everything.count ** 2
  const renders    = useRenderCount()

  return (
    <DisplayBox label="Bug 3 — count² (re-renders on theme/name changes)" renders={renders} bad>
      <span className="text-xl font-bold">{squared}</span>
    </DisplayBox>
  )
}

// ─── Same controls (your components use the same store) ──────────────────────
function YourTurnControls() {
  const increment   = useDemoStore((s) => s.increment)
  const toggleTheme = useDemoStore((s) => s.toggleTheme)
  const setName     = useDemoStore((s) => s.setName)
  const [nameInput, setNameInput] = useState('')

  return (
    <div className="p-4 rounded border border-zinc-700 bg-zinc-900 space-y-3">
      <p className="text-zinc-500 text-xs">Clicking "toggle theme" or "set name" should NOT re-render Bug 1/2/3 after you fix them.</p>
      <div className="flex gap-2 flex-wrap">
        <Btn onClick={increment}>count +1</Btn>
        <Btn onClick={toggleTheme} muted>toggle theme</Btn>
      </div>
      <div className="flex gap-2">
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="new name..."
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 placeholder-zinc-600"
        />
        <Btn onClick={() => { setName(nameInput); setNameInput('') }}>set name</Btn>
      </div>
    </div>
  )
}

function YourTurn() {
  return (
    <Section title="Your Turn — Fix the buggy selectors">
      <p className="text-zinc-400 mb-4 text-xs leading-relaxed">
        Each component has a selector bug. Fix them so the render count only
        increments when the displayed data actually changes.
      </p>
      <div className="space-y-2 mb-4">
        <BuggyTheme />
        <BuggyCountAndTheme />
        <BuggySquared />
      </div>
      <YourTurnControls />
    </Section>
  )
}

export default function Lesson05Selectors() {
  return (
    <div className="max-w-2xl mx-auto space-y-10">
      <h1 className="text-lg font-semibold text-white">Lesson 05 — Selectors & Re-renders</h1>
      <WorkedExample />
      <YourTurn />
    </div>
  )
}

// ─── QUESTIONS ───────────────────────────────────────────────────────────────
// Q1: BadObjectSelector uses (s) => ({ count: s.count, name: s.name }).
//     Why doesn't Zustand detect that count and name haven't changed and skip
//     the re-render?
//
// Q2: If you select an action function: useStore((s) => s.increment) — does
//     the component re-render when count changes? Why or why not?
//
// Q3: In the main app's InstancedBoxes.tsx, the component selects both
//     packingResult and boxes separately (two useStore calls). Why is this
//     better than one call returning { packingResult, boxes }?
//
// ANSWERS: (hidden — try yourself first)
// A1: Zustand uses Object.is() to compare the previous and new selector results.
//     Object.is({a:1}, {a:1}) = FALSE — two different object references are
//     never equal, even if they have identical contents. The selector creates a
//     new object literal { count, name } on every run, so Object.is always sees
//     "changed". Use separate primitive selectors or the `shallow` import from
//     zustand/shallow to fix this (shallow does a one-level key comparison).
//
// A2: No — functions defined in the store are stable references. The `increment`
//     function is created once when the store is initialised and never changes.
//     Object.is(increment, increment) = TRUE on every comparison, so Zustand
//     skips the re-render. This is why you can safely select actions in
//     components that don't care about state values.
//
// A3: Two separate primitive/reference selectors means each component part
//     re-renders only when its specific value changes. If packingResult is the
//     same object but boxes changed, only the boxes-dependent code re-runs.
//     With one object selector {packingResult, boxes} it would re-render
//     whenever EITHER changes (and always re-render due to new object reference).
// ─────────────────────────────────────────────────────────────────────────────

// ─── ANSWERS FOR YOUR TURN ────────────────────────────────────────────────────
// Bug 1: const theme = useDemoStore((s) => s.theme)
//        use `theme` directly instead of `store.theme`
//
// Bug 2: const count = useDemoStore((s) => s.count)
//        const theme = useDemoStore((s) => s.theme)
//        — two separate primitive selectors instead of one object selector
//
// Bug 3: const count   = useDemoStore((s) => s.count)
//        const squared = count ** 2
//        — select only count, derive squared in the component body
// ─────────────────────────────────────────────────────────────────────────────

// ─── SHARED UI HELPERS ────────────────────────────────────────────────────────

function DisplayBox({ label, renders, children, bad }: {
  label: string
  renders: number
  children: React.ReactNode
  bad?: boolean
}) {
  return (
    <div className={`flex items-center gap-4 p-3 rounded border text-xs ${
      bad ? 'border-red-900/50 bg-red-950/20' : 'border-zinc-800 bg-zinc-900'
    }`}>
      <div className="flex-1">
        <p className={`mb-1 ${bad ? 'text-red-400' : 'text-zinc-500'}`}>{label}</p>
        {children}
      </div>
      <div className="text-right shrink-0">
        <p className="text-zinc-600 text-[10px]">renders</p>
        <p className={`text-lg font-bold tabular-nums ${bad ? 'text-red-400' : 'text-green-400'}`}>
          {renders}
        </p>
      </div>
    </div>
  )
}

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-zinc-300 font-semibold mb-3 border-b border-zinc-800 pb-2">{title}</h2>
      {children}
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="text-amber-400 bg-zinc-800 px-1 rounded text-xs">{children}</code>
}

/**
 * LESSON 02 — The Updater Function: set((s) => ...) vs set({ ... })
 *
 * There are two ways to call set:
 *
 *   DIRECT form:   set({ count: 0 })
 *   UPDATER form:  set((s) => ({ count: s.count + 1 }))
 *
 * Rule of thumb:
 *   - New value does NOT depend on current state → use direct form
 *   - New value DOES depend on current state    → use updater form
 *
 * WHY does it matter? Stale closures.
 *
 * If an action closes over a variable from the outer scope (e.g., a component's
 * local variable), that variable might be stale by the time the action runs.
 * The updater form avoids this: Zustand always passes you the LATEST state
 * as `s`, not whatever was in scope when the action was defined.
 *
 * The pattern:
 *   set((s) => ({ field: s.field + something }))
 *        ↑ `s` = current state, guaranteed fresh by Zustand
 */

import { create } from 'zustand'
import { useRef } from 'react'

// ═══════════════════════════════════════════════════════════════════════════════
// WORKED EXAMPLE — Demonstrating the stale closure bug
// ═══════════════════════════════════════════════════════════════════════════════

interface BuggyStore {
  count: number
  buggyAdd:  () => void   // uses direct set with a closed-over variable — broken
  correctAdd: () => void  // uses updater form — always correct
}

// We'll simulate the "stale closure" problem by capturing a local variable
// inside the store initialiser. In practice this happens in React components
// that create callbacks referencing local state.
const useBuggyStore = create<BuggyStore>((set, get) => ({
  count: 0,

  // BAD: reads count via get() then immediately sets it.
  // This works for single clicks but fails when called multiple times rapidly
  // (e.g. rapid double-click) because get() might return a stale snapshot
  // if multiple updates are batched. This pattern is fragile.
  buggyAdd: () => {
    const current = get().count
    set({ count: current + 1 })
  },

  // GOOD: Zustand calls the updater with the TRUE latest state, even if
  // multiple updates are queued. Always safe.
  correctAdd: () => set((s) => ({ count: s.count + 1 })),
}))

// Demonstrates where the stale closure ACTUALLY hurts: React components.
// This component creates a handler that closes over a local copy of count,
// then fires it twice in the same event. Only one increment happens with the
// direct form; two happen with the updater form.
function BugDemo() {
  const count      = useBuggyStore((s) => s.count)
  const buggyAdd   = useBuggyStore((s) => s.buggyAdd)
  const correctAdd = useBuggyStore((s) => s.correctAdd)
  const reset      = () => useBuggyStore.setState({ count: 0 })

  // Fires the action TWICE synchronously — simulates rapid batched updates.
  // With buggyAdd (get() + set) you'd normally still get 2, but the danger
  // is real in async callbacks / event handlers that read state outside set.
  const fireTwice = (action: () => void) => {
    action()
    action()
  }

  return (
    <div className="p-6 rounded-lg border border-zinc-800 bg-zinc-900 space-y-4">
      <div className="text-center text-4xl font-bold tabular-nums">{count}</div>
      <div className="flex gap-3 justify-center flex-wrap">
        <Btn onClick={() => fireTwice(buggyAdd)}  warn>buggyAdd ×2</Btn>
        <Btn onClick={() => fireTwice(correctAdd)}>correctAdd ×2</Btn>
        <Btn onClick={reset} muted>reset</Btn>
      </div>
      <p className="text-zinc-500 text-xs text-center">
        Both should add 2. The buggy version may lose an update under async pressure.
      </p>
    </div>
  )
}

// ─── Clearer mental model ─────────────────────────────────────────────────────

interface HistoryStore {
  count:   number
  history: number[]
  add:     (n: number) => void
  undo:    () => void
  reset:   () => void
}

// A store that keeps a history stack — you MUST read current state to update it.
// There is no way to write this correctly with the direct form.
const useHistoryStore = create<HistoryStore>((set) => ({
  count:   0,
  history: [],

  add: (n) => set((s) => ({
    count:   s.count + n,
    history: [...s.history, s.count],  // push current count BEFORE incrementing
  })),

  undo: () => set((s) => {
    if (s.history.length === 0) return {}  // nothing to undo — return empty patch
    const prev = s.history[s.history.length - 1]
    return {
      count:   prev,
      history: s.history.slice(0, -1),
    }
  }),

  reset: () => set({ count: 0, history: [] }),  // direct form: known values, no current state needed
}))

function HistoryDemo() {
  const count   = useHistoryStore((s) => s.count)
  const history = useHistoryStore((s) => s.history)
  const add     = useHistoryStore((s) => s.add)
  const undo    = useHistoryStore((s) => s.undo)
  const reset   = useHistoryStore((s) => s.reset)

  return (
    <div className="p-6 rounded-lg border border-zinc-800 bg-zinc-900 space-y-4">
      <div className="text-center text-4xl font-bold tabular-nums">{count}</div>
      <div className="text-center text-xs text-zinc-500">
        history: [{history.join(', ')}]
      </div>
      <div className="flex gap-2 justify-center flex-wrap">
        <Btn onClick={() => add(1)}>+1</Btn>
        <Btn onClick={() => add(5)}>+5</Btn>
        <Btn onClick={undo} muted>undo</Btn>
        <Btn onClick={reset} muted>reset</Btn>
      </div>
    </div>
  )
}

function WorkedExample() {
  return (
    <Section title="Worked Example — Updater Form">
      <p className="text-zinc-400 mb-4 leading-relaxed">
        <Code>set{'((s) => ...)'}</Code> always receives the latest state as <Code>s</Code>.
        Use it whenever the new value depends on the current value.
      </p>
      <p className="text-zinc-500 text-xs mb-4">Counter with undo history — impossible to write correctly without the updater form:</p>
      <HistoryDemo />
      <p className="text-zinc-500 text-xs mt-6 mb-2">Stale closure demo (fire action twice synchronously):</p>
      <BugDemo />
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// YOUR TURN — Multiplier
// ═══════════════════════════════════════════════════════════════════════════════
//
// Build a store for a number that can be:
//   - doubled (× 2)
//   - halved  (÷ 2, round down with Math.floor)
//   - incremented by a given step
//   - reset to 1
//
// Fill in each action. Decide for each: direct set or updater form?

interface MultiplierStore {
  value:     number
  double:    () => void
  halve:     () => void
  addStep:   (step: number) => void
  reset:     () => void
}

const useMultiplierStore = create<MultiplierStore>((set) => ({
  value:   1,
  double:  () => set((s) => ({value: s.value * 2})),        // ??? updater or direct? fill in
  halve:  () => set((s) => ({value: s.value / 2})),        // ??? updater or direct? fill in
  addStep: (_step) => set((s) => ({value: s.value + _step})),   // ??? updater or direct? fill in
  reset:   () => set({value: 0}),        // ??? updater or direct? fill in
}))

function MultiplierDisplay() {
  const value = useMultiplierStore((s) => s.value)
  return <span className="text-4xl font-bold tabular-nums">{value}</span>
}

function MultiplierButtons() {
  const double  = useMultiplierStore((s) => s.double)
  const halve   = useMultiplierStore((s) => s.halve)
  const addStep = useMultiplierStore((s) => s.addStep)
  const reset   = useMultiplierStore((s) => s.reset)

  return (
    <div className="flex gap-2 mt-4 flex-wrap justify-center">
      <Btn onClick={double}>× 2</Btn>
      <Btn onClick={halve}>÷ 2</Btn>
      <Btn onClick={() => addStep(3)}>+ 3</Btn>
      <Btn onClick={() => addStep(10)}>+ 10</Btn>
      <Btn onClick={reset} muted>reset to 1</Btn>
    </div>
  )
}

function YourTurn() {
  return (
    <Section title="Your Turn — Multiplier">
      <p className="text-zinc-400 mb-4 leading-relaxed">
        Fill in the four actions in <Code>useMultiplierStore</Code>.
        For each one, decide: does it need the <Code>updater form</Code> or the{' '}
        <Code>direct form</Code>?
      </p>
      <div className="flex flex-col items-center gap-2 p-8 rounded-lg border border-zinc-700 bg-zinc-900">
        <MultiplierDisplay />
        <MultiplierButtons />
      </div>
    </Section>
  )
}

export default function Lesson02UpdaterFn() {
  return (
    <div className="max-w-2xl mx-auto space-y-10">
      <h1 className="text-lg font-semibold text-white">Lesson 02 — set updater function</h1>
      <WorkedExample />
      <YourTurn />
    </div>
  )
}

// ─── QUESTIONS ───────────────────────────────────────────────────────────────
// Q1: In `HistoryStore.reset`, why is it safe to use direct set({ count: 0, history: [] })
//     instead of the updater form?
//
// Q2: In `HistoryStore.undo`, the updater returns {} (empty object) when history
//     is empty. What does Zustand do with an empty patch object? Does it re-render?
//
// Q3: For the YOUR TURN multiplier store: which of the 4 actions REQUIRE the
//     updater form, and which could use direct set?
//
// ANSWERS: (hidden — try yourself first)
// A1: reset always sets to known constants (0 and []). It doesn't need to know
//     the current state to compute the new state, so the direct form is cleaner
//     and clearer about intent.
//
// A2: Zustand merges the patch into current state. {} is an empty object —
//     there's nothing to merge, so no fields change. Zustand does a shallow
//     equality check and skips the re-render entirely. Returning {} from an
//     updater is the idiomatic "do nothing" pattern.
//
// A3: double, halve, addStep all REQUIRE the updater form — their new values
//     depend on the current value. reset is the only one that can use direct
//     set (reset to 1 is a known value).
// ─────────────────────────────────────────────────────────────────────────────

// ─── ANSWERS FOR YOUR TURN ────────────────────────────────────────────────────
// double:  () => set((s) => ({ value: s.value * 2 })),
// halve:   () => set((s) => ({ value: Math.floor(s.value / 2) })),
// addStep: (step) => set((s) => ({ value: s.value + step })),
// reset:   () => set({ value: 1 }),
// ─────────────────────────────────────────────────────────────────────────────

// ─── SHARED UI HELPERS ────────────────────────────────────────────────────────

function Btn({ onClick, children, muted, warn }: {
  onClick: () => void
  children: React.ReactNode
  muted?: boolean
  warn?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
        warn  ? 'bg-amber-900 hover:bg-amber-800 text-amber-200' :
        muted ? 'border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500' :
                'bg-zinc-700 hover:bg-zinc-600 text-white'
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

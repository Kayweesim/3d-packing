/**
 * LESSON 01 — Basic Store
 *
 * Core idea: a Zustand store is an object that holds state + the functions
 * that change it ("actions"). You create it ONCE outside any component.
 * Any component in the tree can read from it or call its actions — no
 * Provider wrapper required (unlike React Context).
 *
 * THREE STEPS every store follows:
 *   1. Define a TypeScript interface describing the shape (fields + actions)
 *   2. Call create<YourInterface>((set) => ({ ... })) to build the hook
 *   3. Use the hook in components:  useStore((s) => s.field)
 *
 * `set` is the only way to change state. Zustand hands it to you — you never
 * construct it yourself. Calling set(newPartial) merges newPartial into the
 * current state and triggers a re-render in every subscribed component.
 */

import { create } from 'zustand'

// ═══════════════════════════════════════════════════════════════════════════════
// WORKED EXAMPLE — Counter
// ═══════════════════════════════════════════════════════════════════════════════

// Step 1: Interface. Fields are plain data; actions are functions.
interface CounterStore {
  count:     number
  increment: () => void
  decrement: () => void
  reset:     () => void
}


// Step 2: create the store.
// create<CounterStore>   — tells TypeScript the full shape of the store
// (set) => ({ ... })     — the initialiser function; returns the initial state + actions
// set({ count: 0 })      — "direct" form: you already know the new value


const useCounterStore = create<CounterStore>((set) => ({
  count: 0,

  // Direct set — we don't need to read the current count to know the new value is 0.
  reset: () => set({ count: 0 }),

  // We also don't technically need current state here because we could write
  // set({ count: store.count + 1 }) — but that would be a stale closure bug.
  // For now, treat these as "needs current state" and use the updater form.
  // Lesson 02 explains this in full depth.
  increment: () => set((s) => ({ count: s.count + 1 })),
  decrement: () => set((s) => ({ count: s.count - 1 })),
}))

// Step 3: read state in a component using a selector.
// The selector (s) => s.count is an arrow function that picks exactly what this
// component needs. The component ONLY re-renders when `count` changes — not when
// any other field in the store changes. (More on this in Lesson 05.)
function CounterDisplay() {
  const count = useCounterStore((s) => s.count)
  return <span className="text-4xl font-bold tabular-nums">{count}</span>
}

// Actions can be read separately. This component never re-renders because it
// selects functions — functions don't change between renders.
function CounterButtons() {
  const increment = useCounterStore((s) => s.increment)
  const decrement = useCounterStore((s) => s.decrement)
  const reset     = useCounterStore((s) => s.reset)

  return (
    <div className="flex gap-2 mt-4">
      <Btn onClick={decrement}>−</Btn>
      <Btn onClick={reset} muted>reset</Btn>
      <Btn onClick={increment}>+</Btn>
    </div>
  )
}

function WorkedExample() {
  return (
    <Section title="Worked Example — Counter">
      <p className="text-zinc-400 mb-6 leading-relaxed">
        A store with <Code>count</Code>, <Code>increment</Code>, <Code>decrement</Code>,
        and <Code>reset</Code>. Two separate components both read from the same store —
        no props passed between them.
      </p>
      <div className="flex flex-col items-center gap-2 p-8 rounded-lg border border-zinc-800 bg-zinc-900">
        <CounterDisplay />
        <CounterButtons />
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// YOUR TURN — Score Tracker
// ═══════════════════════════════════════════════════════════════════════════════
//
// Build a score tracker. The store needs:
//   - score: number  (starts at 0)
//   - addPoints: (n: number) => void  (adds n to score)
//   - reset: () => void               (sets score back to 0)
//
// The UI below is already written — you only need to fill in the store.
// Once the store is correct, clicking the buttons should update the score.

// ??? Step 1: fill in the interface
interface ScoreStore {
  score:     number
  addPoints: (n: number) => void
  reset:     () => void
}

// ??? Step 2: fill in the store implementation
// Replace each `() => {}` stub with a real implementation.

const useScoreStore = create<ScoreStore>((set) => ({
  score: 0,                        // ??? correct — leave this
  addPoints: (n) => set((s) => ({ score: s.score + n })),       // ??? replace: should add n to score
  reset:     () => set({score : 0}),             // ??? replace: should reset score to 0
}))

// — UI is provided for you — make the store work to pass the exercise ———————

function ScoreDisplay() {
  const score = useScoreStore((s) => s.score)
  return <span className="text-4xl font-bold tabular-nums">{score}</span>
}

function ScoreButtons() {
  const addPoints = useScoreStore((s) => s.addPoints)
  const reset     = useScoreStore((s) => s.reset)

  return (
    <div className="flex gap-2 mt-4 flex-wrap justify-center">
      <Btn onClick={() => addPoints(1)}>+1</Btn>
      <Btn onClick={() => addPoints(5)}>+5</Btn>
      <Btn onClick={() => addPoints(10)}>+10</Btn>
      <Btn onClick={reset} muted>reset</Btn>
    </div>
  )
}

function YourTurn() {
  return (
    <Section title="Your Turn — Score Tracker">
      <p className="text-zinc-400 mb-4 leading-relaxed">
        Fill in <Code>addPoints</Code> and <Code>reset</Code> in <Code>useScoreStore</Code> above.
        The buttons should update the score — right now they do nothing.
      </p>
      <div className="flex flex-col items-center gap-2 p-8 rounded-lg border border-zinc-700 bg-zinc-900">
        <ScoreDisplay />
        <ScoreButtons />
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// LESSON ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

export default function Lesson01BasicStore() {
  return (
    <div className="max-w-2xl mx-auto space-y-10">
      <h1 className="text-lg font-semibold text-white">Lesson 01 — Basic Store</h1>
      <WorkedExample />
      <YourTurn />
    </div>
  )
}

// ─── QUESTIONS ───────────────────────────────────────────────────────────────
// Q1: What happens if you call useCounterStore() with NO selector, i.e.
//     const store = useCounterStore() ?
//     Try it — add a console.log inside CounterDisplay and click increment.
//     How many times does it log compared to using (s) => s.count?
//
// Q2: The store is defined outside the component. What would happen if you
//     moved `create(...)` inside CounterDisplay? Try it and explain why it breaks.
//
// Q3: Can two completely separate browser tabs share the same Zustand store?
//     Why or why not?
//
// ANSWERS: (hidden — try yourself first)
// A1: Without a selector, the component receives the entire store object and
//     re-renders on ANY state change — even changes to fields it doesn't use.
//     With (s) => s.count it only re-renders when count changes.
//     This matters more as the store grows — Lesson 05 covers it in detail.
//
// A2: create() runs on every render, creating a brand-new store each time.
//     The component would always show count=0 because each render gets a fresh
//     store with no previous state. Stores MUST be module-level (outside components)
//     so they're created exactly once and persist across renders.
//
// A3: No. Zustand state is JavaScript in-memory — it lives in the browser tab's
//     JS heap. Each tab has its own isolated JS environment. To share state
//     across tabs you'd need a backend, localStorage sync, or BroadcastChannel.
// ─────────────────────────────────────────────────────────────────────────────

// ─── ANSWERS FOR YOUR TURN ────────────────────────────────────────────────────
// addPoints: (n) => set((s) => ({ score: s.score + n })),
// reset:     () => set({ score: 0 }),
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
      className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
        muted
          ? 'border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
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

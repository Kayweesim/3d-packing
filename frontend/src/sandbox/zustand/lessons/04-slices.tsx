/**
 * LESSON 04 — Slices: splitting a large store into focused pieces
 *
 * WHY SLICES?
 * As a store grows, putting everything in one create() call becomes unwieldy.
 * Slices let you split state + actions by domain into separate files, then
 * combine them in one create() call. This is exactly how the main app's store
 * works (containerSlice, boxSlice, packingSlice, uiSlice).
 *
 * KEY TYPE: StateCreator<TStore, [], [], TSlice>
 *
 *   TStore — the full combined store type. Used so get() sees ALL slices.
 *   TSlice — the shape this particular slice returns. Narrower than TStore.
 *
 * If a slice's actions only touch its own state, TStore = TSlice (no cross-slice reads).
 * If a slice needs to read ANOTHER slice's state via get(), TStore must include that slice.
 *
 * PATTERN:
 *   1. Define each slice's interface
 *   2. Define FullStore = SliceA & SliceB & ...
 *   3. Write createXSlice: StateCreator<FullStore, [], [], XSlice> = (set, get) => ({...})
 *   4. combine: create<FullStore>((...args) => ({
 *        ...createXSlice(...args),
 *        ...createYSlice(...args),
 *      }))
 */

import { create } from 'zustand'
import type { StateCreator } from 'zustand'
import React, { useState } from 'react'

// ═══════════════════════════════════════════════════════════════════════════════
// WORKED EXAMPLE — Counter slice + Notification slice
// ═══════════════════════════════════════════════════════════════════════════════
//
// CounterSlice: count, increment, decrement
// NotifSlice:   messages[], addMessage, clearAll
// Cross-slice:  incrementWithLog uses get() to read count from CounterSlice,
//               then calls addMessage from NotifSlice — both in the same action.

interface CounterSlice {
  count:             number
  increment:         () => void
  decrement:         () => void
  incrementWithLog:  () => void  // cross-slice: reads count, adds a notification
}

interface NotifSlice {
  messages:   string[]
  addMessage: (msg: string) => void
  clearAll:   () => void
}

// The COMBINED type — this is what get() can see inside any slice.
type AppStore = CounterSlice & NotifSlice

// ── CounterSlice ──────────────────────────────────────────────────────────────
// StateCreator<AppStore, [], [], CounterSlice>
//              ↑ get() sees full AppStore (so addMessage is accessible via get)
//                                         ↑ this slice only RETURNS CounterSlice
const createCounterSlice: StateCreator<AppStore, [], [], CounterSlice> = (set, get) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
  decrement: () => set((s) => ({ count: s.count - 1 })),

  // Cross-slice action: reads count from CounterSlice, calls addMessage from NotifSlice.
  // Both are accessible via get() because get() returns the full AppStore.
  incrementWithLog: () => {
    set((s) => ({ count: s.count + 1 }))
    const newCount = get().count  // read updated count after set()
    get().addMessage(`count changed → ${newCount}`)  // call another slice's action
  },
})

// ── NotifSlice ────────────────────────────────────────────────────────────────
// This slice doesn't need to read from CounterSlice, so TStore could be just
// NotifSlice. But we still type it as AppStore for consistency — no downside.
const createNotifSlice: StateCreator<AppStore, [], [], NotifSlice> = (set) => ({
  messages: [],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  clearAll:   () => set({ messages: [] }),
})

// ── Combined store ────────────────────────────────────────────────────────────
// create() receives (...args) = [set, get, api].
// Each createXSlice gets the SAME set/get — they all operate on the same store.
const useAppStore = create<AppStore>((...args) => ({
  ...createCounterSlice(...args),
  ...createNotifSlice(...args),
}))

function CounterPanel() {
  const count            = useAppStore((s) => s.count)
  const increment        = useAppStore((s) => s.increment)
  const decrement        = useAppStore((s) => s.decrement)
  const incrementWithLog = useAppStore((s) => s.incrementWithLog)

  return (
    <div className="p-4 rounded border border-zinc-800 bg-zinc-900 space-y-3">
      <p className="text-zinc-500 text-xs">Counter slice</p>
      <div className="text-3xl font-bold text-center tabular-nums">{count}</div>
      <div className="flex gap-2 justify-center">
        <Btn onClick={decrement}>−</Btn>
        <Btn onClick={increment}>+</Btn>
        <Btn onClick={incrementWithLog} highlight>+ with log</Btn>
      </div>
    </div>
  )
}

function NotifPanel() {
  const messages = useAppStore((s) => s.messages)
  const clearAll = useAppStore((s) => s.clearAll)

  return (
    <div className="p-4 rounded border border-zinc-800 bg-zinc-900 space-y-2">
      <div className="flex justify-between items-center">
        <p className="text-zinc-500 text-xs">Notification slice</p>
        <Btn onClick={clearAll} muted>clear</Btn>
      </div>
      <div className="min-h-[4rem] space-y-0.5">
        {messages.length === 0
          ? <p className="text-zinc-700 text-xs">no messages — click "+ with log"</p>
          : messages.map((m, i) => (
              <p key={i} className="text-xs text-zinc-400">• {m}</p>
            ))
        }
      </div>
    </div>
  )
}

function WorkedExample() {
  return (
    <Section title="Worked Example — Counter + Notification slices">
      <p className="text-zinc-400 mb-4 text-xs leading-relaxed">
        Two slices combined into one store. <Code>incrementWithLog</Code> is a
        cross-slice action: it calls <Code>set</Code> on the counter slice and
        then calls <Code>addMessage</Code> from the notification slice via <Code>get()</Code>.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <CounterPanel />
        <NotifPanel />
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// YOUR TURN — Add a Theme slice
// ═══════════════════════════════════════════════════════════════════════════════
//
// Add a third slice to the store: ThemeSlice.
//
// ThemeSlice needs:
//   - theme: 'dark' | 'light'   (default 'dark')
//   - toggleTheme: () => void    (flips between dark and light)
//   - logThemeChange: () => void (cross-slice: toggle theme AND add a notification
//                                  like "theme changed → light" using get().addMessage)
//
// Steps:
//   1. Fill in the ThemeSlice interface below
//   2. Fill in createThemeSlice
//   3. Add ThemeSlice to CombinedStore type
//   4. Spread ...createThemeSlice(...args) into useCombinedStore

interface ThemeSlice {
  theme:           'dark' | 'light'
  toggleTheme:     () => void
  logThemeChange:  () => void
}

// ??? Step 3: add ThemeSlice here
type CombinedStore = CounterSlice & NotifSlice & ThemeSlice// & ???ThemeSlice

// ??? Step 2: fill in this slice
// incrementWithLog: () => {
//   set((s) => ({ count: s.count + 1 }))
//   const newCount = get().count  // read updated count after set()
//   get().addMessage(`count changed → ${newCount}`)  // call another slice's action
// },

const createThemeSlice: StateCreator<CombinedStore, [], [], ThemeSlice> = (set, get) => ({
  theme:          'dark',
  toggleTheme:    () => set((s) => ({theme: s.theme === 'dark' ? 'light' : 'dark'})),  // ??? flip between 'dark' and 'light'
  logThemeChange: () => {
    get().toggleTheme()
    get().addMessage(`Theme Changed to ${get().theme}`)
  }  // ??? toggle theme AND call get().addMessage(...)
})

// ??? Step 4: add ...createThemeSlice(...args) to this store
const useCombinedStore = create<CombinedStore>((...args) => ({
  ...createCounterSlice(...args),
  ...createNotifSlice(...args),
  // ??? ...createThemeSlice(...args),
  ...createThemeSlice(...args)
}))

function ThemePanel() {
  // ??? read theme and logThemeChange from useCombinedStore
  const theme           = useCombinedStore((s) => s.theme)  // ??? replace with store selector
  const logThemeChange  = useCombinedStore((s) => s.logThemeChange)                     // ??? replace with store selector

  return (
    <div
      className={`p-4 rounded border space-y-3 transition-colors ${
        theme === 'dark' ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-300 bg-zinc-100'
      }`}
    >
      <p className={`text-xs ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>
        Theme slice — current: <Code>{theme}</Code>
      </p>
      <Btn onClick={logThemeChange} highlight>toggle + log</Btn>
    </div>
  )
}

function YourTurnNotifPanel() {
  const messages = useCombinedStore((s) => s.messages)
  const clearAll = useCombinedStore((s) => s.clearAll)
  return (
    <div className="p-4 rounded border border-zinc-800 bg-zinc-900 space-y-2">
      <div className="flex justify-between items-center">
        <p className="text-zinc-500 text-xs">Notification slice (shared)</p>
        <Btn onClick={clearAll} muted>clear</Btn>
      </div>
      <div className="min-h-[3rem] space-y-0.5">
        {messages.length === 0
          ? <p className="text-zinc-700 text-xs">click "toggle + log" to see cross-slice action</p>
          : messages.map((m, i) => <p key={i} className="text-xs text-zinc-400">• {m}</p>)
        }
      </div>
    </div>
  )
}

function YourTurn() {
  return (
    <Section title="Your Turn — Add a Theme slice">
      <p className="text-zinc-400 mb-4 text-xs leading-relaxed">
        Fill in <Code>createThemeSlice</Code>, add <Code>ThemeSlice</Code> to{' '}
        <Code>CombinedStore</Code>, and spread it into <Code>useCombinedStore</Code>.
        The "toggle + log" button should flip the theme and add a message to the notification slice.
      </p>
      <div className="space-y-3">
        <ThemePanel />
        <YourTurnNotifPanel />
      </div>
    </Section>
  )
}

export default function Lesson04Slices() {
  return (
    <div className="max-w-2xl mx-auto space-y-10">
      <h1 className="text-lg font-semibold text-white">Lesson 04 — Slices</h1>
      <WorkedExample />
      <YourTurn />
    </div>
  )
}

// ─── QUESTIONS ───────────────────────────────────────────────────────────────
// Q1: In createCounterSlice, why is TStore typed as AppStore (the full store)
//     rather than just CounterSlice?
//
// Q2: Each createXSlice receives the SAME (set, get, api) args from create().
//     What does this mean for cross-slice actions — does set() in one slice
//     affect the other slices?
//
// Q3: When you spread slices in create(), the order matters if two slices
//     define the same key. Which one wins? Can you think of a real bug this
//     would cause?
//
// ANSWERS: (hidden — try yourself first)
// A1: Because get() inside createCounterSlice needs to return the full store —
//     specifically addMessage from NotifSlice. If TStore were only CounterSlice,
//     TypeScript would error on get().addMessage because that function doesn't
//     exist in CounterSlice. TStore tells TypeScript what get() returns.
//
// A2: Yes — they all share the same store. set() from any slice updates the
//     same combined state object. get() from any slice reads the same state.
//     There is only ONE store at runtime; slices are just a code-organisation
//     pattern, not isolated state containers.
//
// A3: The last spread wins (JavaScript object spread behaviour). If both
//     CounterSlice and NotifSlice defined `reset`, the NotifSlice reset would
//     overwrite the CounterSlice one silently. To avoid this, either namespace
//     action names (counterReset, notifReset) or make a single reset action in
//     one slice that calls set() with the combined initial state.
// ─────────────────────────────────────────────────────────────────────────────

// ─── ANSWERS FOR YOUR TURN ────────────────────────────────────────────────────
// type CombinedStore = CounterSlice & NotifSlice & ThemeSlice
//
// createThemeSlice: StateCreator<CombinedStore, [], [], ThemeSlice> = (set, get) => ({
//   theme: 'dark',
//   toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
//   logThemeChange: () => {
//     set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' }))
//     const next = get().theme
//     get().addMessage(`theme changed → ${next}`)
//   },
// })
//
// useCombinedStore = create<CombinedStore>((...args) => ({
//   ...createCounterSlice(...args),
//   ...createNotifSlice(...args),
//   ...createThemeSlice(...args),
// }))
//
// In ThemePanel:
//   const theme          = useCombinedStore((s) => s.theme)
//   const logThemeChange = useCombinedStore((s) => s.logThemeChange)
// ─────────────────────────────────────────────────────────────────────────────

function Btn({ onClick, children, muted, highlight }: {
  onClick: () => void
  children: React.ReactNode
  muted?: boolean
  highlight?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
        highlight ? 'bg-blue-700 hover:bg-blue-600 text-white' :
        muted     ? 'border border-zinc-700 text-zinc-400 hover:text-white' :
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

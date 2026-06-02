/**
 * LESSON 03 — Multiple Fields, Complex Actions, Reset
 *
 * Real stores have multiple related fields and actions that update several
 * of them together. Key patterns this lesson covers:
 *
 *   1. Updating multiple fields in one set() call
 *      set((s) => ({ fieldA: ..., fieldB: ... }))
 *      Zustand merges the partial — only listed fields change.
 *
 *   2. Conditional logic inside an action
 *      if (s.something) return {}   — early exit with empty patch (no re-render)
 *
 *   3. The reset pattern
 *      Keep the initial state in a constant; set(INITIAL_STATE) resets everything.
 *
 *   4. Deriving values inside an action
 *      Actions are just functions — you can do any JS logic before calling set.
 */

import { create } from 'zustand'

// ═══════════════════════════════════════════════════════════════════════════════
// WORKED EXAMPLE — Shopping Cart
// ═══════════════════════════════════════════════════════════════════════════════

interface CartItem {
  id:    string
  name:  string
  price: number
  qty:   number
}

interface CartStore {
  items:     CartItem[]
  discount:  number          // 0–1, e.g. 0.1 = 10% off
  addItem:   (item: Omit<CartItem, 'qty'>) => void
  removeItem:(id: string) => void
  setQty:    (id: string, qty: number) => void
  applyCode: (code: string) => void
  reset:     () => void
  // Derived value: not stored, computed on read. Keeps state minimal.
  total:     () => number    // NOTE: this is a getter function, not stored state
}

const INITIAL_CART: Pick<CartStore, 'items' | 'discount'> = {
  items:    [],
  discount: 0,
}

const useCartStore = create<CartStore>((set, get) => ({
  ...INITIAL_CART,

  addItem: (item) => set((s) => {
    // If item already in cart, just increment qty instead of duplicating.
    const existing = s.items.find((i) => i.id === item.id)
    if (existing) {
      return { items: s.items.map((i) => i.id === item.id ? { ...i, qty: i.qty + 1 } : i) }
    }
    return { items: [...s.items, { ...item, qty: 1 }] }
  }),

  removeItem: (id) => set((s) => ({
    items: s.items.filter((i) => i.id !== id),
  })),

  setQty: (id, qty) => set((s) => ({
    // qty <= 0 removes the item entirely — two state transitions in one action.
    items: qty <= 0
      ? s.items.filter((i) => i.id !== id)
      : s.items.map((i) => i.id === id ? { ...i, qty } : i),
  })),

  applyCode: (code) => set(() => {
    const codes: Record<string, number> = { SAVE10: 0.1, SAVE20: 0.2, HALF: 0.5 }
    const d = codes[code.toUpperCase()]
    if (d === undefined) return {}  // invalid code — no change, no re-render
    return { discount: d }
  }),

  // Reset: spread the initial state constant — one line clears everything.
  reset: () => set(INITIAL_CART),

  // Derived: total is computed from current state on demand via get().
  // It is NOT stored in the state — computing and storing it would create
  // a sync problem (you'd have to update it in every action that changes items).
  // get() always returns the current state snapshot.
  total: () => {
    const { items, discount } = get()
    const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0)
    return subtotal * (1 - discount)
  },
}))

const SAMPLE_PRODUCTS = [
  { id: 'a', name: 'Box (S)',  price: 4.99 },
  { id: 'b', name: 'Box (M)',  price: 7.49 },
  { id: 'c', name: 'Pallet',   price: 24.99 },
]

function CartDemo() {
  const items      = useCartStore((s) => s.items)
  const discount   = useCartStore((s) => s.discount)
  const addItem    = useCartStore((s) => s.addItem)
  const removeItem = useCartStore((s) => s.removeItem)
  const setQty     = useCartStore((s) => s.setQty)
  const applyCode  = useCartStore((s) => s.applyCode)
  const reset      = useCartStore((s) => s.reset)
  const total      = useCartStore((s) => s.total)

  return (
    <div className="p-5 rounded-lg border border-zinc-800 bg-zinc-900 space-y-4">
      {/* Products */}
      <div className="flex gap-2 flex-wrap">
        {SAMPLE_PRODUCTS.map((p) => (
          <Btn key={p.id} onClick={() => addItem(p)}>+ {p.name}</Btn>
        ))}
      </div>

      {/* Cart items */}
      {items.length === 0 ? (
        <p className="text-zinc-600 text-xs">Cart is empty</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 text-xs text-zinc-300">
              <span className="w-20 truncate">{item.name}</span>
              <span className="text-zinc-500">${item.price.toFixed(2)}</span>
              <input
                type="number"
                min={0}
                value={item.qty}
                onChange={(e) => setQty(item.id, parseInt(e.target.value) || 0)}
                className="w-12 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-center"
              />
              <button onClick={() => removeItem(item.id)} className="text-zinc-600 hover:text-red-400">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Discount code */}
      <DiscountInput applyCode={applyCode} discount={discount} />

      {/* Total */}
      <div className="flex justify-between items-center pt-2 border-t border-zinc-800 text-sm">
        <span className="text-zinc-400">Total{discount > 0 && <span className="text-green-500 ml-1">(-{discount * 100}%)</span>}</span>
        <span className="font-bold">${total().toFixed(2)}</span>
      </div>

      <Btn onClick={reset} muted>reset cart</Btn>
    </div>
  )
}

function DiscountInput({ applyCode, discount }: { applyCode: (c: string) => void; discount: number }) {
  const [code, setCode] = React.useState('')
  return (
    <div className="flex gap-2 items-center">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="promo code (SAVE10, SAVE20, HALF)"
        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 placeholder-zinc-600"
      />
      <Btn onClick={() => applyCode(code)}>Apply</Btn>
      {discount > 0 && <span className="text-green-400 text-xs">✓</span>}
    </div>
  )
}

function WorkedExample() {
  return (
    <Section title="Worked Example — Shopping Cart">
      <p className="text-zinc-400 mb-4 leading-relaxed text-xs">
        Multiple fields updated together, conditional logic, reset pattern, and a derived <Code>total()</Code> computed on read via <Code>get()</Code>.
      </p>
      <CartDemo />
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// YOUR TURN — Todo List
// ═══════════════════════════════════════════════════════════════════════════════
//
// Build a todo list store. A Todo has: id, text, done.
// The store needs:
//   - todos: Todo[]
//   - addTodo: (text: string) => void       — adds a new todo (done: false)
//   - toggleTodo: (id: string) => void      — flips done true/false
//   - removeDone: () => void                — removes all completed todos
//   - reset: () => void                     — clears everything
//
// The UI below is provided. Fill in the store implementation.

interface Todo {
  id:   string
  text: string
  done: boolean
}

interface TodoStore {
  todos:      Todo[]
  addTodo:    (text: string) => void
  toggleTodo: (id: string) => void
  removeDone: () => void
  reset:      () => void
}



//    (item: Omit<CartItem, 'qty'>) => void
const useTodoStore = create<TodoStore>((set) => ({
  todos:      [],
  
  addTodo:    (_text) => set((s) => ({todos: [...s.todos, {id:crypto.randomUUID(), text: _text, done: false}]})),  
  // ??? add a new todo with id=crypto.randomUUID(), done=false
  toggleTodo: (_id) => set((s) => {
    const existing: Todo = s.todos.find((item) => item.id === _id)

  }),         // ??? flip done for the matching todo
  removeDone: () => set((s) => ({
    todos: s.todos.filter((todo) => !(todo.done))
  })),            // ??? filter out todos where done === true
  reset: () => {},            // ??? clear todos array
}))

function TodoApp() {
  const todos      = useTodoStore((s) => s.todos)
  const addTodo    = useTodoStore((s) => s.addTodo)
  const toggleTodo = useTodoStore((s) => s.toggleTodo)
  const removeDone = useTodoStore((s) => s.removeDone)
  const reset      = useTodoStore((s) => s.reset)
  const [input, setInput] = React.useState('')

  const submit = () => {
    if (!input.trim()) return
    addTodo(input.trim())
    setInput('')
  }

  const doneCount = todos.filter((t) => t.done).length

  return (
    <div className="p-5 rounded-lg border border-zinc-700 bg-zinc-900 space-y-3">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="new todo..."
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 placeholder-zinc-600"
        />
        <Btn onClick={submit}>Add</Btn>
      </div>

      <div className="space-y-1 min-h-[3rem]">
        {todos.length === 0 && <p className="text-zinc-600 text-xs">no todos yet</p>}
        {todos.map((t) => (
          <div
            key={t.id}
            onClick={() => toggleTodo(t.id)}
            className={`flex items-center gap-2 text-xs cursor-pointer select-none px-2 py-1 rounded hover:bg-zinc-800 ${t.done ? 'text-zinc-600 line-through' : 'text-zinc-300'}`}
          >
            <span>{t.done ? '☑' : '☐'}</span>
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2 items-center pt-1 border-t border-zinc-800">
        <span className="text-zinc-600 text-xs flex-1">{doneCount} done / {todos.length} total</span>
        <Btn onClick={removeDone} muted>remove done</Btn>
        <Btn onClick={reset} muted>reset</Btn>
      </div>
    </div>
  )
}

function YourTurn() {
  return (
    <Section title="Your Turn — Todo List">
      <p className="text-zinc-400 mb-4 text-xs leading-relaxed">
        Fill in the four actions in <Code>useTodoStore</Code>. Click todos to toggle them.
        "remove done" should clear completed ones. "reset" clears everything.
      </p>
      <TodoApp />
    </Section>
  )
}

export default function Lesson03Actions() {
  return (
    <div className="max-w-2xl mx-auto space-y-10">
      <h1 className="text-lg font-semibold text-white">Lesson 03 — Multiple Fields & Actions</h1>
      <WorkedExample />
      <YourTurn />
    </div>
  )
}

// ─── QUESTIONS ───────────────────────────────────────────────────────────────
// Q1: In CartStore, `total` is a function that calls get() instead of a stored
//     number. What would go wrong if you stored total as a number and tried to
//     keep it in sync manually?
//
// Q2: In addItem, when the item already exists we return early with just
//     { items: ... }. The `discount` field is NOT included in that return value.
//     Does discount get reset to 0? Why or why not?
//
// Q3: Why does the INITIAL_CART constant make the reset action safer than
//     writing set({ items: [], discount: 0 }) directly in the reset action?
//
// ANSWERS: (hidden — try yourself first)
// A1: You'd need to recalculate total inside every action that touches items
//     or discount (addItem, removeItem, setQty, applyCode). Miss one and total
//     is stale. You'd also need to store it in state, triggering extra re-renders.
//     Computing on read (via get()) keeps the state minimal and always consistent.
//
// A2: No — Zustand merges patches. Only the fields you return are updated.
//     Returning { items: ... } only touches items; discount stays as-is.
//     This is why Zustand is called a "partial update" store.
//
// A3: If you later add a new field to the store (e.g., `couponCode: ''`),
//     you only need to add it to INITIAL_CART once. The reset action picks it
//     up automatically. If you wrote the fields out in reset directly, you'd
//     have to remember to update reset too — easy to forget.
// ─────────────────────────────────────────────────────────────────────────────

// ─── ANSWERS FOR YOUR TURN ────────────────────────────────────────────────────
// addTodo: (text) => set((s) => ({
//   todos: [...s.todos, { id: crypto.randomUUID(), text, done: false }],
// })),
// toggleTodo: (id) => set((s) => ({
//   todos: s.todos.map((t) => t.id === id ? { ...t, done: !t.done } : t),
// })),
// removeDone: () => set((s) => ({ todos: s.todos.filter((t) => !t.done) })),
// reset: () => set({ todos: [] }),
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react'

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

import { useState } from 'react'
import { X, Pencil } from 'lucide-react'
import { useStore } from '@/src/store'
import { getBoxColor, } from '@/src/lib/colors'
import { BOX_DEFAULTS } from '@/src/store/boxSlice'
import { BoxEditDialog } from './BoxEditDialog'

const EMPTY = { label: '', w: '', h: '', d: '', quantity: '1' }

interface Constraints {
  rotationAllowed: boolean
  stackingOnTop:   boolean
  stackingUnder:   boolean
}

export function BoxForm() {
  const [form, setForm] = useState(EMPTY)
  const [constraints, setConstraints] = useState<Constraints>({ ...BOX_DEFAULTS })
  const [editingBoxId, setEditingBoxId] = useState<string | null>(null)
  const boxes = useStore((s) => s.boxes)
  const addBox = useStore((s) => s.addBox)
  const removeBox = useStore((s) => s.removeBox)

  const set = (key: keyof typeof EMPTY, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const toggleConstraint = (key: keyof Constraints) =>
    setConstraints((c) => ({ ...c, [key]: !c[key] }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const w = parseFloat(form.w)
    const h = parseFloat(form.h)
    const d = parseFloat(form.d)
    const quantity = Math.max(1, parseInt(form.quantity, 10) || 1)
    if (!w || !h || !d) return
    addBox({
      label: form.label.trim() || `Box ${boxes.length + 1}`,
      w,
      h,
      d,
      quantity,
      ...constraints,
    })
    setForm(EMPTY)
    setConstraints({ ...BOX_DEFAULTS })
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          value={form.label}
          onChange={(e) => set('label', e.target.value)}
          placeholder="Label (optional)"
          className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="grid grid-cols-3 gap-1.5">
          {(['w', 'h', 'd'] as const).map((k) => (
            <input
              key={k}
              value={form[k]}
              onChange={(e) => set(k, e.target.value)}
              placeholder={k.toUpperCase()}
              type="number"
              min="1"
              className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">W × H × D in cm</p>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground whitespace-nowrap">Qty</label>
          <input
            value={form.quantity}
            onChange={(e) => set('quantity', e.target.value)}
            type="number"
            min="1"
            className="w-20 rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex items-center justify-between pt-0.5">
          {([
            { key: 'rotationAllowed', label: 'Rotation' },
            { key: 'stackingOnTop',   label: 'Stack top' },
            { key: 'stackingUnder',   label: 'Stack under' },
          ] as const).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={constraints[key]}
                onChange={() => toggleConstraint(key)}
                className="h-3 w-3 cursor-pointer accent-primary"
              />
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </label>
          ))}
        </div>
        <button
          type="submit"
          className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Add Box
        </button>
      </form>

      {/* Edit dialog — rendered once, controlled by editingBoxId */}
      {editingBoxId && (() => {
        const box = boxes.find((b) => b.id === editingBoxId)
        return box ? (
          <BoxEditDialog
            box={box}
            open
            onClose={() => setEditingBoxId(null)}
          />
        ) : null
      })()}

      {/* Box list */}
      {boxes.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {boxes.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{b.label}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    {b.w} × {b.h} × {b.d} cm
                  </span>
                  <span className="text-[10px] text-muted-foreground">·</span>
                  <span className="text-[10px] text-muted-foreground">qty {b.quantity}</span>
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: getBoxColor(b.colorIndex) }}
                  />
                </div>
              </div>
              <div className="ml-2 flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditingBoxId(b.id)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={`Edit ${b.label}`}
                >
                  <Pencil size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => removeBox(b.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`Remove ${b.label}`}
                >
                  <X size={12} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

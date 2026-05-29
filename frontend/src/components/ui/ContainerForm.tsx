import { useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '@/src/store'
import { CONTAINER_PRESETS } from '@/src/lib/presets'

const EMPTY = { label: '', w: '', h: '', d: '' }

export function ContainerForm() {
  const [form, setForm] = useState(EMPTY)
  const containers = useStore((s) => s.containers)
  const addContainer = useStore((s) => s.addContainer)
  const removeContainer = useStore((s) => s.removeContainer)

  const set = (key: keyof typeof EMPTY, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handlePreset = (preset: (typeof CONTAINER_PRESETS)[number]) => {
    addContainer({ ...preset, label: `${preset.label} ${containers.length + 1}` })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const w = parseFloat(form.w)
    const h = parseFloat(form.h)
    const d = parseFloat(form.d)
    if (!w || !h || !d) return
    addContainer({
      label: form.label.trim() || `Container ${containers.length + 1}`,
      w,
      h,
      d,
    })
    setForm(EMPTY)
  }

  return (
    <div className="space-y-3">
      {/* Presets */}
      <div className="flex gap-2">
        {CONTAINER_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => handlePreset(p)}
            className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom form */}
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
        <button
          type="submit"
          className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Add Custom
        </button>
      </form>

      {/* Container list */}
      {containers.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {containers.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{c.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  {c.w} × {c.h} × {c.d} cm
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeContainer(c.id)}
                className="ml-2 shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                aria-label={`Remove ${c.label}`}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

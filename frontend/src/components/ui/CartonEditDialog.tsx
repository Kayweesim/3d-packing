import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useStore } from '@/src/store'
import { getCartonColor } from '@/src/lib/colors'
import { CartonPreview } from '../3d/CartonPreview'
import type { Carton } from '@/src/store/cartonSlice'

interface Props {
  palletId: string
  carton: Carton
  open: boolean
  onClose: () => void
}

interface FormState {
  label: string
  w: string
  h: string
  d: string
  quantity: string
  rotationAllowed: boolean
  stackingOnTop: boolean
  stackingUnder: boolean
}

export function CartonEditDialog({ palletId, carton, open, onClose }: Props) {
  const updatePalletCarton = useStore((s) => s.updatePalletCarton)

  const [form, setForm] = useState<FormState>({
    label:           carton.label,
    w:               String(carton.w),
    h:               String(carton.h),
    d:               String(carton.d),
    quantity:        String(carton.quantity),
    rotationAllowed: carton.rotationAllowed,
    stackingOnTop:   carton.stackingOnTop,
    stackingUnder:   carton.stackingUnder,
  })

  useEffect(() => {
    if (open) {
      setForm({
        label:           carton.label,
        w:               String(carton.w),
        h:               String(carton.h),
        d:               String(carton.d),
        quantity:        String(carton.quantity),
        rotationAllowed: carton.rotationAllowed,
        stackingOnTop:   carton.stackingOnTop,
        stackingUnder:   carton.stackingUnder,
      })
    }
  }, [open, carton])

  const set = (key: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const toggle = (key: 'rotationAllowed' | 'stackingOnTop' | 'stackingUnder') =>
    setForm((f) => ({ ...f, [key]: !f[key] }))

  const handleSave = () => {
    const w = parseFloat(form.w)
    const h = parseFloat(form.h)
    const d = parseFloat(form.d)
    const quantity = Math.max(1, parseInt(form.quantity, 10) || 1)
    if (!w || !h || !d) return
    updatePalletCarton(palletId, carton.id, {
      label:           form.label.trim() || carton.label,
      w, h, d, quantity,
      rotationAllowed: form.rotationAllowed,
      stackingOnTop:   form.stackingOnTop,
      stackingUnder:   form.stackingUnder,
    })
    onClose()
  }

  const previewW = parseFloat(form.w) || carton.w
  const previewH = parseFloat(form.h) || carton.h
  const previewD = parseFloat(form.d) || carton.d

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-110 max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl focus:outline-none">

          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-sm font-semibold">Edit Carton</Dialog.Title>
            <Dialog.Close
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={14} />
            </Dialog.Close>
          </div>

          <div className="mb-4 overflow-hidden rounded-md border border-border bg-background">
            <CartonPreview
              w={previewW}
              h={previewH}
              d={previewD}
              color={getCartonColor(carton.colorIndex)}
            />
          </div>

          <div className="space-y-3">
            <input
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder="Product name"
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
                className="w-20 rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex items-center justify-between pt-0.5">
              {([
                { key: 'rotationAllowed', label: 'Rotation'    },
                { key: 'stackingOnTop',   label: 'Stack top'   },
                { key: 'stackingUnder',   label: 'Stack under' },
              ] as const).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={() => toggle(key)}
                    className="h-3 w-3 cursor-pointer accent-primary"
                  />
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Save
              </button>
            </div>
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * AddPalletDialog.tsx — modal for creating a new pallet with one or more cartons.
 *
 * Exports: AddPalletDialog.
 * Form state uses Omit<Carton, 'id'> directly — the same type the store owns —
 * so there is no parallel CartonForm interface to keep in sync. The `id` field
 * is excluded because it is generated with crypto.randomUUID() on save.
 * Number inputs parse to numbers on change; 0 renders as an empty field.
 */
import { useState, useEffect } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useStore } from '@/src/store'
import type { Carton } from '@/src/store/cartonSlice'
import type { Pallet } from '@/src/store/palletSlice'

type NewCarton = Omit<Carton, 'id'>

function emptyCarton(): NewCarton {
  return { label: '', w: 0, h: 0, d: 0, quantity: 1, rotationAllowed: true, stacking: true }
}

interface Props {
  open: boolean
  onClose: () => void
}

export function AddPalletDialog({ open, onClose }: Props) {
  const addPallet = useStore((s) => s.addPallet)

  const [palletLabel, setPalletLabel] = useState('')
  const [cartons, setCartons] = useState<NewCarton[]>([emptyCarton()])

  // Reset form each time the dialog opens.
  useEffect(() => {
    if (open) {
      setPalletLabel('')
      setCartons([emptyCarton()])
    }
  }, [open])

  function updateCarton(i: number, key: keyof NewCarton, value: string | boolean) {
    setCartons((prev) =>
      prev.map((c, idx) => {
        if (idx !== i) return c
        if (key === 'rotationAllowed' || key === 'stacking') {
          return { ...c, [key]: value as boolean }
        }
        if (key === 'w' || key === 'h' || key === 'd' || key === 'quantity') {
          return { ...c, [key]: parseFloat(value as string) || 0 }
        }
        return { ...c, [key]: value }
      })
    )
  }

  function addCartonRow() {
    setCartons((prev) => [...prev, emptyCarton()])
  }

  function removeCartonRow(i: number) {
    setCartons((prev) => prev.filter((_, idx) => idx !== i))
  }

  function handleSave() {
    const label = palletLabel.trim() || `PLT-${Date.now()}`
    const newPallet: Pallet = {
      id: crypto.randomUUID(),
      label,
      cartons: cartons.map((c) => ({
        ...c,
        id: crypto.randomUUID(),
        label: c.label.trim() || 'Carton',
        w: c.w || 25,
        h: c.h || 25,
        d: c.d || 25,
        quantity: Math.max(1, c.quantity || 1),
      })),
    }
    addPallet(newPallet)
    onClose()
  }

  const canSave = cartons.length > 0

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-110 max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl focus:outline-none">

          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-sm font-semibold">New Pallet</Dialog.Title>
            <Dialog.Close type="button" className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={14} />
            </Dialog.Close>
          </div>

          {/* Pallet label */}
          <div className="mb-4">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-1.5">
              Pallet ID / Label
            </label>
            <input
              value={palletLabel}
              onChange={(e) => setPalletLabel(e.target.value)}
              placeholder="e.g. PLT-004"
              className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Carton rows */}
          <div className="space-y-3 mb-4">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Cartons
            </span>

            {cartons.map((c, i) => (
              <div key={i} className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Carton {i + 1}</span>
                  {cartons.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCartonRow(i)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>

                <input
                  value={c.label}
                  onChange={(e) => updateCarton(i, 'label', e.target.value)}
                  placeholder="Product name"
                  className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />

                <div className="grid grid-cols-3 gap-1.5">
                  {(['w', 'h', 'd'] as const).map((k) => (
                    <input
                      key={k}
                      value={c[k] === 0 ? '' : c[k]}
                      onChange={(e) => updateCarton(i, k, e.target.value)}
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
                    value={c.quantity === 0 ? '' : c.quantity}
                    onChange={(e) => updateCarton(i, 'quantity', e.target.value)}
                    type="number"
                    min="1"
                    className="w-20 rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div className="flex items-center gap-4">
                  {(['rotationAllowed', 'stacking'] as const).map((key) => (
                    <label key={key} className="flex items-center gap-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={c[key]}
                        onChange={(e) => updateCarton(i, key, e.target.checked)}
                        className="h-3 w-3 cursor-pointer accent-primary"
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {key === 'rotationAllowed' ? 'Rotation' : 'Stacking'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addCartonRow}
              className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
            >
              <Plus size={11} />
              Add Carton
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
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
              disabled={!canSave}
              className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

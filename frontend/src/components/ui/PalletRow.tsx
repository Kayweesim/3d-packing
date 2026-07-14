/**
 * PalletRow.tsx — accordion row for a single pallet in the sidebar.
 *
 * Exports: PalletRow.
 * Collapsed: shows pallet label, SKU count, carton count, and a remove button.
 * Expanded: lists each carton type with its dims, qty, rotation/stacking badges,
 * and an edit pencil that opens CartonEditDialog.
 */
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Layers, Pencil, RotateCw, X } from 'lucide-react'
import { useStore } from '@/src/store'
import { buildProductColorMap } from '@/src/lib/colors'
import { CartonEditDialog } from './CartonEditDialog'
import type { Pallet } from '@/src/store/palletSlice'
import type { Carton } from '@/src/store/cartonSlice'

interface Props {
  pallet: Pallet
  palletIndex: number
  needle?: string
  isFirstMatch?: boolean
}

/**
 * Collapsible row for one pallet.
 * @param pallet The pallet data to display.
 * @param palletIndex Array index in the pallets store — drives carton color via getCartonColor.
 */
export function PalletRow({ pallet, palletIndex, needle, isFirstMatch }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editingCarton, setEditingCarton] = useState<Carton | null>(null)
  const removePallet      = useStore((s) => s.removePallet)
  const dimensionBuffer   = useStore((s) => s.dimensionBuffer)
  const pallets           = useStore((s) => s.pallets)

  // Product-based colors — matches the 3D scene (same product = same color).
  const productColors = useMemo(() => buildProductColorMap(pallets), [pallets])

  const totalCartons = pallet.cartons.reduce((sum, c) => sum + c.quantity, 0)

  return (
    <>
      <div
        data-pallet-id={pallet.id}
        className={`rounded-md border overflow-hidden transition-all duration-200 ${
          isFirstMatch ? 'border-primary/60' : 'border-border'
        } ${needle && !pallet.label.toLowerCase().includes(needle) ? 'opacity-15' : ''}`}
      >
        {/* Header row */}
        <div className="flex items-center gap-1.5 px-2.5 py-2">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          >
            {expanded
              ? <ChevronDown  size={12} className="shrink-0 text-muted-foreground" />
              : <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
            }
            <span className="text-xs font-medium truncate">{pallet.label}</span>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-auto pr-1.5">
              {pallet.cartons.length} SKU · {totalCartons} cartons
            </span>
          </button>

          <button
            type="button"
            onClick={() => removePallet(pallet.id)}
            className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
            aria-label={`Remove ${pallet.label}`}
          >
            <X size={12} />
          </button>
        </div>

        {/* Carton list */}
        {expanded && (
          <ul className="border-t border-border divide-y divide-border">
            {pallet.cartons.map((carton) => (
              <li key={carton.id} className="flex items-center justify-between px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-sm shrink-0"
                      style={{ backgroundColor: productColors.get(carton.productCode ?? carton.label) }}
                    />
                    <p className="truncate text-xs font-medium">{carton.label}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {dimensionBuffer > 0 ? (() => {
                      const scale = 1 + dimensionBuffer / 100
                      const fmt = (v: number) => parseFloat((v * scale).toFixed(1))
                      return (
                        <>
                          <span className="text-foreground">
                            {fmt(carton.w)} × {fmt(carton.h)} × {fmt(carton.d)} cm
                          </span>
                          <span className="ml-1 opacity-50">
                            ({carton.w}×{carton.h}×{carton.d})
                          </span>
                          {' · '}qty {carton.quantity}
                        </>
                      )
                    })() : (
                      <>{carton.w} × {carton.h} × {carton.d} cm · qty {carton.quantity}</>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="flex items-center gap-0.5 text-[10px]"
                      style={{ color: carton.rotationAllowed ? 'var(--color-foreground)' : 'var(--color-muted-foreground)', opacity: carton.rotationAllowed ? 1 : 0.4 }}
                      title={carton.rotationAllowed ? 'Rotation allowed' : 'No rotation'}
                    >
                      <RotateCw size={9} />
                      Rotate
                    </span>
                    <span
                      className="flex items-center gap-0.5 text-[10px]"
                      style={{ color: carton.stacking ? 'var(--color-foreground)' : 'var(--color-muted-foreground)', opacity: carton.stacking ? 1 : 0.4 }}
                      title={carton.stacking ? 'Stackable' : 'Not stackable'}
                    >
                      <Layers size={9} />
                      Stack
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingCarton(carton)}
                  className="ml-2 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={`Edit ${carton.label}`}
                >
                  <Pencil size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editingCarton && (
        <CartonEditDialog
          palletId={pallet.id}
          palletIndex={palletIndex}
          carton={editingCarton}
          open
          onClose={() => setEditingCarton(null)}
        />
      )}
    </>
  )
}

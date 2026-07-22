/**
 * palletPackSlice.ts — single-SKU pallet packing state + runPalletPacker action.
 *
 * Exports: PalletPackSlice, ManualBox, createPalletPackSlice.
 * A parallel stack to packingSlice (container packing) — it shares nothing with
 * it, owns its own carton catalog (palletCartons, independent of the container's
 * palletSlice), and switches on uiSlice.packingMode at the UI/Canvas layer.
 * runPalletPacker resolves the input carton (a manual box, or one selected from
 * palletCartons), calls apiPalletPack, and stores the result.
 */
import type { StateCreator } from 'zustand'
import type { Carton } from './cartonSlice'
import { PackError } from '../lib/api'
import { apiPalletPack } from '../lib/palletApi'
import type { PalletPackRequest, PalletPackResult } from '../lib/palletApi'
import type { PalletTypeKey } from '../lib/palletTypes'
import { getPalletType, DEFAULT_PALLET_KEY } from '../lib/palletTypes'

/** A manually-entered carton (used when not selecting one from the manifest). */
export interface ManualBox {
  label: string
  w: number
  h: number
  d: number
  rotationAllowed: boolean
  stacking: boolean
}

// Sample cartons the pallet-packing feature offers by default, so its selector is
// never empty even before a container manifest is imported. Owned here (not in
// palletSlice, which is the container domain). `quantity` is unused — the pallet
// quantity comes from palletQuantity.
const DEFAULT_PALLET_CARTONS: Carton[] = [
  { id: 'sample-a', label: 'Carton A', w: 50, h: 125, d: 50, quantity: 1, rotationAllowed: true, stacking: true },
  { id: 'sample-b', label: 'Carton B', w: 90, h: 40,  d: 30, quantity: 1, rotationAllowed: true, stacking: true },
  { id: 'sample-c', label: 'Carton C', w: 60, h: 30,  d: 50, quantity: 1, rotationAllowed: true, stacking: true },
  { id: 'sample-d', label: 'Carton D', w: 45, h: 30,  d: 25, quantity: 1, rotationAllowed: true, stacking: true },
]

export interface PalletPackSlice {
  // ── Result / status ──
  palletPackResult: PalletPackResult | null
  palletLoading: boolean
  palletError: string | null

  // This feature's own carton catalog — the sole source of selectable cartons
  // (independent of container packing). Seeded with DEFAULT_PALLET_CARTONS.
  palletCartons: Carton[]

  // ── Inputs ──
  palletType: PalletTypeKey
  palletMaxHeight: number      // cm — load-height cap above the deck
  palletQuantity: number
  selectedCartonId: string | null  // carton chosen from the selector
  manualBox: ManualBox | null      // overrides selectedCartonId when set

  setPalletType: (key: PalletTypeKey) => void
  setPalletMaxHeight: (h: number) => void
  setPalletQuantity: (q: number) => void
  setSelectedCartonId: (id: string | null) => void
  setManualBox: (box: ManualBox | null) => void

  runPalletPacker: () => Promise<void>
}

export const createPalletPackSlice: StateCreator<PalletPackSlice> = (set, get) => ({
  palletPackResult: null,
  palletLoading: false,
  palletError: null,

  palletCartons: DEFAULT_PALLET_CARTONS,

  palletType: DEFAULT_PALLET_KEY,
  palletMaxHeight: getPalletType(DEFAULT_PALLET_KEY).maxHeight,
  palletQuantity: 10,
  selectedCartonId: null,
  manualBox: null,

  setPalletType: (key) => set({ palletType: key }),
  setPalletMaxHeight: (h) => set({ palletMaxHeight: Math.max(1, h) }),
  setPalletQuantity: (q) => set({ palletQuantity: Math.max(1, Math.floor(q)) }),
  // The two carton sources are mutually exclusive, but clearing one (passing
  // null) must NOT wipe the other — only a positive selection displaces its peer.
  setSelectedCartonId: (id) =>
    set((s) => ({ selectedCartonId: id, manualBox: id ? null : s.manualBox })),
  setManualBox: (box) =>
    set((s) => ({ manualBox: box, selectedCartonId: box ? null : s.selectedCartonId })),

  /**
   * Resolve the input carton (manual box, else the selected manifest carton),
   * call the pallet packer, and store the result. Failures land in `palletError`.
   */
  runPalletPacker: async () => {
    const { manualBox, selectedCartonId, palletCartons, palletType, palletMaxHeight, palletQuantity } = get()

    // Resolve the carton spec: an explicit manual box wins; otherwise look up the
    // selected carton in this feature's own catalog (independent of container pallets).
    let box: PalletPackRequest['box'] | null = null
    if (manualBox) {
      box = {
        id: 'manual', label: manualBox.label || 'Manual',
        w: manualBox.w, h: manualBox.h, d: manualBox.d,
        quantity: palletQuantity,
        rotationAllowed: manualBox.rotationAllowed, stacking: manualBox.stacking,
      }
    } else if (selectedCartonId) {
      const c = palletCartons.find((c) => c.id === selectedCartonId)
      if (c) {
        box = {
          id: c.id, label: c.productCode ?? c.label,
          w: c.w, h: c.h, d: c.d,
          quantity: palletQuantity,
          rotationAllowed: c.rotationAllowed, stacking: c.stacking,
        }
      }
    }

    if (!box) {
      set({ palletError: 'Select a carton (or enter dimensions) before packing.' })
      return
    }
    if (box.w <= 0 || box.h <= 0 || box.d <= 0) {
      set({ palletError: 'Carton dimensions must all be greater than zero.' })
      return
    }

    set({ palletLoading: true, palletError: null })

    const preset = getPalletType(palletType)
    const req: PalletPackRequest = {
      box,
      pallet: {
        key: palletType,
        Wp: preset.Wp,
        Dp: preset.Dp,
        max_height: palletMaxHeight,
      },
      quantity: palletQuantity,
    }

    try {
      const result = await apiPalletPack(req)
      set({ palletPackResult: result, palletLoading: false })
    } catch (err) {
      const message = err instanceof PackError ? err.message : 'Pallet packing failed unexpectedly'
      set({ palletError: message, palletLoading: false })
    }
  },
})

/**
 * palletPackSlice.ts — single-SKU pallet packing state + runPalletPacker action.
 *
 * Exports: PalletPackSlice, ManualBox, createPalletPackSlice.
 * A parallel stack to packingSlice (container packing). It switches on
 * uiSlice.packingMode at the UI/Canvas layer. runPalletPacker resolves the input
 * carton (a manual box, or a product selected from the shared product master in
 * palletSlice), calls apiPalletPack, and stores the result.
 */
import type { StateCreator } from 'zustand'
import type { PalletSlice } from './palletSlice'
import { PackError } from '../lib/api'
import { apiPalletPack } from '../lib/palletApi'
import type { PalletPackRequest, PalletPackResult } from '../lib/palletApi'
import type { PalletTypeKey } from '../lib/palletTypes'
import { getPalletType, DEFAULT_PALLET_KEY } from '../lib/palletTypes'

/** A manually-entered carton (used when not selecting a product from the master). */
export interface ManualBox {
  label: string
  w: number
  h: number
  d: number
  rotationAllowed: boolean
  stacking: boolean
}

export interface PalletPackSlice {
  // ── Result / status ──
  palletPackResult: PalletPackResult | null
  palletLoading: boolean
  palletError: string | null

  // ── Inputs ──
  palletType: PalletTypeKey
  palletMaxHeight: number      // cm — load-height cap above the deck
  palletQuantity: number
  selectedCartonId: string | null  // product code chosen from the product master
  manualBox: ManualBox | null      // overrides selectedCartonId when set

  setPalletType: (key: PalletTypeKey) => void
  setPalletMaxHeight: (h: number) => void
  setPalletQuantity: (q: number) => void
  setSelectedCartonId: (id: string | null) => void
  setManualBox: (box: ManualBox | null) => void

  runPalletPacker: () => Promise<void>
}

export const createPalletPackSlice: StateCreator<
  PalletSlice & PalletPackSlice,
  [],
  [],
  PalletPackSlice
> = (set, get) => ({
  palletPackResult: null,
  palletLoading: false,
  palletError: null,

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
    const { manualBox, selectedCartonId, productMaster, palletType, palletMaxHeight, palletQuantity } = get()

    // Resolve the carton spec: an explicit manual box wins; otherwise look up the
    // selected product's dimensions in the shared product master (keyed by code).
    let box: PalletPackRequest['box'] | null = null
    if (manualBox) {
      box = {
        id: 'manual', label: manualBox.label || 'Manual',
        w: manualBox.w, h: manualBox.h, d: manualBox.d,
        quantity: palletQuantity,
        rotationAllowed: manualBox.rotationAllowed, stacking: manualBox.stacking,
      }
    } else if (selectedCartonId) {
      const dims = productMaster?.get(selectedCartonId)
      if (dims) {
        box = {
          id: selectedCartonId, label: selectedCartonId,
          w: dims.w, h: dims.h, d: dims.d,
          quantity: palletQuantity,
          rotationAllowed: dims.rotationAllowed, stacking: dims.stacking,
        }
      }
    }

    if (!box) {
      set({ palletError: 'Select a product (or enter dimensions) before packing.' })
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

/**
 * palletSlice.ts — pallets (logical shipment units) and their cartons.
 *
 * Exports: Pallet, PalletSlice, createPalletSlice.
 * A pallet's position in the `pallets` array is its palletIndex — that index
 * drives the pallet's color, packing group, and animation order everywhere.
 */
import type { StateCreator } from 'zustand'
import type { Carton } from './cartonSlice'

export interface Pallet {
  id: string
  label: string
  cartons: Carton[]
}

export interface PalletSlice {
  pallets: Pallet[]
  // Wholesale replacement — used by Excel import and the test-case panel.
  setPallets: (pallets: Pallet[]) => void
  removePallet: (palletId: string) => void
  // Patch one carton in place; `id` is immutable (it keys placements + colors).
  updatePalletCarton: (palletId: string, cartonId: string, updates: Partial<Omit<Carton, 'id'>>) => void
}

// Seeded for Phase 1 UI development — replaced by Excel import in Phase 2.
const MOCK_PALLETS: Pallet[] = [
  {
    id: 'PLT-001',
    label: 'PLT-001',
    cartons: [
      { id: 'c-001-1', label: 'Carton A', w: 25, h: 25, d: 25, quantity: 150, rotationAllowed: true, stacking: true },
    ],
  },
  {
    id: 'PLT-002',
    label: 'PLT-002',
    cartons: [
      { id: 'c-002-1', label: 'Carton C', w: 50, h: 40, d: 30, quantity: 100, rotationAllowed: true, stacking: true },
    ],
  },
  {
    id: 'PLT-003',
    label: 'PLT-003',
    cartons: [
      { id: 'c-003-1', label: 'Carton C', w: 45, h: 30, d: 25, quantity: 120, rotationAllowed: true, stacking: true },
    ],
  },
]

export const createPalletSlice: StateCreator<PalletSlice> = (set) => ({
  pallets: MOCK_PALLETS,

  setPallets: (pallets) => set({ pallets }),

  removePallet: (palletId) =>
    set((s) => ({ pallets: s.pallets.filter((p) => p.id !== palletId) })),

  updatePalletCarton: (palletId, cartonId, updates) =>
    set((s) => ({
      pallets: s.pallets.map((p) =>
        p.id !== palletId
          ? p
          : {
              ...p,
              cartons: p.cartons.map((c) =>
                c.id === cartonId ? { ...c, ...updates } : c
              ),
            }
      ),
    })),
})

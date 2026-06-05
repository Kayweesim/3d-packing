import type { StateCreator } from 'zustand'
import type { Carton } from './cartonSlice'

export interface Pallet {
  id: string
  label: string
  cartons: Carton[]
}

export interface PalletSlice {
  pallets: Pallet[]
  setPallets: (pallets: Pallet[]) => void
  removePallet: (palletId: string) => void
  updatePalletCarton: (palletId: string, cartonId: string, updates: Partial<Omit<Carton, 'id'>>) => void
}

// Seeded for Phase 1 UI development — replaced by Excel import in Phase 2.
const MOCK_PALLETS: Pallet[] = [
  {
    id: 'PLT-001',
    label: 'PLT-001',
    cartons: [
      { id: 'c-001-1', label: 'Carton A',    w: 60, h: 40, d: 30, quantity: 5,  colorIndex: 0, rotationAllowed: true, stackingOnTop: true, stackingUnder: true },
      { id: 'c-001-2', label: 'Carton B',    w: 80, h: 60, d: 40, quantity: 3,  colorIndex: 1, rotationAllowed: true, stackingOnTop: true, stackingUnder: true },
    ],
  },
  {
    id: 'PLT-002',
    label: 'PLT-002',
    cartons: [
      { id: 'c-002-1', label: 'Carton C',    w: 60, h: 40, d: 30, quantity: 10, colorIndex: 0, rotationAllowed: true, stackingOnTop: true, stackingUnder: true },
    ],
  },
  {
    id: 'PLT-003',
    label: 'PLT-003',
    cartons: [
      { id: 'c-003-1', label: 'Carton C', w: 45, h: 30, d: 25, quantity: 20, colorIndex: 2, rotationAllowed: true, stackingOnTop: true, stackingUnder: true },
      { id: 'c-003-2', label: 'Carton B',    w: 80, h: 60, d: 40, quantity: 2,  colorIndex: 1, rotationAllowed: true, stackingOnTop: true, stackingUnder: true },
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

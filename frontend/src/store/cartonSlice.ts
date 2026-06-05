import type { StateCreator } from 'zustand'

export interface Carton {
  id: string
  label: string
  w: number
  h: number
  d: number
  quantity: number
  colorIndex: number
  rotationAllowed: boolean
  stackingOnTop: boolean
  stackingUnder: boolean
}

export interface CartonSlice {
  cartons: Carton[]
  addCarton: (carton: Omit<Carton, 'id' | 'colorIndex'>) => void
  removeCarton: (id: string) => void
  updateCarton: (id: string, updates: Partial<Omit<Carton, 'id'>>) => void
}

export const CARTON_DEFAULTS = {
  rotationAllowed: true,
  stackingOnTop:   true,
  stackingUnder:   true,
} as const

export const createCartonSlice: StateCreator<CartonSlice> = (set) => ({
  cartons: [],

  addCarton: (carton) =>
    set((s) => ({
      cartons: [
        ...s.cartons,
        { ...carton, id: crypto.randomUUID(), colorIndex: s.cartons.length },
      ],
    })),

  removeCarton: (id) =>
    set((s) => ({ cartons: s.cartons.filter((c) => c.id !== id) })),

  updateCarton: (id, updates) =>
    set((s) => ({
      cartons: s.cartons.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),
})

import type { StateCreator } from 'zustand'

export interface Box {
  id: string
  label: string
  w: number        // cm
  h: number        // cm
  d: number        // cm
  quantity: number
  colorIndex: number  // deterministic palette index, set on creation
}

export interface BoxSlice {
  boxes: Box[]
  addBox: (box: Omit<Box, 'id' | 'colorIndex'>) => void
  removeBox: (id: string) => void
  updateBox: (id: string, updates: Partial<Omit<Box, 'id' | 'colorIndex'>>) => void
}

export const createBoxSlice: StateCreator<BoxSlice> = (set) => ({
  boxes: [],
  addBox: (box) =>
    set((s) => ({
      boxes: [
        ...s.boxes,
        { ...box, id: crypto.randomUUID(), colorIndex: s.boxes.length },
      ],
    })),
  removeBox: (id) => set((s) => ({ boxes: s.boxes.filter((b) => b.id !== id) })),
  updateBox: (id, updates) =>
    set((s) => ({
      boxes: s.boxes.map((b) => (b.id === id ? { ...b, ...updates } : b)),
    })),
})

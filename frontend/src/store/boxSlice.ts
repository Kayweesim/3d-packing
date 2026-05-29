import type { StateCreator } from 'zustand'

export interface Box {
  id: string
  label: string
  w: number        // cm
  h: number        // cm
  d: number        // cm
  quantity: number
  colorIndex: number  // deterministic palette index, set on creation
  rotationAllowed: boolean  // packer may rotate this box to any of 6 orientations
  stackingOnTop:   boolean  // other boxes may be placed on top of this one
  stackingUnder:   boolean  // this box may be placed on top of other boxes
}

export interface BoxSlice {
  boxes: Box[]
  addBox: (box: Omit<Box, 'id' | 'colorIndex'>) => void
  removeBox: (id: string) => void
  updateBox: (id: string, updates: Partial<Omit<Box, 'id' | 'colorIndex'>>) => void
}

export const BOX_DEFAULTS = {
  rotationAllowed: true,
  stackingOnTop:   true,
  stackingUnder:   true,
} as const

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

import type { StateCreator } from 'zustand'

export interface Placement {
  boxId: string
  x: number
  y: number
  z: number
  w: number
  h: number
  d: number
}

export interface PackingResult {
  containerId: string
  placements: Placement[]
  utilization: number  // 0–1
}

export interface PackingSlice {
  // Set by mock packer in Phase 4, real API in Phase 8
  packingResult: PackingResult[] | null
  setPackingResult: (result: PackingResult[] | null) => void
}

export const createPackingSlice: StateCreator<PackingSlice> = (set) => ({
  packingResult: null,
  setPackingResult: (result) => set({ packingResult: result }),
})

import type { StateCreator } from 'zustand'

export interface Placement {
  boxId: string
  x: string
  y: string
  z: string
}

export interface PackingResult {
  containerId:
  placements:
  utilization: number
}

export interface PackingSlice {
  packingResult: PackingResult[] | null
  setPackingResult: {result: PackingResult[] | null} => void
}

export const createUiSlice: StateCreator<UiSlice> = (set) => ({
  setSidebarOpen: (open) => set({sidebarOpen: op})
})
import type { StateCreator } from 'zustand'
import type { ContainerSlice } from './containerSlice'
import type { BoxSlice } from './boxSlice'
import { runMockPacker } from '../lib/mockPacker'

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
  packingResult: PackingResult[] | null
  setPackingResult: (result: PackingResult[] | null) => void
  // Reads containers + boxes from the store, runs the packer, stores the result.
  // Phase 8: swap runMockPacker for an async API call in this one action.
  pack: () => void
}

// The StateCreator is typed against ContainerSlice & BoxSlice & PackingSlice
// so that get() has access to containers and boxes from the other slices.
// At runtime this works because Zustand passes the full combined store to get().
export const createPackingSlice: StateCreator<
  ContainerSlice & BoxSlice & PackingSlice,
  [],
  [],
  PackingSlice
> = (set, get) => ({
  packingResult: null,
  setPackingResult: (result) => set({ packingResult: result }),
  pack: () => {
    const { containers, boxes } = get()
    console.log('[pack] containers:', JSON.stringify(containers))
    console.log('[pack] boxes:', JSON.stringify(boxes))
    // TODO Phase 8: replace this line with: const result = await apiPack(containers, boxes)
    const result = runMockPacker(containers, boxes)
    console.log('[pack] result:', JSON.stringify(result))
    set({ packingResult: result })
  },
})

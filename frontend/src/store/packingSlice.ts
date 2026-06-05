import type { StateCreator } from 'zustand'
import type { ContainerSlice } from './containerSlice'
import type { CartonSlice } from './cartonSlice'
import { apiOptimizeExtremePoints, PackError } from '../lib/api'
import type { OptimizeRequest } from '../lib/api'

export interface Placement {
  cartonId: string
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
  loading: boolean
  error: string | null
  totalCost: number | null
  containerSummary: string | null
  allPacked: boolean

  setPackingResult: (result: PackingResult[] | null) => void
  runPacker: () => Promise<void>
}

export const createPackingSlice: StateCreator<
  ContainerSlice & CartonSlice & PackingSlice,
  [],
  [],
  PackingSlice
> = (set, get) => ({
  packingResult: null,
  loading: false,
  error: null,
  totalCost: null,
  containerSummary: null,
  allPacked: false,

  setPackingResult: (result) => set({ packingResult: result }),

  runPacker: async () => {
    const { cartons, availableTypes, setContainersFromResult } = get()

    set({ loading: true, error: null })

    // TODO Phase 3: replace with pallets.flatMap(p => p.cartons) once pallet wiring is complete
    const input: OptimizeRequest = {
      boxes: cartons.map(({ id, label, w, h, d, quantity, colorIndex }) => ({
        id, label, w, h, d, quantity, colorIndex,
      })),
      available_types: availableTypes,
    }

    try {
      const result = await apiOptimizeExtremePoints(input)

      setContainersFromResult(result.containersUsed)
      set({
        packingResult: result.packingResult,
        totalCost: result.totalCost,
        containerSummary: result.containerSummary,
        allPacked: result.allPacked,
        loading: false,
      })
    } catch (err) {
      const message = err instanceof PackError
        ? err.message
        : 'Packing failed unexpectedly'
      set({ error: message, loading: false })
    }
  },
})

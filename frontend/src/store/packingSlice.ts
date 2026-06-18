/**
 * packingSlice.ts — packing results + the runPacker orchestration action.
 *
 * Exports: PalletBoundary, Placement, PackingResult, PackingSlice,
 * createPackingSlice.
 * runPacker flattens pallets → boxes (stamping colorIndex = palletIndex — the
 * backend's only notion of "pallet"), calls the optimizer, then derives the
 * containers list and the pallet animation boundaries from the response.
 */
import type { StateCreator } from 'zustand'
import type { ContainerSlice } from './containerSlice'
import type { PalletSlice } from './palletSlice'
import type { UiSlice } from './uiSlice'
import { apiOptimize, PackError } from '../lib/api'
import type { OptimizeRequest } from '../lib/api'
import { runMockPacker } from '../lib/mockPacker'
import { getCartonColor } from '../lib/colors'

// true → use lib/mockPacker (offline shelf packer) instead of the backend.
const USE_MOCK_PACKER = false

export interface PalletBoundary {
  palletIndex: number
  label: string
  color: string    // hex — matches the carton color in the 3D scene
  firstGI: number  // first globalIndex belonging to this pallet
  lastGI: number   // last globalIndex belonging to this pallet
}

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
  totalPackedCount: number | null
  palletBoundaries: PalletBoundary[] | null

  setPackingResult: (result: PackingResult[] | null) => void
  runPacker: () => Promise<void>
}

export const createPackingSlice: StateCreator<
  ContainerSlice & PalletSlice & UiSlice & PackingSlice,
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
  totalPackedCount: null,
  palletBoundaries: null,

  setPackingResult: (result) => set({ packingResult: result }),

  /**
   * Flatten pallets → carton instances, call the optimizer, and store the
   * result (containers, placements, pallet boundaries, totals).
   * Failures land in `error` as a user-facing message (PackError).
   */
  runPacker: async () => {
    const { pallets, availableTypes, algo, setContainersFromResult } = get()

    set({ loading: true, error: null })

    // Flatten pallets → carton instances. colorIndex = palletIndex is the
    // backend's pallet grouping key (drives packing order + animation order).
    const input: OptimizeRequest = {
      boxes: pallets.flatMap((pallet, palletIndex) =>
        pallet.cartons.map(({ id, label, w, h, d, quantity, rotationAllowed, stacking }) => ({
          id, label, w, h, d, quantity,
          colorIndex: palletIndex,
          rotationAllowed,
          stacking,
        }))
      ),
      available_types: availableTypes,
      algorithm: algo,
    }

    try {
      const result = USE_MOCK_PACKER
        ? runMockPacker(input)
        : await apiOptimize(input)

      setContainersFromResult(result.containersUsed)

      // Build cartonId → palletIndex lookup
      const cartonToPallet = new Map<string, number>()
      pallets.forEach((p, i) => p.cartons.forEach((c) => cartonToPallet.set(c.id, i)))

      // Walk placements in globalIndex order to derive contiguous pallet boundaries
      const boundaries: PalletBoundary[] = []
      let gi = 0
      let currentPalletIdx = -1
      for (const r of result.packingResult) {
        for (const p of r.placements) {
          const pi = cartonToPallet.get(p.cartonId) ?? 0  // unknown id → pallet 0 (defensive)
          if (pi !== currentPalletIdx) {
            boundaries.push({
              palletIndex: pi,
              label: pallets[pi]?.label ?? `Pallet ${pi + 1}`,
              color: getCartonColor(pi),
              firstGI: gi,
              lastGI: gi,
            })
            currentPalletIdx = pi
          } else {
            boundaries[boundaries.length - 1].lastGI = gi
          }
          gi++
        }
      }

      set({
        packingResult: result.packingResult,
        totalCost: result.totalCost,
        containerSummary: result.containerSummary,
        allPacked: result.allPacked,
        totalPackedCount: gi,
        palletBoundaries: boundaries,
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

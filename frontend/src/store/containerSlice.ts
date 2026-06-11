/**
 * containerSlice.ts — containers chosen by the optimizer + camera-focus state.
 *
 * Exports: ContainerType, Container, ContainerSlice, createContainerSlice.
 * The containers list is owned entirely by the optimizer result — the user
 * never adds or removes containers directly.
 */
import type { StateCreator } from 'zustand'

export type ContainerType = '20ft' | '40ft'

// Dimension values flow in from the backend presets (optimizer.py::_TYPES),
// which are the source of truth for container sizes.
export interface Container {
  id: string
  label: string
  w: number   // cm — cross-section width (X axis)
  h: number   // cm — height (Y axis)
  d: number   // cm — depth/length (Z axis; z=0 = back wall, z=d = door)
}

export interface ContainerSlice {
  // Which container types the user wants included in the optimizer's search.
  availableTypes: ContainerType[]
  // Populated by the optimizer result — not user-configured directly.
  containers: Container[]
  // Index of the camera-focused container; -1 = none selected.
  activeContainerIndex: number
  // Increments on every setActiveContainerIndex call so re-clicking the same
  // container re-triggers the camera zoom (watched by CameraController).
  containerFocusKey: number

  setAvailableTypes: (types: ContainerType[]) => void
  // Called by runPacker after the optimizer resolves which containers to use.
  setContainersFromResult: (containers: Container[]) => void
  setActiveContainerIndex: (index: number) => void
}

export const createContainerSlice: StateCreator<ContainerSlice> = (set) => ({
  availableTypes: ['20ft', '40ft'],
  containers: [],
  activeContainerIndex: -1,
  containerFocusKey: 0,

  setAvailableTypes: (types) => set({ availableTypes: types }),

  // Reset focus so a stale index can't point at a container that no longer exists.
  setContainersFromResult: (containers) =>
    set({ containers, activeContainerIndex: -1 }),

  setActiveContainerIndex: (index) =>
    set((s) => ({ activeContainerIndex: index, containerFocusKey: s.containerFocusKey + 1 })),
})

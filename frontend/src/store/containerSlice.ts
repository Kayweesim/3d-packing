import type { StateCreator } from 'zustand'

export type ContainerType = '20ft' | '40ft'

export interface Container {
  id: string
  label: string
  w: number        // cm — cross-section width (X axis, 235cm for TEU/FEU)
  h: number        // cm — height (Y axis, 239cm for TEU/FEU)
  d: number        // cm — length/depth (Z axis, 589cm for 20ft, 1203cm for 40ft)
}

export interface ContainerSlice {
  // Which container types the user wants included in the optimizer's search.
  availableTypes: ContainerType[]
  // Populated by the optimizer result — not user-configured directly.
  containers: Container[]
  activeContainerIndex: number
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

  setContainersFromResult: (containers) =>
    set({ containers, activeContainerIndex: -1 }),

  setActiveContainerIndex: (index) =>
    set((s) => ({ activeContainerIndex: index, containerFocusKey: s.containerFocusKey + 1 })),
})

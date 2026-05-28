import type { StateCreator } from 'zustand'

export interface Container {
  id: string
  label: string
  w: number        // cm — maps to L (length) in TEU/FEU spec
  h: number        // cm — height
  d: number        // cm — maps to W (width/depth) in TEU/FEU spec
}

export interface ContainerSlice {
  containers: Container[]
  activeContainerIndex: number
  addContainer: (container: Omit<Container, 'id'>) => void
  removeContainer: (id: string) => void
  updateContainer: (id: string, updates: Partial<Omit<Container, 'id'>>) => void
  setActiveContainerIndex: (index: number) => void
}

export const createContainerSlice: StateCreator<ContainerSlice> = (set) => ({
  containers: [],
  activeContainerIndex: 0,
  addContainer: (container) =>
    set((s) => ({
      containers: [...s.containers, { ...container, id: crypto.randomUUID() }],
    })),
  removeContainer: (id) =>
    set((s) => {
      const containers = s.containers.filter((c) => c.id !== id)
      return {
        containers,
        activeContainerIndex: Math.min(s.activeContainerIndex, Math.max(0, containers.length - 1)),
      }
    }),
  updateContainer: (id, updates) =>
    set((s) => ({
      containers: s.containers.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),
  setActiveContainerIndex: (index) => set({ activeContainerIndex: index }),
})

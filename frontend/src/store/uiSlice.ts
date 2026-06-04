import type { StateCreator } from 'zustand'

export interface UiSlice {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  darkMode: boolean
  toggleDarkMode: () => void
  playing: boolean
  speed: 0.5 | 1 | 2
  progress: number  // 0–1, drives GSAP timeline scrub
  setPlaying: (playing: boolean) => void
  setSpeed: (speed: 0.5 | 1 | 2) => void
  setProgress: (progress: number) => void
}

export const createUiSlice: StateCreator<UiSlice> = (set) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  darkMode: true,
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
  playing: false,
  speed: 1,
  progress: 0,
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setProgress: (progress) => set({ progress }),
})

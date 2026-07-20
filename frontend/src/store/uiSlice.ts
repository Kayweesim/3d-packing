/**
 * uiSlice.ts — presentation state: sidebar, theme, and playback.
 *
 * Exports: UiSlice, createUiSlice.
 * `progress` mirrors the GSAP timeline (lib/animationState) into React so the
 * scrub bar and ActivePalletPanel re-render as the animation advances.
 */
import type { StateCreator } from 'zustand'

/** Packing algorithm key — must match a key in the backend registry (packing_algos/registry.py). */
export type AlgoId = 'algo1'

export interface UiSlice {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  darkMode: boolean
  toggleDarkMode: () => void
  playing: boolean
  speed: 0.5 | 1 | 2
  progress: number       // 0–1, drives GSAP timeline scrub
  algo: AlgoId           // selected packing algorithm, sent to the optimizer by runPacker
  dimensionBuffer: number  // 0–15 (%), added to each box dim before packing
  lashing: boolean         // true → load is lashed/secured, skip flat last-container re-pack (stack tall)
  visualizerOpen: boolean  // algorithm step-visualizer overlay open?
  setPlaying: (playing: boolean) => void
  setSpeed: (speed: 0.5 | 1 | 2) => void
  setProgress: (progress: number) => void
  setAlgo: (algo: AlgoId) => void
  setDimensionBuffer: (buffer: number) => void
  setLashing: (lashing: boolean) => void
  setVisualizerOpen: (open: boolean) => void
}

/** Matches Tailwind's `md` breakpoint — sidebar starts open only on tablet/desktop. */
const DESKTOP_MEDIA_QUERY = '(min-width: 768px)'

export const createUiSlice: StateCreator<UiSlice> = (set) => ({
  sidebarOpen: typeof window !== 'undefined' ? window.matchMedia(DESKTOP_MEDIA_QUERY).matches : true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  darkMode: true,
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
  playing: false,
  speed: 1,
  progress: 0,
  algo: 'algo1',
  dimensionBuffer: 0,
  lashing: false,
  visualizerOpen: false,
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setProgress: (progress) => set({ progress }),
  setAlgo: (algo) => set({ algo }),
  setDimensionBuffer: (buffer) => set({ dimensionBuffer: Math.max(0, Math.min(15, buffer)) }),
  setLashing: (lashing) => set({ lashing }),
  setVisualizerOpen: (open) => set({ visualizerOpen: open }),
})

/**
 * store/index.ts — composes every Zustand slice into the single app store.
 *
 * Exports:
 *  - useStore: the app-wide store hook (single source of truth — components
 *    never duplicate store state locally)
 *  - StoreState: the combined slice type
 *  - Re-exported domain types (Carton, Container, ContainerType, Placement,
 *    PackingResult, PalletBoundary, Pallet) so consumers can import them from
 *    '@/src/store' without knowing which slice owns them.
 */
import { create } from 'zustand'
import { createContainerSlice } from './containerSlice'
import { createCartonSlice } from './cartonSlice'
import { createPackingSlice } from './packingSlice'
import { createUiSlice } from './uiSlice'
import { createPalletSlice } from './palletSlice'
import { createPalletPackSlice } from './palletPackSlice'

export type { Carton } from './cartonSlice'
export type { Container, ContainerType } from './containerSlice'
export type { Placement, PackingResult, PalletBoundary } from './packingSlice'
export type { Pallet } from './palletSlice'

// Inline import() types are type-only — they add no runtime imports.
export type StoreState =
  import('./containerSlice').ContainerSlice &
  import('./cartonSlice').CartonSlice &
  import('./packingSlice').PackingSlice &
  import('./uiSlice').UiSlice &
  import('./palletSlice').PalletSlice &
  import('./palletPackSlice').PalletPackSlice

// Every slice creator receives the same (set, get, api) tuple, so any slice
// can read sibling state through get() — e.g. packingSlice reads pallets.
export const useStore = create<StoreState>((...args) => ({
  ...createContainerSlice(...args),
  ...createCartonSlice(...args),
  ...createPackingSlice(...args),
  ...createUiSlice(...args),
  ...createPalletSlice(...args),
  ...createPalletPackSlice(...args),
}))

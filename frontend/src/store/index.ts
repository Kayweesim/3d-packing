import { create } from 'zustand'
import { createContainerSlice } from './containerSlice'
import { createCartonSlice } from './cartonSlice'
import { createPackingSlice } from './packingSlice'
import { createUiSlice } from './uiSlice'
import { createPalletSlice } from './palletSlice'

export type { Carton } from './cartonSlice'
export type { Container, ContainerType } from './containerSlice'
export type { Placement, PackingResult } from './packingSlice'
export type { Pallet } from './palletSlice'

export type StoreState =
  import('./containerSlice').ContainerSlice &
  import('./cartonSlice').CartonSlice &
  import('./packingSlice').PackingSlice &
  import('./uiSlice').UiSlice &
  import('./palletSlice').PalletSlice

export const useStore = create<StoreState>((...args) => ({
  ...createContainerSlice(...args),
  ...createCartonSlice(...args),
  ...createPackingSlice(...args),
  ...createUiSlice(...args),
  ...createPalletSlice(...args),
}))

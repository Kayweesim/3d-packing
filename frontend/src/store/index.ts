import { create } from 'zustand'
import { createContainerSlice } from './containerSlice'
import { createBoxSlice } from './boxSlice'
import { createPackingSlice } from './packingSlice'
import { createUiSlice } from './uiSlice'

export type { Box } from './boxSlice'
export type { Container } from './containerSlice'
export type { Placement, PackingResult } from './packingSlice'

export type StoreState =
  import('./containerSlice').ContainerSlice &
  import('./boxSlice').BoxSlice &
  import('./packingSlice').PackingSlice &
  import('./uiSlice').UiSlice

export const useStore = create<StoreState>((...args) => ({
  ...createContainerSlice(...args),
  ...createBoxSlice(...args),
  ...createPackingSlice(...args),
  ...createUiSlice(...args),
}))

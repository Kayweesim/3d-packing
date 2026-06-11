import type { StateCreator } from 'zustand'

export interface Carton {
  id: string
  label: string
  w: number
  h: number
  d: number
  quantity: number
  rotationAllowed: boolean
  stacking: boolean
}

// Cartons are now owned by pallets (palletSlice). This slice exists only as
// the canonical type definition and for store composition.
export interface CartonSlice {}

export const CARTON_DEFAULTS = {
  rotationAllowed: true,
  stacking: true,
} as const

export const createCartonSlice: StateCreator<CartonSlice> = () => ({})

/**
 * cartonSlice.ts — canonical Carton type shared across the app.
 *
 * Exports: Carton, CartonSlice, createCartonSlice.
 * Cartons are owned by pallets (palletSlice); this slice holds no state and
 * exists only as the type's home and for store composition.
 */
import type { StateCreator } from 'zustand'

export interface Carton {
  id: string
  label: string
  productCode?: string // clean product code for display; `id` stays globally unique (lookup key)
  w: number   // cm — X axis
  h: number   // cm — Y axis
  d: number   // cm — Z axis
  quantity: number
  rotationAllowed: boolean // false → packer must keep the original (w, h, d)
  stacking: boolean         // false → nothing may be placed on top of this carton
}

// Type-only slice — no state.
export interface CartonSlice {}

export const createCartonSlice: StateCreator<CartonSlice> = () => ({})

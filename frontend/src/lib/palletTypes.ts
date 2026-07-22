/**
 * palletTypes.ts — pallet presets mirror (frontend copy of backend presets.py).
 *
 * Exports: PalletTypeKey, PalletTypeDef, PALLET_TYPES, DEFAULT_PALLET_KEY.
 * The backend (pallet_packing/presets.py) is the source of truth for the actual
 * pack; these values drive the UI selector and default inputs. Keep in sync.
 * Dimensions in cm; axis convention X=Wp, Z=Dp, Y=height.
 */

export type PalletTypeKey = 'EUR1' | 'EUR2' | 'CUSTOM'

export interface PalletTypeDef {
  key: PalletTypeKey
  label: string
  Wp: number         // footprint width  — X axis (cm)
  Dp: number         // footprint depth  — Z axis (cm)
  deckH: number      // deck thickness (cm)
  maxHeight: number  // default max goods height above the deck (cm)
}

export const PALLET_TYPES: PalletTypeDef[] = [
  { key: 'EUR1',   label: 'EUR1 (EPAL)', Wp: 120, Dp: 80,  deckH: 14.4, maxHeight: 180 },
  { key: 'EUR2',   label: 'EUR2',        Wp: 120, Dp: 100, deckH: 14.4, maxHeight: 180 },
  { key: 'CUSTOM', label: 'Custom',      Wp: 120, Dp: 100, deckH: 14.4, maxHeight: 180 },
]

export const DEFAULT_PALLET_KEY: PalletTypeKey = 'EUR1'

/** Look up a preset by key (falls back to the default). */
export function getPalletType(key: PalletTypeKey): PalletTypeDef {
  return PALLET_TYPES.find((p) => p.key === key) ?? PALLET_TYPES[0]
}

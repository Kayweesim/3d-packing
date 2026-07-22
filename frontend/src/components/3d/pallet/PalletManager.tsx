/**
 * PalletManager.tsx — lays pallets_needed pallets side-by-side along world X.
 *
 * Exports: PALLET_GAP_CM, buildPalletWorldMap, PalletManager.
 * buildPalletWorldMap is the layout authority shared with PalletInstancedCartons
 * and the pallet camera controller (mirrors ContainerManager's role).
 */
import { useStore } from '@/src/store'
import { PalletMesh } from './PalletMesh'

// Gap between adjacent pallets (cm).
export const PALLET_GAP_CM = 60

/**
 * World-X left edge of each pallet, packed left-to-right PALLET_GAP_CM apart.
 * @param count Number of pallets (palletsNeeded).
 * @param Wp Pallet footprint width (X axis, cm).
 * @returns Array of length `count`; entry i is pallet i's left edge.
 */
export function buildPalletWorldMap(count: number, Wp: number): number[] {
  const xs: number[] = []
  let x = 0
  for (let i = 0; i < count; i++) {
    xs.push(x)
    x += Wp + PALLET_GAP_CM
  }
  return xs
}

/** Renders one PalletMesh per pallet the packer said we need. */
export function PalletManager() {
  const result = useStore((s) => s.palletPackResult)

  if (!result || result.palletsNeeded <= 0) return null

  const { Wp, Dp, deckH, maxHeight } = result.pallet
  const worldXs = buildPalletWorldMap(result.palletsNeeded, Wp)

  return (
    <>
      {worldXs.map((worldX, i) => (
        <PalletMesh
          key={i}
          worldX={worldX}
          Wp={Wp}
          Dp={Dp}
          deckH={deckH}
          maxHeight={maxHeight}
        />
      ))}
    </>
  )
}

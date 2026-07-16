/**
 * colors.ts — deterministic pallet color palette.
 *
 * Exports: CARTON_COLORS (16 hex colors), getCartonColor.
 * Colors are index-based (palletIndex % 16), never random, so the sidebar
 * swatches, 3D cartons, checkpoint markers and Excel export always agree.
 */
export const CARTON_COLORS: string[] = [
  '#e74c3c', // red
  '#3498db', // blue
  '#2ecc71', // green
  '#f39c12', // orange
  '#9b59b6', // purple
  '#1abc9c', // teal
  '#e91e63', // pink
  '#00bcd4', // cyan
  '#ff5722', // deep orange
  '#8bc34a', // light green
  '#673ab7', // deep purple
  '#03a9f4', // light blue
  '#ffeb3b', // yellow
  '#ff4081', // pink accent
  '#26c6da', // cyan light
  '#ef5350', // red light
]

/**
 * Deterministic color for a pallet.
 * @param colorIndex The pallet's position in the pallets array (palletIndex).
 * @returns Hex color string; indexes wrap modulo the palette length.
 */
export function getCartonColor(colorIndex: number): string {
  return CARTON_COLORS[colorIndex % CARTON_COLORS.length]
}

/** 
 * Assign each unique product name a palette color in first-seen order, so
 * cartons sharing a product name get the same color regardless of pallet.
 * First-seen indexing (rather than hashing) avoids color collisions until
 * there are more than 16 distinct products.
 * @param pallets Pallets in store order; product name = productCode ?? label.
 * @returns Map productName → hex color.
 */
export function buildProductColorMap(
  pallets: { cartons: { productCode?: string; label: string }[] }[],
): Map<string, string> {
  const map = new Map<string, string>()
  for (const pallet of pallets) {
    for (const c of pallet.cartons) {
      const name = c.productCode ?? c.label
      if (!map.has(name)) map.set(name, getCartonColor(map.size))
    }
  }
  return map
}

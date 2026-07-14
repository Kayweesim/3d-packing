/**
 * testCases.ts — preloaded packing-logic scenarios for TestCasePanel.
 *
 * Exports: TestCase, TEST_CASES.
 * Each case runs through the normal pipeline (setPallets → runPacker), so
 * sequence numbering, ActivePalletPanel and the Excel export behave exactly
 * as they do with imported data. Packing a case replaces the current pallets.
 */
import type { Pallet } from '../store/palletSlice'
import type { Carton } from '../store/cartonSlice'

export interface TestCase {
  id: string
  name: string
  description: string
  pallets: Pallet[]
}

interface CartonOpts {
  rotationAllowed?: boolean
  stacking?: boolean
}

/** Carton literal with rotation/stacking defaulting to true (dims in cm). */
function carton(
  id: string,
  label: string,
  w: number,
  h: number,
  d: number,
  quantity: number,
  opts: CartonOpts = {},
): Carton {
  return {
    id, label, w, h, d, quantity,
    rotationAllowed: opts.rotationAllowed ?? true,
    stacking: opts.stacking ?? true,
  }
}

/** Pallet literal whose label doubles as its id. */
function pallet(id: string, cartons: Carton[]): Pallet {
  return { id, label: id, cartons }
}

// Container reference: 20ft interior = 589 d × 235 w × 239 h (cm).
export const TEST_CASES: TestCase[] = [
  {
    id: 'tc-1',
    name: '1 · Simple Test Case',
    description:
      'Click me to try!',
    pallets: [
      pallet('TALL-A', [carton('tc1-a', 'Tall A', 35.6, 22.2, 51.2, 215)]),
    ],
  },
]

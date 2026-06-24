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
    name: '1 · Baseline grid',
    description:
      'Uniform cubes, one pallet. Expect clean depth-first z-slice fill with full support — no gaps, no floaters.',
    pallets: [
      pallet('TEST-GRID', [carton('tc1-a', 'Cube 50', 50, 50, 50, 36)]),
    ],
  },
  {
    id: 'tc-2',
    name: '2 · Cross-pallet gap fill',
    description:
      'Pallet A: wide boxes leaving a 55 cm floor strip along one wall. Pallet B: slim cubes that must fill that side strip (back at z=0, beside A) instead of starting after A\'s z-frontier. A still animates fully before B.',
    pallets: [
      pallet('TEST-GAP-A', [carton('tc2-a', 'Wide box', 180, 100, 100, 3)]),
      pallet('TEST-GAP-B', [carton('tc2-b', 'Slim cube', 50, 50, 50, 12)]),
    ],
  },
  {
    id: 'tc-3',
    name: '3 · Stacking OFF',
    description:
      'Non-stackable cubes. Expect a single floor layer spreading down the z-axis — nothing ever placed on top.',
    pallets: [
      pallet('TEST-NOSTACK', [
        carton('tc3-a', 'Cube 70 (no stack)', 70, 70, 70, 10, { stacking: false }),
      ]),
    ],
  },
  {
    id: 'tc-4',
    name: '4 · Stacking A/B',
    description:
      'Identical cubes, pallet A stackable, pallet B not. Direct visual contrast: A builds columns, B stays flat on the floor.',
    pallets: [
      pallet('TEST-STACK-ON', [carton('tc4-a', 'Cube 60 (stack)', 60, 60, 60, 8)]),
      pallet('TEST-STACK-OFF', [
        carton('tc4-b', 'Cube 60 (no stack)', 60, 60, 60, 8, { stacking: false }),
      ]),
    ],
  },
  {
    id: 'tc-5',
    name: '5 · Stack on previous pallet',
    description:
      'Pallet A: low boxes leaving headroom. Pallet B: small cubes that should use the kept Above spaces on top of A. Also reproduces the known too-deep-to-reach issue.',
    pallets: [
      pallet('TEST-BASE', [carton('tc5-a', 'Low box', 80, 60, 80, 9)]),
      pallet('TEST-TOPPER', [carton('tc5-b', 'Small cube', 40, 40, 40, 12)]),
    ],
  },
  {
    id: 'tc-6',
    name: '6 · Rotation required',
    description:
      'Pallet A: Small boxes to take up majority of space to force Pallet B\'s cartons to rotate.',
    pallets: [
      pallet('TEST-ROT-ON-SMALL', [carton('tc6-a', 'Small box', 50, 50 ,50, 164)]),
      pallet('TEST-ROT-ON', [carton('tc6-b', 'Long box', 180, 50, 50, 3)]),
    ],
  },
  {
    id: 'tc-7',
    name: '7 · Extreme Unreachability Test Case',
    description:
      'Large amount of crates in previous pallet, leaving only a narrow gap at the top on which to fit the next pallet\'s cartons. ',
    pallets: [
      pallet('TEST-PACK-ALT-1', [
        carton('tc7-a', 'Long box (fixed)', 25, 25, 25, 150),
      ]),
      pallet('TEST-PACK-ALT-2', [
        carton('tc7-b', 'Long box (fixed)', 50, 40, 30, 316),
      ]),
      pallet('TEST-PACK-ALT-3', [
        carton('tc7-c', 'Long box (fixed)', 45, 30, 25, 120),
      ]),
    ],
  },
  {
    id: 'tc-8',
    name: '8 · Overflow → 2nd container',
    description:
      'Oversized fixed-orientation crates that cannot share a row. One container fills up and the rest overflow — Seq # must continue across containers.',
    pallets: [
      pallet('TEST-OVERFLOW', [
        carton('tc8-a', 'Big crate', 230, 110, 230, 12, { rotationAllowed: false }),
      ]),
    ],
  },
  {
    id: 'tc-9',
    name: '9 · Realistic manifest',
    description:
      'Three SKUs (large appliances + medium + small cartons) on one pallet, ~⅔ of a 20ft by volume. Packs cleanly into a single 20ft with everything placed — a sanity check that a normal mixed manifest fills one container.',
    pallets: [
      pallet('TEST-MANIFEST', [
        carton('tc9-a', 'Appliance', 90, 80, 70, 18),
        carton('tc9-b', 'Carton M', 55, 45, 50, 70),
        carton('tc9-c', 'Carton S', 35, 30, 40, 110),
      ]),
    ],
  },
  {
    id: 'tc-10',
    name: '10 · Horizontal Test-Case',
    description:
      'Last Horizontal Container, First container follows normal in-depth ordering, second (last) pallet follows horizontal pallet ordering .',
    pallets: [
      pallet('TEST-DENSE-1', [
        carton('tc10-a1', 'Crate L', 50, 50, 50, 388),
        carton('tc10-a2', 'Crate L', 130, 120, 100, 9),
      ]),
      pallet('TEST-DENSE-2', [
        carton('tc10-b2', 'Crate T', 50, 230, 90, 12, { rotationAllowed: false}),
        carton('tc10-b2', 'Crate M', 110, 70, 90, 12),
        carton('tc10-c2', 'Cube 50', 50, 50, 50, 55),
      ]),
    ],
  },
]

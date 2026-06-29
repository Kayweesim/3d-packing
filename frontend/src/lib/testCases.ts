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
    name: '1 · Height-band reorder',
    description:
      'Five single-SKU pallets, same 50×50 footprint, heights interleaved in pick order (tall, flat, tall, flat, tall). Guillotine keeps pick order and leaves jagged tops; algo2 reorders so equal-height pallets load consecutively, forming flat coplanar shelves. Select algo2 to see the regroup.',
    pallets: [
      pallet('TALL-A', [carton('tc1-a', 'Tall A', 50, 75, 50, 24)]),
      pallet('FLAT-A', [carton('tc1-b', 'Flat A', 50, 35, 50, 24)]),
      pallet('TALL-B', [carton('tc1-c', 'Tall B', 50, 70, 50, 24)]),
      pallet('FLAT-B', [carton('tc1-d', 'Flat B', 50, 40, 50, 24)]),
      pallet('TALL-C', [carton('tc1-e', 'Tall C', 50, 72, 50, 24)]),
    ],
  },
  {
    id: 'tc-2',
    name: '2 · Footprint tiling (one height band)',
    description:
      'Five single-SKU pallets that all share height 50 (one height band) but differ in footprint. algo2 keeps them in the band and orders by footprint so the cross-section tiles tightly with all tops coplanar.',
    pallets: [
      pallet('FP-A', [carton('tc2-a', 'Foot 40×40', 40, 50, 40, 24)]),
      pallet('FP-B', [carton('tc2-b', 'Foot 60×60', 60, 50, 60, 24)]),
      pallet('FP-C', [carton('tc2-c', 'Foot 50×80', 50, 50, 80, 24)]),
      pallet('FP-D', [carton('tc2-d', 'Foot 80×50', 80, 50, 50, 24)]),
      pallet('FP-E', [carton('tc2-e', 'Foot 50×50', 50, 50, 50, 24)]),
    ],
  },
  {
    id: 'tc-3',
    name: '3 · Mixed realistic manifest',
    description:
      'Five single-SKU pallets of genuinely different sizes (small, medium, large, tall-narrow, wide-flat), 20–30 cartons each. General density check that algo2 reorders for tighter packing without ever breaking full support.',
    pallets: [
      pallet('SKU-SML', [carton('tc3-a', 'Small', 35, 30, 40, 30)]),
      pallet('SKU-MED', [carton('tc3-b', 'Medium', 55, 45, 50, 25)]),
      pallet('SKU-LRG', [carton('tc3-c', 'Large', 70, 60, 80, 20)]),
      pallet('SKU-TLN', [carton('tc3-d', 'Tall-narrow', 40, 90, 40, 24)]),
      pallet('SKU-WFL', [carton('tc3-e', 'Wide-flat', 90, 35, 70, 22)]),
    ],
  },
  {
    id: 'tc-4',
    name: '4 · Cross-pallet stacking',
    description:
      'Low single-SKU pallets leave headroom; small-cube pallets should ride on the kept Above shelves above them. algo2 orders pallets so compatible footprints meet, maximizing cross-pallet stacking instead of opening fresh z-bands.',
    pallets: [
      pallet('LOW-WIDE', [carton('tc4-a', 'Low wide', 80, 45, 80, 20)]),
      pallet('CUBE-S', [carton('tc4-b', 'Cube S', 40, 40, 40, 30)]),
      pallet('LOW-MED', [carton('tc4-c', 'Low med', 60, 50, 60, 24)]),
      pallet('CUBE-XS', [carton('tc4-d', 'Cube XS', 35, 35, 35, 30)]),
      pallet('LOW-NARROW', [carton('tc4-e', 'Low narrow', 50, 55, 90, 20)]),
    ],
  },
  {
    id: 'tc-5',
    name: '5 · Heterogeneous overflow',
    description:
      'Five large single-SKU pallets that exceed one 20ft, so the load spills into a second container. Tests that algo2 keeps its chosen pallet order — and the global Seq # — continuous across the container boundary.',
    pallets: [
      pallet('BLK-A', [carton('tc5-a', 'Block A', 65, 70, 65, 28)]),
      pallet('BLK-B', [carton('tc5-b', 'Block B', 45, 40, 45, 30)]),
      pallet('BLK-C', [carton('tc5-c', 'Block C', 75, 85, 75, 24)]),
      pallet('BLK-D', [carton('tc5-d', 'Block D', 55, 50, 90, 26)]),
      pallet('BLK-E', [carton('tc5-e', 'Block E', 60, 60, 60, 30)]),
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
      pallet('TEST-MANIFEST1', [
        carton('tc9-a', 'Appliance', 90, 80, 70, 18),
      ]),
      pallet('TEST-MANIFEST2', [
        carton('tc9-b3', 'Carton M', 55, 45, 50, 20),
          ]),
        pallet('TEST-MANIFEST3', [
          carton('tc9-b1', 'Carton M', 55, 45, 50, 20),
          ]),
        pallet('TEST-MANIFEST4', [
            carton('tc9-b2', 'Carton M', 55, 45, 50, 20),
        ]),
        pallet('TEST-MANIFEST5', [
          carton('tc9-b4', 'Carton M', 55, 45, 50, 10),
        ]),
        pallet('TEST-MANIFEST6', [
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
  {
    id: 'tc-11',
    name: '11 · Unstackable-last (algo2 reorder)',
    description:
      'FRAGILE-FIRST is listed first in input order and has stacking=false (h=90 cm). ' +
      'Guillotine honours input order and packs it at the back, stranding ~149 cm of dead vertical ' +
      'space above it that STACK-A and STACK-B cannot use. ' +
      'algo2 detects the non-stackable pallet and pushes it to load last (near the door), ' +
      'freeing the back section for STACK-A and STACK-B to stack two layers high. ' +
      'Switch between Guillotine and algo2 to compare where FRAGILE-FIRST lands.',
    pallets: [
      pallet('FRAGILE-FIRST', [
        carton('tc11-a', 'Fragile item (no-stack)', 110, 90, 100, 10, { stacking: false }),
      ]),
      pallet('STACK-A', [
        carton('tc11-b', 'Stackable box A', 75, 80, 80, 25),
      ]),
      pallet('STACK-B', [
        carton('tc11-c', 'Stackable box B', 70, 75, 80, 20),
      ]),
    ],
  },
]

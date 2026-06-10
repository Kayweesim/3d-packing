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

function carton(
  id: string,
  label: string,
  w: number,
  h: number,
  d: number,
  quantity: number,
  colorIndex: number,
  opts: CartonOpts = {},
): Carton {
  return {
    id, label, w, h, d, quantity, colorIndex,
    rotationAllowed: opts.rotationAllowed ?? true,
    stacking: opts.stacking ?? true,
  }
}

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
      pallet('TEST-GRID', [carton('tc1-a', 'Cube 50', 50, 50, 50, 36, 0)]),
    ],
  },
  {
    id: 'tc-2',
    name: '2 · Pallet frontier',
    description:
      'Two pallets, different cube sizes. Pallet B must start after pallet A\'s z-frontier — no floor-level mixing — and animate strictly after A.',
    pallets: [
      pallet('TEST-FRONT-A', [carton('tc2-a', 'Cube 60', 60, 60, 60, 12, 0)]),
      pallet('TEST-FRONT-B', [carton('tc2-b', 'Cube 45', 45, 45, 45, 12, 1)]),
    ],
  },
  {
    id: 'tc-3',
    name: '3 · Stacking OFF',
    description:
      'Non-stackable cubes. Expect a single floor layer spreading down the z-axis — nothing ever placed on top.',
    pallets: [
      pallet('TEST-NOSTACK', [
        carton('tc3-a', 'Cube 70 (no stack)', 70, 70, 70, 10, 0, { stacking: false }),
      ]),
    ],
  },
  {
    id: 'tc-4',
    name: '4 · Stacking A/B',
    description:
      'Identical cubes, pallet A stackable, pallet B not. Direct visual contrast: A builds columns, B stays flat on the floor.',
    pallets: [
      pallet('TEST-STACK-ON', [carton('tc4-a', 'Cube 60 (stack)', 60, 60, 60, 8, 0)]),
      pallet('TEST-STACK-OFF', [
        carton('tc4-b', 'Cube 60 (no stack)', 60, 60, 60, 8, 1, { stacking: false }),
      ]),
    ],
  },
  {
    id: 'tc-5',
    name: '5 · Stack on previous pallet',
    description:
      'Pallet A: low boxes leaving headroom. Pallet B: small cubes that should use the kept Above spaces on top of A. Also reproduces the known too-deep-to-reach issue.',
    pallets: [
      pallet('TEST-BASE', [carton('tc5-a', 'Low box', 80, 60, 80, 9, 0)]),
      pallet('TEST-TOPPER', [carton('tc5-b', 'Small cube', 40, 40, 40, 12, 1)]),
    ],
  },
  {
    id: 'tc-6',
    name: '6 · Rotation required',
    description:
      'Long cartons (280 cm) exceed both width (235) and height (239) — the packer must orient the long axis along z. Top-face rotation indicator should appear.',
    pallets: [
      pallet('TEST-ROT-ON', [carton('tc6-a', 'Long box', 280, 60, 60, 4, 0)]),
    ],
  },
  {
    id: 'tc-7',
    name: '7 · Rotation OFF',
    description:
      'Same long carton but already oriented along z, rotation disabled. Must pack as-is with no rotation indicator on any box.',
    pallets: [
      pallet('TEST-ROT-OFF', [
        carton('tc7-a', 'Long box (fixed)', 60, 60, 280, 4, 0, { rotationAllowed: false }),
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
        carton('tc8-a', 'Big crate', 230, 110, 230, 12, 0, { rotationAllowed: false }),
      ]),
    ],
  },
]

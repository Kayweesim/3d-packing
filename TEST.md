Generate test data constants in `src/lib/testCases.ts`. 
These are simple UI-testable scenarios, not unit tests. 
Each exports a { boxes, label, description } object 
that can be loaded into the app via a "Load Test Case" 
dropdown in the sidebar during development.

Do not modify any existing files. Just create the file.

## Test Cases to Generate

### T01 — Single Box Perfect Fit
One box that exactly matches a 20ft TEU.
boxes: [{ w:589, h:239, d:235, quantity:1 }]
Expected: 1 box placed, ~100% utilization, one 20ft container

### T02 — Simple Floor Fill
Four identical boxes filling the floor of a 20ft TEU in a 2×2 grid.
boxes: [{ w:294, h:239, d:117, quantity:4 }]
Expected: 4 placed, ~100% utilization, one 20ft container

### T03 — Simple Stack
Two identical boxes stacked on top of each other.
boxes: [{ w:589, h:119, d:235, quantity:2 }]
Expected: 2 placed stacked, ~100% utilization, one 20ft container

### T04 — Overflow Into Second Container
Boxes that fill one 20ft TEU exactly, plus a few extra.
boxes: [{ w:100, h:100, d:100, quantity:15 }]
Expected: first container full, remainder in second container

### T05 — Mixed Sizes Two Types
Two box types — large and small.
boxes: [
  { w:200, h:200, d:200, quantity:3 },
  { w:50,  h:50,  d:50,  quantity:20 }
]
Expected: large boxes placed first, smalls fill gaps

### T06 — Mixed Sizes Three Types
Three box types — large, medium, small.
boxes: [
  { w:200, h:150, d:150, quantity:5 },
  { w:100, h:100, d:100, quantity:10 },
  { w:40,  h:40,  d:40,  quantity:30 }
]
Expected: LFD order — large → medium → small

### T07 — Tall Boxes
Boxes that are taller than they are wide — tests vertical stacking logic.
boxes: [{ w:50, h:200, d:50, quantity:10 }]
Expected: boxes placed upright, no floating

### T08 — Flat Boxes
Very flat boxes — tests floor layering.
boxes: [{ w:200, h:20, d:200, quantity:8 }]
Expected: boxes stack in flat layers

### T09 — One Giant Box Needs 40ft
A single box too large for a 20ft TEU but fits in a 40ft FEU.
boxes: [{ w:800, h:200, d:200, quantity:1 }]
Expected: allocator skips 20ft, assigns 40ft

### T10 — Stress Test (not hundreds, just enough to be visual)
Many small identical boxes filling most of a 40ft FEU.
boxes: [{ w:60, h:60, d:60, quantity:80 }]
Expected: dense packing, high utilization, visually interesting

## Format Each Test Case As
export const T01: TestCase = {
  label: "T01 — Single Box Perfect Fit",
  description: "One box sized exactly to a 20ft TEU interior",
  boxes: [{ ... }]
}

export const ALL_TEST_CASES: TestCase[] = [T01, T02, ...]

## Type to define
export interface TestCase {
  label: string
  description: string
  boxes: Omit<Box, 'id' | 'colorIndex' | 'label'>[]
}

No other files to create or modify.
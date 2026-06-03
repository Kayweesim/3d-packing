Read CLAUDE.md fully. Phases 1–7 are complete. Begin Phase 8.

## Goal
Built thetwo world-class 3D bin packing algorithms 
in Python, typescript api client has been wired for you and called using apiPack.


### Algorithm 1 — Guillotine (Speed-Priority)
File: `backend/algorithms/guillotine.py`

Implement a 3D Guillotine Cut algorithm:
- On each placement, split remaining free space into up to 3 sub-spaces 
  (guillotine cuts along X, Y, Z planes)
- Use Largest Face Down (LFD) heuristic to sort boxes before placement
- Aim for sub-100ms on a TEU filled with 500 small boxes
- Dense comments explaining every step: what a guillotine cut is, why LFD 
  helps, how free space tracking works, what breaks if you change the cut order

### Algorithm 2 — Extreme Points (Balanced)
File: `backend/algorithms/extreme_points.py`

Implement a 3D Extreme Points algorithm:
- Maintain a set of "extreme points" — candidate positions generated at the 
  corner intersections of every placed box
- On each placement, score all valid extreme points and pick the best 
  (lowest Y first, then lowest X, then lowest Z — gravity + left-to-right fill)
- Produces significantly better utilization than Guillotine at moderate 
  speed cost
- Dense comments explaining: what an extreme point is geometrically, how the 
  candidate set grows/shrinks, why gravity scoring works, overlap detection logic


  Write a typed TypeScript API client:
- `packGuillotine(): Promise<PackingResult[]>`
- `packExtremePoints(): Promise<PackingResult[]>`
- Both call their respective endpoints, parse and return typed results
- Handle errors gracefully — on network failure, throw a typed `PackError` 
  with a human-readable message
- Dense comments explaining the fetch pattern and type mapping

Add an `algorithm` field to the store: `'guillotine' | 'extreme-points'`, 
default `'guillotine'`.

Add a `runPacker` action that:
1. Reads containers + boxes from store
2. Calls the correct API function based on `algorithm`
3. Calls `setPackingResult` with the response
4. Sets a `loading: boolean` and `error: string | null` field during the call


The mock packer (`runMockPacker`) must remain in the store untouched — 
comment it as `// MOCK: remove when backend is stable` so it can be 
restored instantly if the API is down.
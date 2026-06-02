## Goal
  Build the real FastAPI backend with two world-class 3D bin packing algorithms
  in Python, wire a TypeScript API client on the frontend, and swap the mock
  packer for the real API call.

  ---

  ## Part A — Backend: Two Algorithms

  Implement both algorithms in `backend/algorithms/`. Both must:
  - Accept identical input/output shapes mirroring mockPacker.ts exactly
  - Support multiple containers with overflow (fill first container, spill to next)
  - Handle all edge cases from the Phase 10 test suite (empty boxes, qty=0,
    oversized boxes, etc.)
  - Never mutate input data

  ### Algorithm 1 — Guillotine (Speed-Priority)
  File: `backend/algorithms/guillotine.py`

  Implement a 3D Guillotine Cut algorithm:
  - On each placement, split remaining free space into up to 3 sub-spaces
    (guillotine cuts along X, Y, Z planes)
  - Use Largest Volume First (LVF) heuristic to sort boxes before placement
  - Aim for sub-100ms on a TEU filled with 500 small boxes
  - Dense comments explaining every step: what a guillotine cut is, why LVF
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

  ### Shared Contract
  Both algorithms must conform to this exact interface:

  Input:
  {
    "containers": [{ "id": str, "w": float, "h": float, "d": float }],
    "boxes": [{
      "id": str, "w": float, "h": float, "d": float,
      "quantity": int,
      "rotationAllowed": bool,
      "stackingOnTop": bool,
      "stackingUnder": bool
    }]
  }

  Output:
  {
    "containers": [{
      "containerId": str,
      "placements": [{
        "boxId": str, "x": float, "y": float, "z": float,
        "w": float, "h": float, "d": float
      }],
      "utilization": float  // 0.0–1.0
    }]
  }

  Note: colorIndex and label are UI-only fields — do NOT include them in the
  backend input. The backend only needs what affects packing decisions.

  ---

  ## Part B — FastAPI Endpoints

  File: `backend/main.py`

  Expose two endpoints:
  - `POST /api/pack/guillotine`      — calls guillotine.py
  - `POST /api/pack/extreme-points`  — calls extreme_points.py

  Both accept the same request shape. Add CORS for localhost:5173.
  Keep the existing `GET /health` endpoint returning `{ "status": "ok" }`.
  Add request validation via Pydantic models in `backend/models.py`.
  Dense comments on each endpoint explaining the request/response lifecycle.

  ---

  ## Part C — Frontend API Client

  File: `frontend/src/lib/api.ts`

  Write a typed TypeScript API client:
  - `packGuillotine(input: PackInput): Promise<PackingResult[]>`
  - `packExtremePoints(input: PackInput): Promise<PackingResult[]>`
  - Both call their respective endpoints, parse and return typed results
  - Handle errors gracefully — on network failure, throw a typed `PackError`
    with a human-readable message
  - Dense comments explaining the fetch pattern and type mapping

  PackInput must include the constraint fields:
    containers: Array<{ id, w, h, d }>
    boxes: Array<{ id, w, h, d, quantity, rotationAllowed, stackingOnTop, stackingUnder }>

  ---

  ## Part D — Swap Mock → Real in Store

  File: `frontend/src/store/packingSlice.ts`

  Add to PackingSlice interface:
  - `algorithm: 'guillotine' | 'extreme-points'`  default 'guillotine'
  - `setAlgorithm: (a: 'guillotine' | 'extreme-points') => void`
  - `loading: boolean`
  - `error: string | null`

  Update the existing `pack` action (do NOT rename it — Sidebar already calls it):
  - Make it async: `pack: () => Promise<void>`
  - Set loading: true at start, loading: false on finish
  - Call packGuillotine or packExtremePoints from api.ts based on algorithm
  - On success: call setPackingResult with the response
  - On error: set error to the PackError message

  Keep runMockPacker in the file, commented as:
    // MOCK: remove when backend is stable
    // const result = runMockPacker(containers, boxes)
  so it can be restored in one line if the API is down.

  ---

  ## Part E — Algorithm Selector UI

  File: `frontend/src/components/ui/Sidebar.tsx`

  Add a minimal two-button toggle between "Guillotine" and "Extreme Points"
  above the Pack button. Use the same button style as the playback speed
  buttons (border/bg-primary pattern already in the codebase).
  Do NOT use shadcn Tabs — keep it consistent with existing UI patterns.
  Changing the selection calls setAlgorithm in the store.
  No other UI changes.

  ---

  ## Acceptance Criteria
  - [ ] `POST /api/pack/guillotine` returns valid placements with no overlap
  - [ ] `POST /api/pack/extreme-points` returns valid placements with no overlap
  - [ ] Extreme Points utilization is measurably better than Guillotine on T07/T08
  - [ ] Guillotine runs faster than Extreme Points on T05 (500 boxes benchmark)
  - [ ] Frontend calls real API when backend is running
  - [ ] Algorithm toggle in sidebar switches which endpoint is called
  - [ ] Mock packer still restorable in one line as fallback
  - [ ] `GET /health` returns 200
  - [ ] `tsc --noEmit` passes clean
  - [ ] No new npm or pip packages without flagging first
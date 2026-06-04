# Container Packing Visualizer — SaaS MVP

## Project Identity
A live, interactive 3D container packing visualization web app. Targeting logistics professionals who need to optimize box placement across standard shipping containers. Goal: ship a working SaaS MVP. Prioritize working software over perfect code.

## Persona
Act as a Senior Full-Stack Engineer specializing in React, 3D graphics (WebGL), and algorithmic backends. You own all decisions — frontend, backend, architecture, UX. When multiple valid approaches exist, pick the one that ships fastest without creating technical debt that blocks future features.

## Decision-Making Rules
- **Prototype speed first.** Make it work, then make it clean. Don't over-engineer.
- **No external paid APIs ever.** All logic runs locally or on self-hosted infrastructure.
- **When stuck between two approaches**, prefer the one with less state complexity.
- **Don't ask for clarification on minor decisions** — make a reasonable choice and leave a `// TODO:` comment explaining the tradeoff.
- **Docker-first.** Every service must run in a container. Always keep `docker-compose.yml` in sync with what you build.
- **Important**: Always write modular, scalable code that strictly adheres to SOLID principles and industry-standard coding conventions. Ensure components are reusable, separation of concerns is maintained, and functions are kept single-purpose for easy testing and maintenance.


## Tech Stack (locked — do not deviate)
| Layer | Technology |
|---|---|
| Frontend | React + Vite, TypeScript |
| 3D | React Three Fiber (R3F), Drei |
| Animation | GSAP (timeline-based) |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand |
| Backend | Python + FastAPI |
| Infra | Docker + docker-compose |

## Architecture
```
container-packing/
├── docker-compose.yml                        # Orchestrates frontend + backend services
├── .gitignore                                # OS, editor, .env, docker-compose.override.yml
│
├── frontend/
│   └── src/
│       ├── main.tsx                          # Entry point, mounts React app
│       ├── App.tsx                           # Root layout: sidebar left, canvas right
│       │
│       ├── components/
│       │   ├── 3d/
│       │   │   ├── Canvas.tsx                # R3F scene, camera, lighting, OrbitControls
│       │   │   ├── ContainerMesh.tsx         # Wireframe-only container + 75° open door
│       │   │   ├── ContainerManager.tsx      # Loops containers from store, positions side-by-side
│       │   │   └── InstancedBoxes.tsx        # All packed boxes via InstancedMesh + GSAP animation
│       │   │
│       │   └── ui/
│       │       ├── Sidebar.tsx               # Left panel: ContainerTypeSelector, Pack button, result summary
│       │       ├── ContainerTypeSelector.tsx # Glow-toggle buttons for 20ft / 40ft selection
│       │       ├── BoxForm.tsx               # Add boxes (w, h, d, quantity)
│       │       ├── UtilizationStats.tsx      # % space used per container
│       │       └── PlaybackControls.tsx      # Play/pause/scrub slider/speed multiplier
│       │
│       ├── store/
│       │   ├── index.ts                      # Zustand store: combines all slices
│       │   ├── containerSlice.ts             # availableTypes, setContainersFromResult, containerFocusKey
│       │   ├── boxSlice.ts
│       │   ├── packingSlice.ts               # loading, error, totalCost, containerSummary, allPacked, runPacker
│       │   └── uiSlice.ts
│       │
│       └── lib/
│           ├── api.ts                        # apiOptimizeExtremePoints fetch wrapper + OptimizerResult type
│           ├── colors.ts                     # Deterministic index-based color palette
│           └── math.ts                       # 3D placement math, bounding box helpers
│
└── backend/
    ├── main.py                               # FastAPI app, CORS (localhost:5173), single optimize endpoint
    ├── schema.py                             # Pydantic models: OptimizeRequest, OptimizeResponse, etc.
    ├── requirements.txt
    ├── .gitignore                            # venv/, __pycache__, *.pyc, .pytest_cache
    └── algorithms/
        ├── __init__.py
        ├── common.py                         # gravity_settle, overlaps_3d, get_orientations
        ├── optimizer.py                      # Cost-minimising combo search (20ft=1.0, 40ft=1.5 units)
        └── extreme_points.py                 # EP set, gravity + depth-first scoring, EP pruning
```

## Core Domain Logic

### Container Presets
- **20ft TEU:** 589 × 235 × 239 cm (L×W×H) — cost 1.0 unit
- **40ft FEU:** 1203 × 235 × 239 cm (L×W×H) — cost 1.5 units
- User selects which types are *available* (20ft, 40ft, or both). The optimizer picks the cheapest combination.

### Container Cost Optimizer
Single endpoint `POST /api/optimize/extreme-points`. The optimizer:
1. Generates all `(n20, n40)` container combinations (1–8 containers total).
2. Sorts by `(cost, total_containers, n_20)` — cheapest first, fewest containers as tiebreak, prefer 20ft over 40ft.
3. Does a volume pre-check (skip combos where total volume < box volume).
4. Runs Extreme Points on each combo until one achieves `all_packed = True`.
5. Returns that result immediately.

Request: `{ boxes: [{id, label, w, h, d, quantity, colorIndex}], available_types: ["20ft", "40ft"] }`
Response: `{ containers, containers_used, total_cost, container_summary, all_packed }`

Placements are sorted by centre-z ascending (back → door) — this is the animation sequence order.

### Packing Algorithm — Extreme Points
Enforces gravity (no floating boxes) and depth-first loading (z=0 = back wall, z=d = door).

- EP set starts at `{(0,0,0)}`.
- Boxes sorted LFD (largest base area first).
- Each EP tries all 6 axis-aligned orientations; scores by `(settled_y, ep_z, ep_x)`.
- `gravity_settle()` scans XZ footprint overlaps of all placed boxes, returns max top-face Y.
- Before committing, checks `overlaps_3d()` against every placed box (separating axis theorem — overlap on ALL 3 axes = collision).
- 3 new EPs added per placement (right face, top face, front face). Dominated/out-of-bounds EPs pruned.
- Boxes placed largest-first — not mathematically guaranteed optimal but empirically best in practice.
- All placements are axis-aligned only (no diagonal/rotated placement).

Shared math in `backend/algorithms/common.py`: `gravity_settle`, `overlaps_3d`, `get_orientations`.

### 3D Rendering Rules
- Containers render as **transparent wireframes** only.
- Boxes MUST use **InstancedMesh** — no exceptions. This is non-negotiable for 60fps at scale.
- Each unique box type gets a color from a deterministic palette (index-based, never random).
- Boxes animate in **one-by-one** using a GSAP timeline, in packing sequence order.

### Multi-Container UX
- Containers are set by the optimizer result — user never manually adds/removes them.
- If >1 container: clicking a container in the scene focuses the camera on it (GSAP transition).
- `containerFocusKey` counter increments on every `setActiveContainerIndex` call — allows re-clicking the already-active container to re-trigger the camera zoom.
- Camera only auto-zooms on explicit user click, not on list changes (guarded by `prevFocusKeyRef`).
- Sidebar shows per-container utilization % alongside the global item list.

### Playback Controls
- Play / Pause / Scrub (slider mapped to GSAP timeline progress).
- Speed multiplier: 0.5×, 1×, 2× buttons.

## UI/UX Rules
- Dark mode by default, light mode toggle available.
- Extremely minimal — no decorative elements, no gradients. Functional UI only.
- Sidebar: fixed left, collapsible.
- Canvas: fills remaining viewport.
- shadcn/ui for all form inputs, buttons, dropdowns.

## Build Incrementally
Always build in this sequence. Do not skip phases:

1. **Scaffold** — Vite/React/TS/Tailwind/shadcn init + Docker setup + empty layout
2. **State + Forms** — Zustand store + container form (presets + custom) + box form
3. **3D Foundation** — R3F canvas + wireframe container that reacts to Zustand state
4. **Mock Packer** — `lib/mockPacker.ts` Guillotine implementation + wiring to store
5. **Instanced Rendering** — InstancedMesh boxes placed per packing result
6. **Animation** — GSAP timeline, playback controls
7. **Multi-container** — Container switcher, camera transitions, per-container stats
8. **Backend** — FastAPI + real Guillotine algorithm, swap mock → API call
9. **Docker** — docker-compose wiring both services, env vars, health checks
10. **Packer Testing** — Rigorous test suite for packing correctness (see test cases below)

After completing each phase, confirm it runs before proceeding to the next.

## What Good Output Looks Like
- TypeScript types defined for all data structures (`Box`, `Container`, `Placement`, `PackingResult`)
- Components are small and single-responsibility
- Zustand store is the single source of truth — no local state that duplicates store state
- `// TODO:` comments mark known shortcuts taken for prototype speed
- `docker-compose up` starts everything from scratch with no extra steps

---

## Phase 10 — Integration Test Suite (Vitest + HTTP)

Tests call the real backend via HTTP (`apiOptimizeExtremePoints`). Each test asserts on the returned `PackingResult[]`. Tests live in `frontend/src/lib/__tests__/packer.test.ts` using Vitest. Backend must be running before the suite executes.

### What every test must verify
1. **No overlap** — no two placements share any volume in the same container.
2. **Within bounds** — every placement fits inside its container (`x+w ≤ container.w`, `y+h ≤ container.h`, `z+d ≤ container.d`).
3. **Correct count** — total placements across all containers equals total box quantity (or less if some don't fit).
4. **No floating** — every box either rests on the floor (`y=0`) or on top of another box (`y = some box's y+h`).

### Overlap check helper
```ts
function hasOverlap(placements: Placement[]): boolean {
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i], b = placements[j]
      const xOk = a.x + a.w <= b.x || b.x + b.w <= a.x
      const yOk = a.y + a.h <= b.y || b.y + b.h <= a.y
      const zOk = a.z + a.d <= b.z || b.z + b.d <= a.z
      if (!xOk && !yOk && !zOk) return true
    }
  }
  return false
}
```

### Test Cases

#### GROUP 1 — Single box type, single container

| ID | Description | Container | Box | Qty | Expected |
|---|---|---|---|---|---|
| T01 | Single box fits exactly | 100×100×100 | 100×100×100 | 1 | 1 placed, 100% utilization |
| T02 | Single box too large | 100×100×100 | 101×100×100 | 1 | 0 placed |
| T03 | Fill floor with identical boxes | 200×100×200 | 100×100×100 | 4 | 4 placed, ~100% utilization (2×2 floor layer) |
| T04 | Stack identical boxes | 100×200×100 | 100×100×100 | 2 | 2 placed (one on top of other) |
| T05 | Overfill — more boxes than fit | 100×100×100 | 50×50×50 | 100 | 8 placed (2×2×2 = 8 fit), rest unplaced |
| T06 | One large box + many small | 200×200×200 | 200×200×200 (×1) + 50×50×50 (×8) | mixed | large placed first, smalls fill remaining space or stack |

#### GROUP 2 — Multiple box types, single container

| ID | Description | Container | Boxes | Expected |
|---|---|---|---|---|
| T07 | Two sizes, equal quantity | 20ft TEU | 50×50×50 (×50) + 100×100×100 (×50) | larger boxes placed first (LFD), no overlap, no floating |
| T08 | Three sizes, LFD order | 20ft TEU | 120×80×80 (×20) + 60×60×60 (×30) + 30×30×30 (×50) | placement order: large → medium → small |
| T09 | Boxes that only fit one orientation | 200×100×50 container | 200×50×50 (×2) | both placed side by side on floor |
| T10 | Mix of tall and flat boxes | 20ft TEU | 50×200×50 (×10, tall) + 200×50×50 (×10, flat) | no floating, stacking respects gravity |

#### GROUP 3 — Boundary and edge cases

| ID | Description | Container | Boxes | Expected |
|---|---|---|---|---|
| T11 | Empty box list | 20ft TEU | none | 0 placements, 0% utilization |
| T12 | Empty container list | none | 50×50×50 (×10) | returns [] |
| T13 | Box exactly fits one axis edge | 589×100×100 container | 589×100×100 (×1) | 1 placed, fits flush against all Z walls |
| T14 | Quantity 0 box | 20ft TEU | 50×50×50 (qty=0) | 0 placements |
| T15 | 1×1×1 boxes fill container | 10×10×10 container | 1×1×1 (×1000) | 1000 placed, 100% utilization |

#### GROUP 4 — Multi-container

| ID | Description | Containers | Boxes | Expected |
|---|---|---|---|---|
| T16 | Overflow from first to second | two 20ft TEUs | 100×100×100 (×200) | first container full, remainder in second |
| T17 | Second container stays empty | two 20ft TEUs | 50×50×50 (×1) | 1 placed in first, second has 0 placements |
| T18 | Each container gets different sizes | two 20ft TEUs | 200×200×200 (×10) + 50×50×50 (×500) | large boxes in first, smalls overflow into second |

#### GROUP 5 — Utilization accuracy

| ID | Description | Expected utilization |
|---|---|---|
| T19 | Perfect fit (single box fills container) | 1.0 (100%) |
| T20 | Half-fill (boxes occupy exactly half volume) | ~0.5 (50%) |
| T21 | Near-empty (1 small box in large container) | close to 0 |

### Pass criteria
- All GROUP 1–3 tests pass with zero overlap and zero out-of-bounds placements.
- GROUP 4 tests pass with correct spillover between containers.
- Utilization values are within ±1% of expected.
- Suite runs in under 500ms total (pure TS, no browser needed).

---

## Phase 11 — EP Algorithm Unit Tests (pytest)

Tests call `_pack_container` directly — no HTTP, no frontend. Tests live in `backend/tests/test_extreme_points.py` using pytest. Run with `pytest tests/test_extreme_points.py -v` from the `backend/` directory.

These tests target the internal behaviour of the Extreme Points algorithm: EP growth direction, scoring priority, gravity settle correctness, greedy skip handling, and animation sort order.

### GROUP A — EP grows outward in each axis

| ID | Description | Container | Boxes | Expected placement coordinates |
|---|---|---|---|---|
| A1 | EP grows rightward | 200×100×100 | 100×100×100 (×2) | box1 at x=0; box2 at x=100 (used EP_right) |
| A2 | EP grows upward | 100×200×100 | 100×100×100 (×2) | box1 at y=0; box2 at y=100 (used EP_top) |
| A3 | EP grows forward | 100×100×200 | 100×100×100 (×2) | box1 at z=0; box2 at z=100 (used EP_front) |

### GROUP B — Scoring picks correct EP when multiple exist

| ID | Description | Setup | Expected |
|---|---|---|---|
| B1 | Depth-first over left-right | 200×100×200 container; box1 at (0,0,0) generates EP_right (100,0,0) and EP_front (0,0,100); box2 is 100×100×100 | box2 at x=100, z=0 — score (0,0,100) beats (0,100,0) on ez |
| B2 | Gravity beats depth | Container with elevated EP and a free floor position at greater z | box lands at y=0 even if that EP has higher z than the elevated EP |

### GROUP C — Gravity settle correctness

| ID | Description | Container | Setup | Expected |
|---|---|---|---|---|
| C1 | Box lands on top of another | 100×300×100 | box1 at (0,0,0); box2 same size | box2 y=100 |
| C2 | Partial footprint — lands on highest surface | 200×200×100 | box1 100×100×100 at (0,0,0); box2 footprint spans full width | box2 y=100 (gravity finds box1 under part of footprint) |

### GROUP D — Greedy skip handling

| ID | Description | Container | Boxes | Expected |
|---|---|---|---|---|
| D1 | Skipped box recorded in unplaced | 100×100×100 | 100×100×100 (fills container) + 50×50×50 | 1 placement, 1 in unplaced — not silently dropped |
| D2 | Impossible box skipped, others still place | 100×100×100 | 101×50×50 (too wide, any orientation) + 50×50×50 (×2) | impossible box in unplaced; 2 small boxes placed |

### GROUP E — Back-to-front animation sort

| ID | Description | Container | Boxes | Expected |
|---|---|---|---|---|
| E1 | Placements sorted by centre-z ascending | 100×100×300 | 100×100×100 (×3) | placement[0].z=0, placement[1].z=100, placement[2].z=200 |

### Pass criteria
- All coordinate assertions are exact (floating point equal within 0.001).
- All unplaced counts are exact.
- Suite runs in under 100ms (no HTTP, direct function calls).

---

## Session State

### Phase Progress
- [x] Phase 1 — Scaffold + Docker ✅
- [x] Phase 2 — Zustand store + TypeScript types ✅
- [x] Phase 3 — 3D Foundation ✅
- [x] Phase 4 — Mock Packer ✅
- [x] Phase 5 — Instanced Rendering ✅
- [x] Phase 6 — Animation + Playback Controls ✅ (6a ✅ · 6b ✅ · 6c ✅ · 6d ✅ · 6e ✅)
- [x] Phase 7 — Multi-container UX ✅
- [x] Phase 8 — Backend + Frontend wiring ✅ (8A ✅ · 8B ✅ · Architecture rework ✅)
- [x] Phase 9 — Docker wiring ✅
- [ ] Phase 10 — Integration Test Suite (Vitest + HTTP)
- [ ] Phase 11 — EP Algorithm Unit Tests (pytest)

### Last Session Notes

#### Phase 8A — Backend (Python FastAPI)
- `backend/schema.py` — Pydantic models: `OptimizeRequest`, `OptimizeResponse`, `ContainerUsed`, `ContainerIn`, `BoxIn`, `PlacementOut`, `ContainerResult`
- `backend/algorithms/__init__.py` — package marker
- `backend/algorithms/common.py` — `gravity_settle()`, `overlaps_3d()`, `get_orientations()`
- `backend/algorithms/extreme_points.py` — EP set, gravity + depth-first scoring, explicit `overlaps_3d` collision check before every placement commit
- `backend/algorithms/optimizer.py` — generates `(n20, n40)` combos sorted `(cost, total, n20)`; volume pre-check; runs EP on each combo; returns first `all_packed=True` result
- `backend/main.py` — single endpoint `POST /api/optimize/extreme-points` + `GET /health`; CORS `http://localhost:5173`
- **Deleted**: `backend/algorithms/guillotine.py`

#### Phase 8B — Frontend wiring + Architecture rework
- `frontend/src/lib/api.ts` — `OptimizerResult` type, `PackError` class, `apiOptimizeExtremePoints()`; guillotine wrapper removed
- `frontend/src/store/containerSlice.ts` — reworked: removed add/remove/update; added `availableTypes: ContainerType[]`, `setAvailableTypes`, `setContainersFromResult`, `containerFocusKey` counter
- `frontend/src/store/packingSlice.ts` — removed `algorithm` toggle and `setAlgorithm`; added `totalCost`, `containerSummary`, `allPacked`; `runPacker` calls `apiOptimizeExtremePoints` then `setContainersFromResult`
- `frontend/src/components/ui/ContainerTypeSelector.tsx` (new) — glow-button toggles for 20ft / 40ft; both deselected disables Pack
- `frontend/src/components/ui/Sidebar.tsx` — replaced algorithm toggle + ContainerForm with ContainerTypeSelector; shows optimizer result summary (selected combo, cost, all_packed warning)
- `frontend/src/components/3d/ContainerMesh.tsx` — door fixed to 75° open; removed filled mesh panels (wireframe only); fixes door blocking boxes view
- `frontend/src/components/3d/InstancedBoxes.tsx` — added `side={THREE.DoubleSide}` to fix back-face culling (boxes showing only edges)
- `frontend/src/components/3d/Canvas.tsx` — `containerFocusKey` + `prevFocusKeyRef` guard on camera Effect 2; camera only zooms on explicit user click, not on container list change
- `frontend/vite.config.ts` — `server.proxy`: `/api` → `http://localhost:8000`
- **Deleted**: `frontend/src/lib/mockPacker.ts`, `frontend/src/lib/presets.ts`, `frontend/src/components/ui/ContainerForm.tsx`

#### Gitignore setup
- `.gitignore` (root) — OS, editor, `.env`, `docker-compose.override.yml`
- `backend/.gitignore` — `venv/`, `__pycache__`, `*.pyc`, `.pytest_cache`, coverage
- `frontend/.gitignore` — `node_modules/`, `dist/`, coverage, logs, env files

#### Phase 9 — Docker wiring
- `frontend/nginx.conf` (new) — proxies `/api/` to `http://backend:8000`, SPA fallback (`try_files`) so React Router handles unknown routes
- `frontend/Dockerfile` — added `COPY nginx.conf /etc/nginx/conf.d/default.conf` to replace the default nginx config
- `docker-compose.yml` — `depends_on` now uses `condition: service_healthy` so frontend container waits for backend healthcheck to pass before starting; added `start_period: 15s` to give uvicorn time to boot before retries begin; `retries` increased to 5

### Next Session Start Point
Phase 10 — Vitest integration test suite: `frontend/src/lib/__tests__/packer.test.ts`. Requires backend running. Then Phase 11 — pytest EP unit tests at `backend/tests/test_extreme_points.py`.
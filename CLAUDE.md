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
│
├── frontend/
│   └── src/
│       ├── main.tsx                          # Entry point, mounts React app
│       ├── App.tsx                           # Root layout: sidebar left, canvas right
│       │
│       ├── components/
│       │   ├── 3d/
│       │   │   ├── Canvas.tsx                # R3F scene, camera, lighting, OrbitControls
│       │   │   ├── ContainerMesh.tsx         # Single wireframe container box (takes dims as props)
│       │   │   ├── ContainerManager.tsx      # Loops containers from store, positions side-by-side
│       │   │   └── InstancedBoxes.tsx        # All packed boxes via InstancedMesh + GSAP animation
│       │   │
│       │   └── ui/
│       │       ├── Sidebar.tsx               # Left panel: algorithm toggle, Pack button, error/loading state
│       │       ├── ContainerForm.tsx         # Add containers, 20ft/40ft preset buttons
│       │       ├── BoxForm.tsx               # Add boxes (w, h, d, quantity)
│       │       ├── UtilizationStats.tsx      # % space used per container
│       │       └── PlaybackControls.tsx      # Play/pause/scrub slider/speed multiplier
│       │
│       ├── store/
│       │   ├── index.ts                      # Zustand store: combines all slices
│       │   ├── containerSlice.ts
│       │   ├── boxSlice.ts
│       │   ├── packingSlice.ts               # algorithm, loading, error, runPacker
│       │   └── uiSlice.ts
│       │
│       └── lib/
│           ├── presets.ts                    # TEU/FEU dimension constants
│           ├── mockPacker.ts                 # MOCK: TS Guillotine fallback — remove when backend stable
│           ├── api.ts                        # packGuillotine / packExtremePoints fetch wrappers
│           ├── colors.ts                     # Deterministic index-based color palette
│           └── math.ts                       # 3D placement math, bounding box helpers
│
└── backend/
    ├── main.py                               # FastAPI app, CORS (localhost:5173), two pack endpoints
    ├── schema.py                             # Pydantic models: PackRequest, PackResponse, etc.
    ├── requirements.txt
    └── algorithms/
        ├── __init__.py
        ├── common.py                         # gravity_settle, overlaps_3d, get_orientations
        ├── guillotine.py                     # LFD + depth-first Best Fit + 3-way guillotine split
        └── extreme_points.py                 # EP set, gravity + depth-first scoring, EP pruning
```

## Core Domain Logic

### Container Presets
- **20ft TEU:** 589 × 235 × 239 cm (L×W×H)
- **40ft FEU:** 1203 × 235 × 239 cm (L×W×H)
- Custom dimensions always available alongside presets.

### Packing Algorithm
Two real algorithms live in `backend/algorithms/`. Both enforce gravity (no floating boxes) and depth-first loading (z=0 = back wall, fill toward z=d = door).

- **Guillotine** (`POST /api/pack/guillotine`) — speed-priority. LFD sort, depth-first Best Fit space selection, 3-way guillotine split (R1 right / R2 above / R3 front). Target: <100ms for 500 boxes in a TEU.
- **Extreme Points** (`POST /api/pack/extreme-points`) — utilization-priority. Maintains EP set, scores by `(settled_y, ep_z, ep_x)`. Better density at moderate speed cost.

Shared contract (both endpoints):
- Request: `{ containers: [{id, w, h, d}], boxes: [{id, label, w, h, d, quantity, colorIndex}] }`
- Response: `{ containers: [{containerId, placements: [{boxId, x, y, z, w, h, d}], utilization}] }`
- Placements are sorted by centre-z ascending (back → door) — this is the animation sequence order.

Frontend: `lib/api.ts` exposes `packGuillotine` / `packExtremePoints`. Store field `algorithm` controls which is called. `lib/mockPacker.ts` remains as a local fallback (marked MOCK).

### 3D Rendering Rules
- Containers render as **transparent wireframes** only.
- Boxes MUST use **InstancedMesh** — no exceptions. This is non-negotiable for 60fps at scale.
- Each unique box type gets a color from a deterministic palette (index-based, never random).
- Boxes animate in **one-by-one** using a GSAP timeline, in packing sequence order.

### Multi-Container UX
- If >1 container: show a dropdown/tab to switch active container view.
- Camera smoothly transitions (GSAP) to focus on the selected container.
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

## Phase 10 — Packer Test Suite

All tests run against `runMockPacker` (and later the real backend via `runPacker`). Each test asserts on the returned `PackingResult[]`. Tests live in `src/lib/__tests__/packer.test.ts` using Vitest.

### What every test must verify
1. **No overlap** — no two placements share any volume in the same container.
2. **Within bounds** — every placement fits inside its container (`x+w ≤ container.d`, `y+h ≤ container.h`, `z+d ≤ container.w`).
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

## Session State

### Phase Progress
- [x] Phase 1 — Scaffold + Docker ✅
- [x] Phase 2 — Zustand store + TypeScript types ✅
- [x] Phase 3 — 3D Foundation ✅
- [x] Phase 4 — Mock Packer ✅
- [x] Phase 5 — Instanced Rendering ✅
- [x] Phase 6 — Animation + Playback Controls ✅ (6a ✅ · 6b ✅ · 6c ✅ · 6d ✅ · 6e ✅)
- [x] Phase 7 — Multi-container UX ✅
- [x] Phase 8 — Backend + Frontend wiring ✅ (8A ✅ · 8B ✅)
- [ ] Phase 9 — Docker wiring
- [ ] Phase 10 — Packer Test Suite

### Last Session Notes

#### Phase 8A — Backend (Python FastAPI)
- `backend/schema.py` (new) — all Pydantic models: `PackRequest`, `PackResponse`, `ContainerIn`, `BoxIn`, `PlacementOut`, `ContainerResult`
- `backend/algorithms/__init__.py` (new) — package marker
- `backend/algorithms/common.py` (new) — `gravity_settle()`, `overlaps_3d()`, `get_orientations()` shared by both algorithms
- `backend/algorithms/guillotine.py` (new) — LFD sort (largest base area first); depth-first Best Fit space selection `(space.z, space_volume)`; 3-way guillotine split: R1 right (full height+depth), R2 above (column above box), R3 front (space toward door); every placement gravity-settled; placements sorted centre-z asc
- `backend/algorithms/extreme_points.py` (new) — EP set starts at `{(0,0,0)}`; 3 new EPs per placement (right/top/front faces); scoring `(settled_y, ep_z, ep_x)` = gravity + depth-first + left-right; EP pruning removes dominated/out-of-bounds points; placements sorted centre-z asc
- `backend/main.py` (rewritten) — `POST /api/pack/guillotine`, `POST /api/pack/extreme-points`, `GET /health`; CORS restricted to `http://localhost:5173`

#### Phase 8B — Frontend wiring
- `frontend/src/lib/api.ts` (rewritten) — `PackInput` type, `PackError` class, private `callPackApi` helper, exported `packGuillotine()` and `packExtremePoints()`; network failures throw typed `PackError` with human-readable message
- `frontend/src/store/packingSlice.ts` — added `algorithm: 'guillotine' | 'extreme-points'` (default `'guillotine'`), `loading: boolean`, `error: string | null`, `setAlgorithm` action; renamed `pack` → `runPacker` (async, sets loading/error state, branches on algorithm)
- `frontend/src/components/ui/Sidebar.tsx` — two-button algorithm toggle (Guillotine / Extreme Points) above Pack button; Pack button shows `Packing…` + disabled during loading; error message rendered below on API failure
- `frontend/src/lib/mockPacker.ts` — added `// MOCK: remove when backend is stable` comment on `runMockPacker`
- `frontend/vite.config.ts` — `server.proxy` added: `/api` → `http://localhost:8000`

### Next Session Start Point
Phase 9 — Docker wiring: update `docker-compose.yml` for both services with correct build contexts, env vars, health checks, and volume mounts. Ensure `docker-compose up` starts everything from scratch.
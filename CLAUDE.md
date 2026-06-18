# Container Packing Visualizer — SaaS MVP

## Project Overview
A live, interactive 3D container packing visualization web app targeting logistics professionals who need to optimize box placement across standard shipping containers. Data flows from an Excel manifest (pallets → cartons) into the optimizer, then renders the result as an animated 3D load plan.

Act as a Senior Full-Stack Engineer owning all decisions — frontend, backend, architecture, UX. Pick the approach that ships fastest without creating blocking technical debt.

**Rules:**
- No external paid APIs. All logic runs locally or on self-hosted infrastructure.
- Prefer less state complexity when two approaches are equivalent.
- Don't ask for clarification on minor decisions — make a reasonable choice and leave a `// TODO:` comment.
- Docker-first. Keep `docker-compose.yml` in sync with what you build.
- SOLID principles, single-responsibility components, no premature abstractions.

## Tech Stack
| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite, TypeScript |
| 3D | React Three Fiber (R3F), Drei |
| Animation | GSAP (timeline-based) |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand |
| Backend | Python + FastAPI |
| Infra | Docker + docker-compose |

## Architecture
```
3d-packing/
├── docker-compose.yml
├── frontend/
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                           # Root layout: sidebar left, canvas right + ActivePalletPanel overlay
│       ├── components/
│       │   ├── 3d/
│       │   │   ├── Canvas.tsx                # R3F scene, camera, lighting, OrbitControls, CameraController
│       │   │   ├── ContainerMesh.tsx         # Wireframe container + 75° open doors
│       │   │   ├── ContainerManager.tsx      # Containers side-by-side; buildContainerWorldMap
│       │   │   ├── InstancedCartons.tsx      # Packed cartons: InstancedMesh + GSAP + seq labels + rotation planes
│       │   │   └── CartonPreview.tsx         # Mini R3F canvas — live 3D preview in CartonEditDialog
│       │   └── ui/
│       │       ├── Sidebar.tsx               # Left panel: setup view + test-case view (flask icon toggle)
│       │       ├── ContainerTypeSelector.tsx # Glow-toggle buttons for 20ft / 40ft
│       │       ├── PalletList.tsx            # Renders PalletRow for each pallet; empty state
│       │       ├── PalletRow.tsx             # Accordion row + Rotate/Stack badges per carton
│       │       ├── CartonEditDialog.tsx      # Edit carton dims/qty/rotation/stacking; live CartonPreview
│       │       ├── UtilizationStats.tsx      # Per-container utilization bar + per-pallet counts
│       │       ├── PlaybackControls.tsx      # Play/pause/scrub/speed + pallet checkpoint markers
│       │       ├── ActivePalletPanel.tsx     # Canvas overlay: live pallet tracking, click-to-jump
│       │       └── TestCasePanel.tsx         # Preloaded test cases, each with its own Pack button
│       ├── store/
│       │   ├── index.ts                      # Zustand store combining all slices
│       │   ├── containerSlice.ts             # availableTypes, containers, containerFocusKey
│       │   ├── cartonSlice.ts                # Carton type + CARTON_DEFAULTS (type-only slice)
│       │   ├── palletSlice.ts                # pallets[], setPallets, removePallet, updatePalletCarton
│       │   ├── packingSlice.ts               # runPacker, packingResult, palletBoundaries, totalPackedCount
│       │   └── uiSlice.ts                    # sidebarOpen, darkMode, playing, speed, progress
│       └── lib/
│           ├── api.ts                        # POST /api/optimize (algorithm in body); boxId→cartonId mapping; PackError
│           ├── colors.ts                     # 16-color deterministic palette (index-based)
│           ├── cartonShapes.ts               # Shared Three.js helpers: buildArrowGeo, lightenColor
│           ├── animationState.ts             # Module-level GSAP timeline ref (canvas ↔ sidebar)
│           ├── excelImport.ts                # parseExcel() — SheetJS parser, returns Pallet[]
│           ├── excelExport.ts                # exportLoadPlan() — Summary + one sheet per container
│           ├── testCases.ts                  # 8 preloaded packing-logic test cases
│           └── mockPacker.ts                 # Offline shelf packer (USE_MOCK_PACKER fallback)
└── backend/
    ├── main.py                               # FastAPI app, CORS localhost:5173, /health
    ├── schema.py                             # Pydantic: OptimizeRequest/Response, BoxIn, PlacementOut
    ├── requirements.txt                      # fastapi, uvicorn[standard]
    └── algorithms/
        ├── common.py                         # gravity_settle, overlaps_3d, get_orientations
        ├── optimizer.py                      # Cost-minimizing combo search + volume pre-check
        └── guillotine.py                     # 3D free-space guillotine packer (replaces extreme_points)
```

## Conventions & Standards

### Domain Model
The packing unit is a **carton** (a product box with W×H×D). Cartons are grouped into **pallets** (a logical shipment unit with an ID). A pallet contains one or more carton types.

```
Pallet  { id, label, cartons: Carton[] }
Carton  { id, label, w, h, d, quantity, rotationAllowed, stacking }
```

`Carton` is defined in `cartonSlice.ts` and is the single type used everywhere — `palletSlice.Pallet.cartons` is `Carton[]`, and `packingSlice.runPacker` will flatten pallets into carton instances in Phase 3.

### Axis Convention
- `w` = X (cross-section width, 235 cm for both container types)
- `h` = Y (height, 239 cm)
- `d` = Z (depth/length; `z=0` = back wall, `z=d` = door)
- World X: containers placed side-by-side with 100 cm gap (`CONTAINER_GAP_CM`)

### Container Presets
Backend `optimizer.py::_TYPES` is the source of truth:
- **20ft TEU:** `d=589, w=235, h=239` — cost 1.0
- **40ft FEU:** `d=1202, w=235, h=269` — cost 1.5

⚠️ `ContainerTypeSelector` display text and `mockPacker.ts` still say `1203 × 235 × 239` for the 40ft — see "What needs to be fixed".

### Optimizer (`POST /api/optimize`)
Generates all `(n20, n40)` combos under `MAX_COST = 10`, sorted by `(cost, total, n20)`. Volume pre-check skips impossible combos. Runs the selected packer on each until `all_packed=True`; returns first success, else the partial attempt that placed the most cartons.

The packing algorithm is chosen by the request's `algorithm` field (default `"guillotine"`) and resolved through `algorithms/registry.py::REGISTRY` (`PackerFn = (containers, boxes) -> list[ContainerResult]`). An unknown key returns HTTP 400. Adding an algorithm = implement a `run_*` function with that signature, import it in the registry, add one `REGISTRY` entry — the endpoint, optimizer, and frontend need no other changes. Frontend: the selected `AlgoId` (`uiSlice.algo`, set by the Sidebar algorithm buttons) flows through `runPacker` → `api.ts::apiOptimize` → the request body.

Registered packers (all share the depth-first guillotine engine; benchmarking showed depth-first scoring beats every best-fit variant on dense small-carton loads, so best-fit was dropped):
- **`guillotine`** — single depth-first pass (fastest). `guillotine.py::run_guillotine`.
- **`algo2`** / **`algo3`** — iterated local search over *within-pallet* carton order, decoded through the same depth-first engine, greedy-accept from the guillotine baseline (so never worse than guillotine; strictly better on heterogeneous loads, no change on uniform small-box loads). `metaheuristic.py::run_light_search` (small budget) / `run_deep_search` (large budget). Pallet order and boundaries are never reordered. Fixed RNG seed → reproducible.

The engine is parametrized by a `PlacementScore` (`guillotine.py`) and exposes reusable `build_groups()` + `pack_into_containers()` so new algorithms compose rather than duplicate the placement machinery.

### Packing Algorithm — Guillotine
The packer maintains a list of free rectangular cuboids. The container starts as one free space equal to its full interior. Carton instances are ordered by pallet group (colorIndex ascending) with volume-descending sort within each group. For each carton the algorithm tries every (free space, orientation) pair, scores candidates by `(pz, py, px)` — depth-first so each z-slice fills completely before advancing toward the door — and rejects any candidate that floats (full-support check: the carton's entire bottom face must be covered by tops of already-placed cartons at that height). The winning placement splits its host space into three non-overlapping sub-spaces using a Front-first guillotine cut: **Front** inherits the full parent width so later pallets always get a wide zone; **Right-in-back** fills the same z-slice to the right; **Above** enables stacking within that z-slice. Before each new pallet group packs, the free-space list is **coalesced** (`_merge_spaces`): any two spaces sharing a full face and abutting are fused into their union, defragmenting the per-column gaps a finished pallet leaves behind so the next pallet packs at its own pitch instead of inheriting the previous pallet's grid (also shrinks the space list, which speeds up packing). After each pallet group finishes, the z-frontier (`max(z + d)` across that pallet's placements) is computed: floor-level free spaces inside the frontier are discarded (preventing the next pallet from placing beside the current pallet at the same height), but Above spaces (`sp.y > 0`) are kept so the next pallet can stack on top of the current one, and a single clean Front space is added starting at the frontier. Finally, placements are reordered by Kahn's topological BFS — the support graph has an edge j→i wherever carton j's top face directly underlies carton i's bottom face — with BFS frontier tie-breaking by `(colorIndex, centre_z)`, guaranteeing every carton from pallet N animates before any carton from pallet N+1, and within each pallet cartons animate back-to-front. Overflow cartons are grouped by `colorIndex` and forwarded to the next container.

Per-carton constraints (both flow from `BoxIn` through every instance dict):
- **`rotationAllowed=False`** → `get_orientations` returns only the original `(w, h, d)`; otherwise all 6 axis permutations (deduplicated, so boxes with equal dims yield 3 or 1 unique orientations).
- **`stacking=False`** → `_is_fully_supported` rejects any candidate resting on that carton, so nothing is ever placed on top of a non-stackable carton (the carton itself may still be placed on top of stackable ones).

### 3D Rendering
- Containers: transparent wireframes only (`EdgesGeometry` + `lineBasicMaterial`)
- Cartons: **must use `InstancedMesh`** — non-negotiable for 60fps at scale; one mesh per `cartonId + placed-dims` group
- Carton colors: deterministic palette (`colorIndex % 16`), never random
- Animation: GSAP timeline (0.4s per carton), cartons slide in one-by-one from outside the door (entry Z = `containerLength + 50`)
- `timelineRef` lives in `animationState.ts` (module-level, not a React ref) so `PlaybackControls` and `InstancedCartons` share the same timeline without prop-drilling
- **Sequence numbers:** every carton renders its load order (`globalIndex + 1`) as a flat drei `<Text>` on its top face; the label appears the moment the carton lands (`progress >= gi + 1`). Global across containers and matches the Excel export Seq #
- **Rotation indicator:** groups whose placed dims differ from the carton's original dims get an instanced top-face `PlaneGeometry` in a lightened color (lerped 45% toward white)
- White merged edge outlines per group become visible once every instance in that group has landed

### Multi-Container UX
- Container list is set entirely by the optimizer result; user never manually adds/removes containers
- Clicking a container focuses the camera on it via a GSAP transition
- `containerFocusKey` increments on every `setActiveContainerIndex` call — enables re-clicking the same container to re-trigger camera zoom
- `prevFocusKeyRef` in `CameraController` guards Effect 2 — camera only zooms on explicit user click, not when the container list changes
- `ActivePalletPanel` (overlay, right of canvas) lists pallet segments in load order; the segment containing the current globalIndex glows in pallet color and clicking one jumps the timeline to its first carton. Segments are identified by `firstGI` (not `palletIndex`) so a pallet split across two containers highlights only the active segment
- `PlaybackControls` renders one colored checkpoint triangle per pallet segment under the scrub bar (click = jump)

### Code Quality
- TypeScript types for all domain objects: `Pallet`, `Carton`, `Container`, `Placement`, `PackingResult`
- Zustand is the single source of truth — no local state that duplicates store state
- Components are small and single-responsibility
- `// TODO:` comments mark known shortcuts

## Build & Run Commands

**Development (local, no Docker):**
```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend && npm install
npm run dev   # http://localhost:5173 — proxies /api → :8000
```

**Docker:**
```bash
docker-compose up --build
# Frontend → http://localhost:5173
# Backend  → http://localhost:8000
```

## Excel Import

`src/lib/excelImport.ts` — `parseExcel(file: File): Promise<Pallet[]>`

Reads the first sheet of an `.xlsx`, `.xls`, or `.csv` file using SheetJS. Required columns (matched case-insensitively):

| Column | Pattern | Notes |
|---|---|---|
| Pallet ID | `/pallet\s*id/i` | Groups rows into pallets |
| Product Code | `/product\s*(code\|name)?/i` | Becomes carton `id` + `label` |
| Qty To Pick | `/qty\s+to\s+pick/i` | Must be a positive integer; "to pick" required to avoid matching "Total Remain Qty" |
| Width | `/^width$/i` | Optional — falls back to 25 if absent or invalid |
| Height | `/^height$/i` | Optional — falls back to 25 if absent or invalid |
| Depth | `/^depth$/i` | Optional — falls back to 25 if absent or invalid |

Behaviour:
- Rows with blank Pallet ID, blank Product Code, or non-positive qty are silently skipped
- Same product appearing on multiple rows under the same pallet accumulates quantity
- `colorIndex` assigned in first-seen pallet order (stable within one import)
- Missing or required-column errors surface as a rejection message shown inline in the Sidebar
- Mock pallets in `palletSlice.ts` remain as the default initial state; import replaces them via `setPallets()`

Test sheets live in `Documents/Excel Sheet/3D Packing/` (01–10, covering happy path, missing dims, duplicate rows, mixed-case headers, invalid qty/dims, empty rows, extra columns, single pallet, large dataset).

## Excel Export

`src/lib/excelExport.ts` — `exportLoadPlan(packingResult, pallets, containers, totalCost, allPacked)`

Builds an `.xlsx` with SheetJS and downloads it as `load-plan-YYYY-MM-DD.xlsx`. Triggered by the "Export Load Plan" button in the Sidebar (visible only when a packing result exists). No backend involved — all data comes from the store.

- **Sheet 1 "Summary":** one row per container (label, carton count, utilization %) + totals (total cartons, total cost, all-packed Yes/No)
- **One sheet per container** (named `N - <label>`, sanitized to Excel's 31-char / no-special-chars rules): one row per placement — Seq #, Pallet, Product Code, X/Y/Z (cm, axis convention spelled out in headers), placed W/H/D, Rotated Yes/No
- **Seq # is global** — continues across containers and matches the numbers rendered on the boxes in 3D
- Rotation detection compares placed dims against the original carton dims from the pallets store, so exporting after re-importing a different sheet *without re-packing* produces stale labels/rotation flags

## Test Cases

`src/lib/testCases.ts` (data) + `src/components/ui/TestCasePanel.tsx` (UI)

The flask icon at the top-right of the Sidebar switches it to the test-case view (arrow-left returns to setup). Each of the 8 cases is a card with a description of the expected behaviour and its own **Pack** button, which calls `setPallets(tc.pallets)` then `runPacker()` — the normal pipeline runs unchanged, so numbering, ActivePalletPanel, and export all work on test results. Packing a test case **replaces** the current pallets in the store.

Coverage: baseline grid fill · pallet z-frontier separation · stacking OFF (single floor layer) · stacking ON/OFF A-B contrast · cross-pallet stacking via kept Above spaces (reproduces known too-deep issue) · forced rotation (280 cm box exceeds width+height) · rotation disabled (must pack as-is, no indicator) · overflow to a second container (global Seq # continuity).

## What needs to be fixed
1. When it comes to pallet-by-pallet packing, it's possible that theres space at the top that is free, but if its in too deep, then the next pallet's boxes will still take that space even though it's possible that it cannot be reached. (Test case 5 reproduces this.)
2. 40ft dimension mismatch: backend `optimizer.py` uses `1202 × 235 × 269` (high-cube) while `ContainerTypeSelector` display text and `mockPacker.ts` presets still use `1203 × 235 × 239` — align them on one truth.
3. Export Load Plan reads the *current* pallets store for pallet labels and rotation detection; re-importing a new sheet after packing (without re-packing) makes the export inconsistent with the rendered result.

## Refactor backlog (zero-logic-change documentation pass — completed 2026-06-11)

A cleanliness refactor (file docblocks, JSDoc/docstrings on exports, why-comments, magic numbers → named constants, **no behaviour changes**) is complete. `tsc -b` passes with zero errors.

**All files done:** `main.tsx`, `App.tsx`, all of `store/` (index + 5 slices), all of `lib/` (api, colors, animationState, excelImport, excelExport, testCases, mockPacker), all of `components/3d/` (Canvas, ContainerMesh, ContainerManager, CartonPreview, InstancedCartons), all of `components/ui/` (Sidebar, ContainerTypeSelector, PalletList, PalletRow, CartonEditDialog, PlaybackControls, ActivePalletPanel, UtilizationStats, TestCasePanel), all of `backend/` (main.py, schema.py, algorithms/common.py, optimizer.py, guillotine.py).

**One remaining item (cross-language — cannot share a module):**
- Topological sort logic is duplicated between `mockPacker.ts` (TypeScript) and `guillotine.py` (Python). No shared module is possible across languages.

## Potential Change
Right now, the right space of each z-frontier is being disregarded when a pallet is packed. This makes it such that when the next pallet comes in, that space is not considered
for packing. Will have to change that.
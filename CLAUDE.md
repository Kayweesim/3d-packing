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
│       │   │   ├── CartonPreview.tsx         # Mini R3F canvas — live 3D preview in CartonEditDialog
│       │   │   └── FreeSpaceCanvas.tsx       # Mini R3F canvas for the algorithm step visualizer
│       │   └── ui/
│       │       ├── Sidebar.tsx               # Left panel: setup view + test-case view (flask icon toggle)
│       │       ├── Section.tsx               # Labelled sidebar section wrapper (heading + optional right slot)
│       │       ├── AlgorithmVisualizer.tsx   # Overlay: step-through packing trace into single 20ft
│       │       ├── ContainerTypeSelector.tsx # Glow-toggle buttons for 20ft / 40ft
│       │       ├── ImportProductMaster.tsx   # Upload/auto-load product master → store (dims + flags lookup)
│       │       ├── ImportDataButton.tsx      # Excel manifest import → setPallets; restores plan settings
│       │       ├── AddPalletDialog.tsx       # Modal: create a pallet + cartons manually
│       │       ├── PalletList.tsx            # Renders PalletRow for each pallet; empty state
│       │       ├── PalletRow.tsx             # Accordion row + Rotate/Stack badges per carton
│       │       ├── CartonEditDialog.tsx      # Edit carton dims/qty/rotation/stacking; live CartonPreview
│       │       ├── UtilizationStats.tsx      # Per-container utilization bar + per-pallet product counts
│       │       ├── PlaybackControls.tsx      # Play/pause/scrub/speed + pallet checkpoint markers
│       │       ├── ActivePalletPanel.tsx     # Canvas overlay: live pallet tracking, click-to-jump
│       │       ├── PackingProgressModal.tsx  # SSE-driven progress overlay for slow packs (delayed show)
│       │       └── TestCasePanel.tsx         # Preloaded test cases, each with its own Pack button
│       ├── store/
│       │   ├── index.ts                      # Zustand store combining all slices
│       │   ├── containerSlice.ts             # availableTypes, containers, containerFocusKey
│       │   ├── cartonSlice.ts                # Carton type + CARTON_DEFAULTS (type-only slice)
│       │   ├── palletSlice.ts                # pallets[], setPallets, removePallet, updatePalletCarton, importFileName
│       │   ├── packingSlice.ts               # runPacker, packingResult, palletBoundaries, totalPackedCount, packingProgress
│       │   └── uiSlice.ts                    # sidebarOpen, darkMode, playing, speed, progress, algo, dimensionBuffer, lashing, visualizerOpen
│       └── lib/
│           ├── api.ts                        # POST /api/optimize/stream (SSE progress) + /api/trace; boxId→cartonId mapping; PackError
│           ├── colors.ts                     # 16-color deterministic palette (index-based)
│           ├── cartonShapes.ts               # Shared Three.js helpers: buildArrowGeo, lightenColor
│           ├── animationState.ts             # Module-level GSAP timeline ref (canvas ↔ sidebar)
│           ├── excelImport.ts                # parseExcel() — SheetJS parser, returns Pallet[]
│           ├── excelExport.ts                # exportLoadPlan() — Summary + re-importable pick-list sheet
│           ├── exportFolder.ts               # File System Access API: pick/persist export folder (Chrome/Edge)
│           ├── loadSlicesExport.ts           # exportLoadSlices() — HTML with inline SVG cross-sections per z-slice
│           ├── productMaster.ts              # parseProductMaster() — item code → {w,h,d} lookup map
│           ├── testCases.ts                  # 8 preloaded packing-logic test cases
│           └── mockPacker.ts                 # Offline shelf packer (USE_MOCK_PACKER fallback)
└── backend/
    ├── main.py                               # FastAPI app, CORS localhost:5173, /health, /api/trace, /api/keepalive (exe self-exit watchdog)
    ├── schema.py                             # Pydantic: OptimizeRequest/Response, TraceRequest, BoxIn, PlacementOut
    ├── requirements.txt                      # fastapi, uvicorn[standard]
    └── packing_algos/                        # Packing subsystem (root = algorithm-agnostic infrastructure)
        ├── optimizer.py                      # Cost-minimizing combo search + volume pre-check
        ├── scorer.py                         # Voxel-based fragmentation diagnostic (gap + trapped pockets)
        ├── registry.py                       # Algorithm key → packer function registry (only "algo1")
        └── algo_v1/                          # The production algorithm (registry key "algo1")
            ├── __init__.py                   # Re-exports: run_algo1, build_groups, pack_into_containers
            ├── ordering.py                   # Size-first ordering layer (run_algo1, best_ordering)
            ├── engine.py                     # Placement loop, multi-container orchestration, flat + staircase re-pack
            ├── helper.py                     # _Space, coalescing, support/reachability checks, scorer, topo sort
            ├── common.py                     # gravity_settle, overlaps_3d, get_orientations
            ├── trace.py                      # Step-by-step trace for the algorithm visualizer
            └── test_characterize.py          # Snapshot harness (+ _baseline.json), pins exact placements
```

## Conventions & Standards

### Domain Model
The packing unit is a **carton** (a product box with W×H×D). Cartons are grouped into **pallets** (a logical shipment unit with an ID). A pallet contains one or more carton types.

```
Pallet  { id, label, cartons: Carton[] }
Carton  { id, label, productCode?, w, h, d, quantity, rotationAllowed, stacking }
```

`Carton` is defined in `cartonSlice.ts` and is the single type used everywhere — `palletSlice.Pallet.cartons` is `Carton[]`, and `packingSlice.runPacker` flattens pallets into carton instances. `id` must stay globally unique (`${palletId}-${product}` on import) because it keys the cartonId→pallet maps downstream; `productCode` carries the clean product code for display and product-based coloring.

### Axis Convention
- `w` = X (cross-section width, 235 cm for both container types)
- `h` = Y (height, 239 cm)
- `d` = Z (depth/length; `z=0` = back wall, `z=d` = door)
- World X: containers placed side-by-side with 100 cm gap (`CONTAINER_GAP_CM`)

### Container Presets
Backend `optimizer.py::_TYPES` is the source of truth:
- **20ft TEU:** `d=589, w=235, h=239` — cost 1.0
- **40ft FEU:** `d=1202, w=235, h=269` — cost 1.5

⚠️ Known cosmetic drift: `ContainerTypeSelector` shows `1203 × 235 × 269` and `mockPacker.ts` uses `1203 × 235 × 239` for the 40ft — the backend's `1202 × 235 × 269` is authoritative (display/mock only, doesn't affect real packing).

### Optimizer (`POST /api/optimize`, `POST /api/optimize/stream`)
Generates all `(n20, n40)` combos under `MAX_COST = 10`, sorted by `(cost, total, n20)`. Volume pre-check skips impossible combos. Runs the selected packer on each until `all_packed=True`; returns first success, else the partial attempt that placed the most cartons.

The frontend calls the `/stream` variant: same optimization, but emits Server-Sent Events with live progress (`{placed, total, pct}` — placement 0–82%, flat/staircase re-pack probes 83–96%, finalise 97%) that drive `packingProgress` and the `PackingProgressModal`; the final result arrives as the last event.

The packing algorithm is chosen by the request's `algorithm` field (default `"algo1"`) and resolved through `packing_algos/registry.py::REGISTRY` (`PackerFn = (containers, boxes) -> list[ContainerResult]`). An unknown key returns HTTP 400. Adding an algorithm = implement a `run_*` function with that signature, import it in the registry, add one `REGISTRY` entry — the endpoint, optimizer, and frontend need no other changes. Frontend: the selected `AlgoId` (`uiSlice.algo`, only member `algo1`) flows through `runPacker` → `api.ts::apiOptimize` → the request body. The legacy `guillotine` packer (volume-desc single pass) was removed 2026-07 — sending `"algorithm": "guillotine"` now returns 400; it lives in git history if ever needed.

The single registered packer:
- **`algo1`** — size-first: one deterministic ordering — biggest pallets first (dominant-carton volume, then total pallet volume), biggest cartons first within each pallet, front cut. Same-product pallets always load as one consecutive block (`_group_like_products`), and pallets containing non-stackable cartons go last (by the door). The menu/best-of machinery (`_STRATEGIES`, `best_ordering`, `_objective`) is retained from the earlier multi-start design so extra strategies can be re-added as menu entries; the removed strategies (height/depth/footprint keys, width-fit and stand-tall orientation transforms, "above" cut) live in git history prior to 2026-07. `algo_v1/ordering.py::run_algo1`.

The engine is parametrized by a `PlacementScore` (`algo_v1/helper.py`) and exposes reusable `build_groups()` + `pack_into_containers()` so new algorithms compose rather than duplicate the placement machinery.

### Guillotine Cut Orders
Two cut orders control how a placement splits its free space:
- **`"front"`** (default) — Front inherits the full height + width of the parent space, giving later/larger cartons a clear front lane. Above is the carton footprint only.
- **`"above"`** — Above inherits the full width + depth of the parent (one contiguous stacking slab), so stacked cartons flush to the back. Front/Right are capped at the carton height. Best for stacking-heavy loads.

### Packing Algorithm — Guillotine Engine
The engine (`algo_v1/engine.py` + `algo_v1/helper.py`) maintains a list of free rectangular cuboids. The container starts as one free space equal to its full interior. Carton instances are ordered by pallet group (colorIndex ascending) with volume-descending sort within each group. For each carton the algorithm tries every (free space, orientation) pair, scores candidates by `(pz, py, px)` — depth-first so each z-slice fills completely before advancing toward the door — and rejects candidates that:
1. **Float** — the support check (`_is_fully_supported`) requires at least `_SUPPORT_RATIO` (50%) of the carton's bottom face to be covered by coplanar tops below it. `_SUPPORT_RATIO < 1` lets rigid cartons bridge small gaps for denser packing.
2. **Are unreachable** — `_is_reachable` checks two blockers: (a) a placed carton in the same Z-lane (X overlap) that is not entirely above the candidate — a wall in its height band OR lower floor/step cargo — whose front face is more than `REACH_LIMIT_CM` (50 cm) ahead of the candidate (reaching over low cargo is only plausible within arm's reach; this stops later pallets landing on top of an already-built ridge behind lower rows), and (b) the candidate is far behind the overall load front AND the free lane is narrower than `AISLE_MIN_CM` (50 cm), so no worker could walk down to place it.

The winning placement splits its host space into three non-overlapping sub-spaces using a guillotine cut (see "Guillotine Cut Orders" above). Before each new pallet group packs, the free-space list is **coalesced** (`_merge_spaces`): any two spaces sharing a full face and abutting are fused into their union, defragmenting the per-column gaps a finished pallet leaves behind so the next pallet packs at its own pitch instead of inheriting the previous pallet's grid. Finally, placements are reordered by Kahn's topological BFS — the support graph has an edge j→i wherever carton j's top face directly underlies carton i's bottom face — with BFS frontier tie-breaking by `(seq_rank, centre_z, y, x)`, guaranteeing every carton from pallet N animates before any carton from pallet N+1, and within each pallet cartons animate back-to-front then bottom-up. `seq_rank` decouples pallet colour/identity (colorIndex) from load order, so algo1's reordered groups animate in their chosen sequence. Overflow cartons are grouped by `colorIndex` and forwarded to the next container.

**Flat last-container re-pack + staircase front:** When `lashing=False` (default), the last loaded container is re-packed in two phases. Phase 1 (`_flat_repack_search`) finds the shortest uniform height cap (whole layers, gallop + binary search seeded from the observed load height) that still places every carton, keeping a partial load low and spread-forward. Phase 2 (`_staircase_repack_search`) keeps that cap H* and searches for the earliest plateau end `z_p` such that packing under a descending ceiling (`_StairCeiling`: full H* behind `z_p`, dropping one layer per `step` toward the door, floored at one layer; `step` = the layer-defining carton's deepest flat footprint dim) still fits everything — so the load front tapers down like a staircase instead of ending in a vertical cliff. The envelope is a placement *constraint* (a candidate whose top would poke above `ceiling(front edge)` is rejected in `_find_best_placement`), not a post-hoc reshape, so it composes with mixed sizes, rotation, and stacking rules for free; worst case `z_p` lands at the door and the result equals the plain flat cap (guaranteed no worse). When `lashing=True`, the load is secured, so tall depth-first stacking is kept everywhere and both phases are skipped.

Per-carton constraints (both flow from `BoxIn` through every instance dict):
- **`rotationAllowed=False`** → `get_orientations` returns only the original `(w, h, d)`; otherwise all 6 axis permutations (deduplicated, so boxes with equal dims yield 3 or 1 unique orientations).
- **`stacking=False`** → `_is_fully_supported` rejects any candidate resting on that carton, so nothing is ever placed on top of a non-stackable carton (the carton itself may still be placed on top of stackable ones).

### 3D Rendering
- Containers: transparent wireframes only (`EdgesGeometry` + `lineBasicMaterial`)
- Cartons: **must use `InstancedMesh`** — non-negotiable for 60fps at scale; one mesh per `cartonId + placed-dims` group
- Carton colors: **product-based**, never random — `colors.ts::buildProductColorMap` assigns each unique product name (`productCode ?? label`) a palette color in first-seen order, so cartons of the same product share a color across pallets; 16-color deterministic palette underneath
- Animation: GSAP timeline (0.4s per carton), cartons slide in one-by-one from outside the door (entry Z = `containerLength + 50`)
- `timelineRef` lives in `animationState.ts` (module-level, not a React ref) so `PlaybackControls` and `InstancedCartons` share the same timeline without prop-drilling
- **Sequence numbers:** every carton renders its load order (`globalIndex + 1`) as a flat drei `<Text>` on its top face; the label appears the moment the carton lands (`progress >= gi + 1`). Global across containers and matches the Excel export Seq #
- **Pallet ID label:** each carton also renders its pallet ID as a drei `<Text>` at the top-right (back-right) corner of its top face, visible once the carton lands — so pallet membership stays readable even though colors follow products
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

**Packaged executable (Windows):**
```bat
build-exe.bat    # repo root → backend\dist\main.exe (~38 MB, self-contained)
```
Runs three steps and stops on first error: `npm run build` → refresh `backend\frontend_dist` (the folder `main.spec` embeds — skip this and the exe ships a stale UI) → `python -m PyInstaller main.spec` (kills any running `main.exe` first, since a live process locks the output file). The exe serves API + UI on `http://127.0.0.1:8000`, auto-opens the browser, and is windowed (`console=False` — `main.py` guards `sys.stdout=None` and passes `log_config=None` to uvicorn or logging setup crashes). **Lifecycle:** each app tab holds an SSE connection to `/api/keepalive`; a watchdog thread (started only when `sys.frozen`) exits the process once no tab has been open for 15 s (120 s startup grace) — closing the browser stops the exe. Dev servers never self-terminate. Dev note: because the keep-alive stream reconnects instantly, use `--timeout-graceful-shutdown 3` with `uvicorn --reload` or reloads can hang the port (502s).

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
- Our own exported plans round-trip extra state: Rotation/Stacking columns (Yes/No, per carton), and the pack settings (Dimension Buffer %, Lashing) read from label/value rows on the plan's "Summary" sheet — `parseExcel` returns them in `settings` and ImportDataButton restores the Sidebar toggles; plain pick lists (no Summary sheet) leave the toggles untouched

Test sheets live in `Documents/Excel Sheet/3D Packing/` (01–10, covering happy path, missing dims, duplicate rows, mixed-case headers, invalid qty/dims, empty rows, extra columns, single pallet, large dataset).

## Excel Export

`src/lib/excelExport.ts` — `exportLoadPlan(packingResult, pallets, containers, totalCost, allPacked, importFileName, folder)`

Builds an `.xlsx` with SheetJS. Filename: `YYYY-MM-DD-HHmm-<imported-manifest-name>.xlsx` (leading/trailing stamps stripped from the import name so re-exports don't stack). Triggered by the "Export Load Plan" button in the Sidebar (visible only when a packing result exists). No backend involved — all data comes from the store.

- **Sheet 1 "Summary":** one row per container (label, carton count, utilization %) + totals (containers used, total cartons, total cost, all-packed Yes/No, export date) + the pack settings as label/value rows (Dimension Buffer %, Lashing) so re-import restores the Sidebar toggles
- **Sheet 2 "COPY EXCEL PICK LIST HERE":** one row per pallet × carton type — Pallet ID, Product Code, Width/Height/Depth, Qty to Pick, Packed Qty, Container assignment, Rotation, Stacking. Sheet name + headers deliberately match `excelImport.ts::parseExcel`'s regexes so an exported load plan can be re-imported as a manifest (round-trip).
- **Export destination:** `src/lib/exportFolder.ts` wraps the File System Access API (Chrome/Edge). The Sidebar's "Choose export folder…" button picks a directory (e.g. a OneDrive-synced one — the sync client uploads it); the `FileSystemDirectoryHandle` is persisted in IndexedDB and restored across sessions, with write permission re-confirmed inside the Export click gesture. No folder picked / unsupported browser (Firefox/Safari) → normal browser download.

## Test Cases

`src/lib/testCases.ts` (data) + `src/components/ui/TestCasePanel.tsx` (UI)

The flask icon at the top-right of the Sidebar switches it to the test-case view (arrow-left returns to setup). Each of the 8 cases is a card with a description of the expected behaviour and its own **Pack** button, which calls `setPallets(tc.pallets)` then `runPacker()` — the normal pipeline runs unchanged, so numbering, ActivePalletPanel, and export all work on test results. Packing a test case **replaces** the current pallets in the store.

Coverage: baseline grid fill · pallet z-frontier separation · stacking OFF (single floor layer) · stacking ON/OFF A-B contrast · cross-pallet stacking via kept Above spaces (reproduces known too-deep issue) · forced rotation (280 cm box exceeds width+height) · rotation disabled (must pack as-is, no indicator) · overflow to a second container (global Seq # continuity).

## Product Master

`src/lib/productMaster.ts` — `parseProductMaster(source: File | ArrayBuffer): Promise<ProductMasterMap>`

Parses a product master Excel into a `Map<string, { w, h, d, rotationAllowed, stacking }>` (item code → dimensions in cm + per-product flags; Rotation/Stacking are optional Yes/No columns defaulting to true). Column patterns: `item code | product code | sku` for the key, `width`, `height`, `length` for dims. The bundled default (`frontend/public/product-master.xlsx`) is **auto-loaded on first mount** by `ImportProductMaster` — as if "Use Default" was clicked — so dims are right with zero clicks; uploading a file replaces it, and an already-loaded master is never overwritten by the auto-load. Applied to already-loaded pallets so import order doesn't matter (lookup key = carton `label`). Cartons not in the master keep their sheet/fallback dims.

## Dimension Buffer

A percentage (0–15%) stored in `uiSlice.dimensionBuffer`. Applied as `scale = 1 + dimensionBuffer / 100` to w/h/d in `packingSlice.runPacker` before sending to the API. The stored carton dims are never mutated — only the API payload is scaled. The Sidebar toggle switches between 0% and 5% (5% linear ≈ +16% volume covers carton bulge/strapping/measurement error; the buffer compounds cubically, which is why the old 15% default — +52% volume — was replaced). Values other than 5 can still arrive via a re-imported plan's Summary settings; the toggle shows "on" for any buffer > 0 and displays the actual %. `PalletRow` shows buffered dims alongside original dims when buffer > 0.

## Lashing

A boolean toggle in `uiSlice.lashing`. When `true`, the optimizer passes `lashing=True` to the packer, which skips the flat last-container re-pack — the load is assumed to be secured by lashing, so tall depth-first stacking is acceptable. The Sidebar renders it as a toggle switch with a link icon.

## Load Slices Export

`src/lib/loadSlicesExport.ts` — `exportLoadSlices(packingResult, pallets, containers)`

Builds a self-contained HTML document with inline SVG cross-sections (front elevations, X across, Y up), one per depth slice. Slices are derived from the load's natural z-layers (cartons cluster at discrete back-face planes, tolerance `SLICE_Z_TOL = 1.0 cm`). Each carton is a true-scale colored rectangle with hover tooltip (Seq #, product, dims, z-range). Legend shows pallets by color. Downloads as `load-slices-YYYY-MM-DD.html`.

## Algorithm Visualizer

`src/components/ui/AlgorithmVisualizer.tsx` + `src/components/3d/FreeSpaceCanvas.tsx` + `backend/packing_algos/algo_v1/trace.py`

Opened by the book icon in the Sidebar. Traces the current pallets into a single 20ft container via `POST /api/trace` and lets the user step through each placement — seeing the carton, its priority score, and how the free space was split into Front/Right/Above sub-spaces. Uses algo1's winning strategy ordering from `best_ordering`, so the trace mirrors production. Keyboard nav: Esc closes, ←/→ steps. The `lashing` flag mirrors production: when False the trace applies the flat cap + staircase envelope, sharing `_flat_repack_search` / `_staircase_repack_search` with the engine so the trace always matches what actually gets packed.

## Scorer (Diagnostic)

`backend/packing_algos/scorer.py` — `print_fragmentation(containers_used, containers, header)`

Not part of the packing logic — a console diagnostic that voxelizes each container (10 cm cells) and measures:
- **Internal gap**: empty cells inside the load's bounding box (air trapped between cartons). Reported as volume (m³) and % of envelope, plus pocket count.
- **Sealed/trapped**: empty cells not reachable from the door plane via BFS flood-fill. Physically inaccessible space.

Called automatically by the optimizer after each fully-packed result to print a one-line fragmentation summary.

## Refactor backlog (zero-logic-change documentation pass — completed 2026-06-11)

A cleanliness refactor (file docblocks, JSDoc/docstrings on exports, why-comments, magic numbers → named constants, **no behaviour changes**) is complete. `tsc -b` passes with zero errors.

**All files done:** `main.tsx`, `App.tsx`, all of `store/` (index + 5 slices), all of `lib/` (api, colors, animationState, excelImport, excelExport, loadSlicesExport, productMaster, testCases, mockPacker), all of `components/3d/` (Canvas, ContainerMesh, ContainerManager, CartonPreview, FreeSpaceCanvas, InstancedCartons), all of `components/ui/` (Sidebar, ContainerTypeSelector, PalletList, PalletRow, CartonEditDialog, PlaybackControls, ActivePalletPanel, UtilizationStats, TestCasePanel, AlgorithmVisualizer), all of `backend/` (main.py, schema.py, and the whole packing package — since renamed `algorithms/` → `packing_algos/` with the engine under `algo_v1/`, 2026-07).

### Next Session Start Point
All 9 phases complete. MVP is fully wired end-to-end. Next work is feature iteration or productionisation (auth, billing, deployment, etc.).
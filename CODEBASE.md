# Codebase Walkthrough

A brief tour of every part of the app. For conventions, domain rules, and deeper algorithm docs see [CLAUDE.md](./CLAUDE.md).

## The Big Picture

1. The product master (`frontend/public/product-master.xlsx`) auto-loads on startup → item code → dims/flags lookup. User imports an Excel pick list (or uses mock pallets / preloaded test cases) → `pallets[]` in the Zustand store; master dims are applied by product code.
2. **Pack** → `runPacker()` flattens pallets into carton instances (scaled by the dimension buffer if on) and POSTs them to `/api/optimize/stream`; SSE progress events drive the `PackingProgressModal` while the optimizer works.
3. `optimizer.py` tries container combinations cheapest-first; each combo is packed by the algorithm chosen in the request (`registry.py`: only `algo1`); the first fully-packed combo wins.
4. When `lashing` is off, the last loaded container gets a two-phase re-pack: shortest flat height cap, then a descending staircase envelope so the load front tapers instead of ending in a cliff.
5. The response carries per-container placements (already topologically sorted into animation order), containers used, cost, and summary. `runPacker` stores it and derives `palletBoundaries` — contiguous global-index ranges per pallet used by all tracking UI.
6. `InstancedCartons` builds instanced meshes and a GSAP timeline; cartons fly in one-by-one through the container door, colored by product, labelled with sequence number + pallet ID.
7. `PlaybackControls` and `ActivePalletPanel` scrub/track that same timeline through the shared module-level `timelineRef`.
8. **Export Load Plan** writes a re-importable `.xlsx` (Summary + pick-list sheet) — into a picked OneDrive-synced folder (File System Access API) or as a browser download. **Export Load Slices** writes an HTML of per-depth SVG cross-sections.
9. The whole app ships as one PyInstaller exe (`build-exe.bat` → `backend/dist/main.exe`) that serves the built UI, opens the browser, and exits itself when the last tab closes.

---

## Backend (`backend/`) — Python + FastAPI

| File | What it does |
|---|---|
| `main.py` | FastAPI app. CORS for `localhost:5173`; `GET /health`; `POST /api/optimize` (+ `/stream` SSE variant with live progress bands: placement 0–82%, re-pack probes 83–96%, finalise 97%); `POST /api/trace` for the visualizer; `GET /api/keepalive` — SSE stream each app tab holds open, watched by the frozen exe's self-exit watchdog. Serves `frontend_dist` at `/` (PyInstaller `_MEIPASS`-aware). |
| `schema.py` | Pydantic models. Inbound: `BoxIn` (dims, qty, `colorIndex`, `rotationAllowed`, `stacking`), `OptimizeRequest` (boxes, container types, `algorithm`, `lashing`), `TraceRequest`. Outbound: `PlacementOut`, `ContainerResult` (placements, utilization, `flatApplied`), `OptimizeResponse`. |
| `main.spec` | PyInstaller onefile spec — embeds `frontend_dist`, `console=False`. |

### `packing_algos/`

Package root = algorithm-agnostic infrastructure; `algo_v1/` = the production algorithm (registry key `algo1`).

- **`optimizer.py`** — container selection. Two presets (20ft: 589×235×239 @ cost 1.0; 40ft: 1202×235×269 @ cost 1.5). Generates every `(n20, n40)` combo under `MAX_COST = 10` sorted by `(cost, total, n20)`, volume-pre-checks, packs each with the selected packer until one places every box; otherwise returns the attempt that placed the most. Prints a fragmentation summary via `scorer.py` after full packs.
- **`registry.py`** — algorithm key → packer function (only `algo1`). Adding an algorithm is one `run_*` function + one entry. The legacy `guillotine` packer (volume-desc single pass) was removed 2026-07; git history has it.
- **`scorer.py`** — voxel-based fragmentation diagnostic (internal gap %, sealed pockets); console-only.
- **`algo_v1/`** — the packing algorithm as a package:
  - `ordering.py` — the size-first ordering layer and public entry point `run_algo1`: biggest pallets first (dominant-carton volume), biggest cartons first within each, same-product pallets kept contiguous, non-stackable pallets last (by the door). Single-entry strategy menu; the multi-start machinery (`best_ordering`) remains for re-adding strategies.
  - `helper.py` — building blocks: `_Space` free-cuboid model, guillotine `split_space` (Front/Right/Above, "front" or "above" cut order), `_is_fully_supported` (≥90% base coverage, nothing on `stacking=False`), `_is_reachable` (blocks spots more than 50 cm behind same-lane walls *or* lower cargo — a loader can't reach over a built ridge — plus the narrow-aisle rule), the depth-first scorer `(pz, py, px)`, free-space coalescing `_merge_spaces` (runs between pallets), and the topological animation-order sort.
  - `engine.py` — the placement loop (`_pack_group`: every space × every allowed orientation per carton, best score wins), per-container multi-pallet loop, `build_groups` instance expansion, multi-container orchestration with overflow forwarding, and the last-container finisher: `_flat_repack_search` (gallop + binary search for the shortest whole-layer height cap) then `_staircase_repack_search` (keeps cap H\*, searches the earliest stair-plateau end so the load front descends one layer per step via the `_StairCeiling` envelope — a placement constraint, not a reshape; worst case equals the flat cap). `lashing=True` skips both.
  - `common.py` — `get_orientations` (6 permutations, deduped; original only when rotation disallowed), `gravity_settle`, `overlaps_3d`.
  - `trace.py` — re-runs a pack recording every placement + free-space split for the step visualizer; mirrors production exactly (same ordering, flat cap + staircase envelope).
  - `test_characterize.py` + `_baseline.json` — snapshot harness pinning exact placements for 7 scenarios (incl. `staircase`); run `python -m packing_algos.algo_v1.test_characterize` (`--freeze` to re-pin after intended changes).

---

## Frontend (`frontend/src/`)

### Entry
- **`main.tsx`** — React 19 `createRoot` + StrictMode; opens the `/api/keepalive` EventSource (lets the packaged exe detect "all tabs closed").
- **`App.tsx`** — root layout: collapsible sidebar left, `SceneCanvas` + `ActivePalletPanel` overlay right; dark-mode class on `<html>`.

### State (`store/`) — one combined Zustand store
- **`containerSlice.ts`** — `availableTypes` (20ft/40ft toggles), `containers` (written *only* from the optimizer result), `activeContainerIndex` + `containerFocusKey` (camera focus; key increments per click so re-clicking re-zooms).
- **`cartonSlice.ts`** — the `Carton` type (`id` globally unique; `productCode` for display/coloring) + `CARTON_DEFAULTS`; type-only slice.
- **`palletSlice.ts`** — `pallets[]` (mock-seeded), `setPallets` (also clears `importFileName`), `removePallet`, `updatePalletCarton`, `importFileName` (drives the export filename + "Uploaded successfully" feedback).
- **`packingSlice.ts`** — `runPacker()` (flatten → apply dimension buffer → SSE call → store result), result state, `palletBoundaries`, `totalPackedCount`, `packingProgress` (0–100 for the modal).
- **`uiSlice.ts`** — sidebar/dark mode/playback (`playing`, `speed`, `progress`), `algo` (only `algo1`), `dimensionBuffer` (0–15%, toggle = 0↔5), `lashing`, `visualizerOpen`.

### Lib (`lib/`)
- **`api.ts`** — `apiOptimize` consumes the `/api/optimize/stream` SSE (progress callback + final result), `apiTrace`; maps backend `boxId` → frontend `cartonId` at the boundary; `PackError`.
- **`excelImport.ts`** — `parseExcel(file)` → `{ pallets, settings }`. Targets the "COPY EXCEL PICK LIST HERE" sheet (falls back to first), case-insensitive header regexes, accumulates duplicate products, unique carton ids (`palletId-product`), optional Rotation/Stacking columns; `settings` (Dimension Buffer %, Lashing) read from an exported plan's Summary sheet — null for plain pick lists.
- **`excelExport.ts`** — `exportLoadPlan()`: Summary sheet (per-container stats, totals, pack settings as label/value rows) + a pick-list sheet whose name/headers match the import regexes (full round-trip). Filename `YYYY-MM-DD-HHmm-<import-name>.xlsx` with old stamps stripped. Writes into the picked folder or falls back to browser download.
- **`exportFolder.ts`** — File System Access API wrapper (Chrome/Edge): native folder picker, handle persisted in IndexedDB, write-permission re-confirmation inside the Export click, `writeToFolder`.
- **`loadSlicesExport.ts`** — self-contained HTML of true-scale SVG front elevations per natural z-slice, hover tooltips, product legend.
- **`productMaster.ts`** — product master parser → `Map<code, {w,h,d,rotationAllowed,stacking}>`.
- **`colors.ts`** — 16-color palette; `buildProductColorMap` gives every unique product a color in first-seen order (same product = same color across pallets).
- **`testCases.ts`** — 8 preloaded packing-logic test cases.
- **`animationState.ts`** — module-level `timelineRef` shared by canvas + sidebar.
- **`cartonShapes.ts`** — shared Three.js helpers (arrow geometry, lightenColor).
- **`mockPacker.ts`** — offline shelf packer behind `USE_MOCK_PACKER` (backend-down fallback).

### 3D (`components/3d/`)
- **`Canvas.tsx`** — R3F canvas, lights, OrbitControls; `CameraController` fits all containers on list change and GSAP-zooms to a clicked one (guarded by `prevFocusKeyRef`).
- **`ContainerManager.tsx`** — containers side-by-side with a 100 cm gap; `buildContainerWorldMap` shared with `InstancedCartons`.
- **`ContainerMesh.tsx`** — wireframe container + doors hinged open at 75°.
- **`InstancedCartons.tsx`** — the heart of the visualization: one `InstancedMesh` per `cartonId + placed-dims` group; one GSAP tween drives `progress` 0 → N (0.4 s per carton, entry Z = container length + 50); per carton a sequence number and a pallet-ID label on the top face appear as it lands; rotated groups get a lightened top-face plane; merged white edge outlines appear per fully-landed group.
- **`CartonPreview.tsx`** — mini auto-rotating canvas in the edit dialog with W/H/D axis arrows.
- **`FreeSpaceCanvas.tsx`** — mini canvas for the algorithm visualizer (placed boxes + free-space wireframes per step).

### UI (`components/ui/`)
- **`Sidebar.tsx`** — two views. *Setup:* algorithm button (algo1) → visualizer/test-case icons → container types → product master → Excel import → dimension-buffer + lashing toggles → pallet list (search, Add Pallet) → Pack → result summary → export folder picker + Export Load Plan → Export Load Slices → utilization → playback. *Tests:* TestCasePanel via the flask icon.
- **`Section.tsx`** — labelled section wrapper (uppercase heading + optional right slot).
- **`ImportProductMaster.tsx`** — upload/drag a master or auto-load the bundled default on first mount; green "Loaded:" feedback.
- **`ImportDataButton.tsx`** — manifest import (upload/drag); applies master dims; restores plan settings (buffer/lashing) from re-imported exports; green "Uploaded successfully:" feedback.
- **`AddPalletDialog.tsx`** — modal creating a pallet with one or more cartons manually.
- **`PalletList.tsx` / `PalletRow.tsx`** — accordion per pallet: color chip, dims (buffered dims shown alongside when buffer > 0), qty, Rotate/Stack badges, edit pencil.
- **`CartonEditDialog.tsx`** — edit label/dims/qty/rotation/stacking with live `CartonPreview`.
- **`ContainerTypeSelector.tsx`** — glow-toggle cards for 20ft/40ft.
- **`UtilizationStats.tsx`** — per-container utilization bar + per-pallet product-code counts; highlights the focused container.
- **`PlaybackControls.tsx`** — play/pause/replay, speed, scrub slider, colored checkpoint triangle per pallet segment.
- **`ActivePalletPanel.tsx`** — overlay listing pallet segments (with product codes) in load order; active segment glows; click jumps the timeline. Keyed by `firstGI` so a pallet split across containers highlights only its active segment.
- **`PackingProgressModal.tsx`** — appears only after a delay of continuous loading; real SSE progress with phase illustrations; holds at 100% briefly on completion.
- **`AlgorithmVisualizer.tsx`** — book-icon overlay: steps through the trace (carton, score, chosen space, Front/Right/Above split) on a `FreeSpaceCanvas`; ←/→ to step, Esc to close.
- **`TestCasePanel.tsx`** — one card per test case with its own Pack button.

---

## How the animation clock works

Everything shares one number: `progress`, driven 0 → N (total cartons) by a single GSAP tween. Carton `i` is invisible while `progress ≤ i`, slides in eased while `i < progress < i+1`, and sits placed once `progress ≥ i+1`. Edge outlines, sequence + pallet labels, and rotation planes all key off the same comparison inside `useFrame`. The store's `progress` (0–1) is `tl.progress()` mirrored for the UI; every "jump to X" feature is `tl.progress(fraction)`.

## Repo root

- **`build-exe.bat`** — one-shot packaging: frontend build → refresh `backend/frontend_dist` → PyInstaller → `backend/dist/main.exe` (kills a running exe first; stops on first error).
- **`start.bat`** — dev convenience: launches Vite + uvicorn and opens the browser.
- **`docker-compose.yml`** — frontend (5173) + backend (8000) services.
- **`scripts/generate-test-sheets.mjs`** — generates the 10 Excel import test sheets.
- **`CLAUDE.md`** — project conventions + algorithm reference (the deep docs).

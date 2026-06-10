# Codebase Walkthrough

A brief tour of every part of the app. For conventions, domain rules, and deeper algorithm docs see [CLAUDE.md](./CLAUDE.md).

## The Big Picture

1. User imports an Excel manifest (or uses the mock pallets / preloaded test cases) → `pallets[]` in the Zustand store.
2. **Pack** → `runPacker()` flattens pallets into carton instances (`colorIndex = palletIndex`) and POSTs them to `/api/optimize/guillotine` (Vite dev server proxies `/api` → `localhost:8000`).
3. `optimizer.py` tries container combinations cheapest-first; each combo is packed by `guillotine.py`; the first fully-packed combo wins.
4. The response carries per-container placements (already sorted in animation order), the containers used, cost, and summary.
5. `runPacker` stores the result and derives `palletBoundaries` — contiguous global-index ranges per pallet, used by all tracking UI.
6. `InstancedCartons` builds instanced meshes and a GSAP timeline; cartons fly in one-by-one through the container door.
7. `PlaybackControls` and `ActivePalletPanel` scrub/track that same timeline through the shared module-level `timelineRef`.
8. **Export Load Plan** writes the placements back out as a multi-sheet `.xlsx`.

---

## Backend (`backend/`) — Python + FastAPI

| File | What it does |
|---|---|
| `main.py` | FastAPI app. CORS for `localhost:5173`, `GET /health` probe, `POST /api/optimize/guillotine` → `run_optimizer`. |
| `schema.py` | Pydantic models. Inbound: `BoxIn` (dims, qty, `colorIndex`, `rotationAllowed`, `stacking`), `OptimizeRequest`. Outbound: `PlacementOut` (boxId, x/y/z, placed w/h/d), `ContainerResult`, `OptimizeResponse` (+ `containers_used` so the frontend can render without knowing presets). |

### `algorithms/optimizer.py` — container selection
Defines the two container types (20ft: 235×239×589 @ cost 1.0; 40ft: 235×269×1202 @ cost 1.5). Generates every `(n20, n40)` combo under `MAX_COST = 10`, sorted by `(cost, container count, n20)`. A volume pre-check skips combos that can't possibly fit. Each surviving combo is packed with `run_guillotine`; the first one that places every box is returned, otherwise the partial attempt with the most placements.

### `algorithms/guillotine.py` — the packer
- **`_Space`** — a free rectangular cuboid. The container starts as one space; spaces never overlap in XZ (this is what makes gravity cheap and correct).
- **`_pack_group`** — packs one pallet: for each carton instance, tries every (space × orientation) pair, settles Y by gravity, requires full bottom-face support, scores candidates `(z, y, x)` (depth-first: fill a z-slice completely before moving toward the door). The winning space is split **Front-first** into three children: Front (full parent width — keeps wide zones for later pallets), Right-in-back (same z-slice), Above (enables stacking).
- **`_pack_container`** — runs pallet groups in order. After each group, computes the z-frontier (`max(z+d)`), discards floor-level leftovers behind it (no side-by-side pallet mixing), keeps Above spaces (next pallet may stack on this one), and adds one clean Front space at the frontier.
- **`_is_fully_supported`** — sums supporting top-face areas at the candidate's resting height; rejects if coverage < footprint or **any supporter has `stacking=False`**.
- **`_topological_sort`** — Kahn's BFS over the support graph (supporter → supported), frontier ordered by `(colorIndex, centre_z)` → animation order is pallet-by-pallet, back-to-front, physically valid.
- **`run_guillotine`** — expands quantities into instances grouped by `colorIndex` (volume-descending within a group), packs container by container, regroups overflow by `colorIndex` for the next container, computes utilization.

### `algorithms/common.py`
`get_orientations` (all 6 axis permutations of w/h/d, deduplicated; just the original when rotation is disallowed) · `gravity_settle` (highest supporting top face under the XZ footprint) · `overlaps_3d` (strict AABB test — touching ≠ overlapping).

---

## Frontend (`frontend/src/`)

### Entry
- **`main.tsx`** — React 19 `createRoot` + StrictMode, imports `index.css`.
- **`App.tsx`** — root layout: collapsible sidebar (PSA logo + dark-mode toggle) left, `SceneCanvas` with the `ActivePalletPanel` overlay right. Toggles the `dark` class on `<html>`.
- **`index.css`** — Tailwind entry + thin dark scrollbar styling.

### State (`store/`) — one combined Zustand store
- **`index.ts`** — composes the five slices, re-exports the domain types.
- **`containerSlice.ts`** — `availableTypes` (user's 20ft/40ft toggles), `containers` (written *only* from the optimizer result), `activeContainerIndex` + `containerFocusKey` (camera focus; the key increments per click so re-clicking re-zooms).
- **`cartonSlice.ts`** — the `Carton` type + `CARTON_DEFAULTS`; holds no state (cartons live inside pallets).
- **`palletSlice.ts`** — `pallets[]` (seeded with mock data), `setPallets`, `removePallet`, `updatePalletCarton`.
- **`packingSlice.ts`** — `runPacker()` (flatten pallets → call API or mock → store result), result state (`packingResult`, `totalCost`, `containerSummary`, `allPacked`), plus `palletBoundaries` and `totalPackedCount` for the tracking UI.
- **`uiSlice.ts`** — sidebar open, dark mode, and playback state: `playing`, `speed` (0.5/1/2), `progress` (0–1 mirror of the GSAP timeline).

### Lib (`lib/`)
- **`api.ts`** — fetch wrapper for `POST /api/optimize/guillotine`; maps backend `boxId` → frontend `cartonId` at the boundary; `PackError` for unreachable-backend / HTTP failures.
- **`excelImport.ts`** — `parseExcel(file)`: SheetJS, case-insensitive header regexes (Pallet ID, Product Code, Qty to pick; optional Width/Height/Depth → fallback 25), accumulates duplicate products, returns `Pallet[]`.
- **`excelExport.ts`** — `exportLoadPlan()`: builds Summary sheet + one sheet per container; global Seq # matches the 3D box numbers; downloads via `XLSX.writeFile`.
- **`testCases.ts`** — 8 preloaded `TestCase`s targeting packing logic (grid fill, z-frontier, stacking on/off, cross-pallet stacking, rotation on/off, overflow).
- **`colors.ts`** — fixed 16-color palette; `getCartonColor(colorIndex % 16)`.
- **`animationState.ts`** — module-level `timelineRef` so canvas and sidebar share one GSAP timeline without prop-drilling or store churn.
- **`mockPacker.ts`** — offline fallback packer (row-shelf + topological sort) behind `USE_MOCK_PACKER = false` in `packingSlice`; handy when the backend is down.

### 3D (`components/3d/`)
- **`Canvas.tsx`** — `SceneCanvas`: R3F canvas, lights, OrbitControls. `SceneBackground` follows dark mode. `CameraController`: Effect 1 instantly fits all containers whenever the list changes; Effect 2 GSAP-zooms to a clicked container, guarded by `prevFocusKeyRef` so it only fires on explicit clicks.
- **`ContainerManager.tsx`** — lays containers side-by-side with a 100 cm gap; exports `buildContainerWorldMap` (containerId → worldX), shared with `InstancedCartons` so boxes land in the right container.
- **`ContainerMesh.tsx`** — wireframe box (`EdgesGeometry`) plus two door panels hinged open at 75°.
- **`InstancedCartons.tsx`** — the heart of the visualization:
  - groups placements by `cartonId + placed dims` → one `InstancedMesh` per group (rotation-safe);
  - assigns each placement a `globalIndex` by flattening containers in order (the backend already sorted placements into animation order);
  - one GSAP tween drives `progress` from 0 → carton count (0.4 s each); `useFrame` positions every instance: hidden before its index, eased slide from `entryZ = containerLength + 50` during its window, parked at its slot after;
  - per group: merged white edge outlines (appear when the whole group has landed), a lightened instanced top-face plane for rotated groups, and a drei `<Text>` sequence number per carton that appears as it lands.
- **`CartonPreview.tsx`** — mini auto-rotating canvas used in the edit dialog, with W/H/D axis arrows + labels.

### UI (`components/ui/`)
- **`Sidebar.tsx`** — two views. *Setup:* container types → Excel import (hidden file input) → pallet list → Pack → cost summary → Export Load Plan → utilization → playback. *Tests:* flask icon (top-right) switches to the test-case view; arrow-left returns.
- **`ContainerTypeSelector.tsx`** — glow-toggle cards for 20ft/40ft; drives `availableTypes`.
- **`PalletList.tsx` / `PalletRow.tsx`** — accordion per pallet; each carton row shows its color chip, dims, qty, Rotate/Stack badges (dimmed when disabled), and an edit pencil.
- **`CartonEditDialog.tsx`** — Radix dialog editing label/dims/qty/rotation/stacking with a live `CartonPreview`.
- **`TestCasePanel.tsx`** — one card per test case (description + counts) with its own Pack button (`setPallets` + `runPacker`).
- **`UtilizationStats.tsx`** — per-container utilization bar, placement count, and per-pallet breakdown; highlights the focused container.
- **`PlaybackControls.tsx`** — play/pause/replay, speed buttons, scrub slider driving `timelineRef`, and one colored checkpoint triangle per pallet boundary.
- **`ActivePalletPanel.tsx`** — canvas overlay listing pallet segments in load order; the segment containing the current globalIndex glows; clicking jumps the timeline. Keyed by `firstGI` so a pallet split across containers highlights only its active segment.

---

## How the animation clock works

Everything shares one number: `progress`, driven 0 → N (total cartons) by a single GSAP tween. Carton `i` is invisible while `progress ≤ i`, slides in eased while `i < progress < i+1`, and sits placed once `progress ≥ i+1`. Edge outlines, sequence labels, and the rotation planes all key off the same comparison inside `useFrame`. The store's `progress` (0–1) is just `tl.progress()` mirrored for the UI; every "jump to X" feature is `tl.progress(fraction)`.

## Repo root

- **`docker-compose.yml`** — frontend (5173) + backend (8000) services.
- **`scripts/generate-test-sheets.mjs`** — generates the 10 Excel import test sheets in `Documents/Excel Sheet/3D Packing/`.
- **`CLAUDE.md`** — project conventions + algorithm reference. **`NOTES.md`** — personal working notes.

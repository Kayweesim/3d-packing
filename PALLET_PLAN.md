# Pallet Packing — new isolated feature (single-SKU pattern optimizer)

## Context

The app packs cartons into containers today. We're adding a second, independent mode: pack cartons onto a physical pallet (single product / SKU), compute the best repeating layer pattern, and how many pallets a given quantity needs.

**Hard requirement:** this must not conflict with container packing at all — no changes to the container packing algorithm, its store slice, its API, or its 3D components. Everything new is a parallel stack, additive-only, switched by the existing `uiSlice.packingMode` (`'container' | 'pallet'`, already present).

**Decisions locked in (via AskUserQuestion):**
- Single-SKU layer-pattern optimization (one product per pallet)
- New dedicated pattern packer (not the guillotine engine); algorithm is the **G4 heuristic** (Scheithauer & Terno, 1996) — up to one horizontal + one vertical guillotine cut, homogeneous per block, mixed orientations across blocks
- Multi-pallet: given a quantity, compute cartons-per-pallet then pallets-needed (last pallet partial)

## Isolation contract (applies to every phase)

**Do NOT modify:**
- `packing_algos/**`, `optimizer.py`, `registry.py`, `algo_v1/**`
- `packingSlice.ts`, `containerSlice.ts`
- `ContainerManager.tsx`, `InstancedCartons.tsx`, `ContainerMesh.tsx`
- `api.ts::apiOptimize*`, existing routes in `main.py`

**Additive touches only** (append, never rewrite existing symbols):
- `schema.py` — new models at the bottom
- `main.py` — one new route + import
- `store/index.ts` — register one new slice
- `Canvas.tsx` — a `packingMode` branch that leaves the container path unchanged
- `RightSidebar.tsx` — already keyed to `packingMode`

**New code lives in clearly-namespaced new files/dirs:**
- Backend: `pallet_packing/`
- Frontend: `lib/palletApi.ts`, `store/palletPackSlice.ts`, `components/3d/pallet/`, pallet UI in the right sidebar

## Axis convention (match existing)

X = width, Y = height (up), Z = depth. Pallet footprint = X (Wp) × Z (Dp); load height cap along Y = Hmax (goods only, above the deck). cm throughout.

---

## Phase 1 — Backend pattern packer (pure, isolated, tested)

New self-contained package `backend/pallet_packing/` — no imports from `packing_algos`.

**`presets.py`** — pallet types (cm), the single source of truth the frontend mirrors:
- EUR1 (EPAL): 120 × 80, deck 14.4, default Hmax ~180
- EUR2: 120 × 100
- CUSTOM: caller supplies Wp, Dp, Hmax
- `dataclass PalletType { key, label, Wp, Dp, deck_h, max_height }`

**`pattern.py`** — the solver (pure functions, deterministic), G4 heuristic:
- `_layer_patterns(cw, cd, Wp, Dp) -> list[(placements2d, count)]`
  - 2D packing of identical rectangles via G4: enumerate horizontal + vertical guillotine cut positions of the form `i·cw + j·cd` bounded by Wp/Dp
  - Each of the up to 4 resulting blocks packs homogeneously; try both in-plane orientations per block, sum counts
  - Prune with upper bound `floor((Wp·Dp)/(cw·cd))`
  - Return best placements + count with `(x, z)` offsets
- `_vertical_orientations(box) -> list[(cw, cd, layer_h)]` — which carton dim points up. All 3 (dedup) when `rotationAllowed`, else natural h-up only
- `run_pallet_pack(box, pallet, quantity) -> PalletPackResult`:
  1. For each vertical orientation, best per-layer count from `_layer_patterns`
  2. `n_layers = 1 if not box.stacking else floor(Hmax / layer_h)`
  3. `per_pallet = per_layer · n_layers`; pick the orientation maximizing `per_pallet` (tie-break: better footprint-area utilization)
  4. Build placements for ONE full pallet `(x, y=deck+layer·layer_h, z, w, h, d)`. Alternate-layer 180° interlock is a later enhancement; v1 = uniform column stacking
  5. `pallets_needed = ceil(quantity / per_pallet)`, `last_pallet_count = quantity − (pallets_needed−1)·per_pallet`
  6. Utilizations: footprint area %, height %, volume %

**`test_pattern.py`** — plain-assert snapshot harness (mirror `algo_v1/test_characterize.py` style): a few carton/pallet/quantity scenarios pinning `per_layer`, `n_layers`, `per_pallet`, `pallets_needed`, and exact placement count. Run `python -m pallet_packing.test_pattern`.

**Verify:** run the test harness; hand-check EUR1 with a simple carton (e.g. 40×30×30, Hmax 180) that `per_layer`, `layers`, and `pallets_needed` match a manual calc.

---

## Phase 2 — Backend API (additive)

**`schema.py` (append only):**
- `PalletBoxIn { id, label, w, h, d, quantity, rotationAllowed, stacking }`
- `PalletSpecIn { key, Wp?, Dp?, max_height? }`
- `PalletPlacementOut { boxId, x, y, z, w, h, d }`
- `PalletPackResponse { placements, per_layer, layers, per_pallet, pallets_needed, last_pallet_count, footprint_util, height_util, volume_util, pallet: {Wp, Dp, deck_h, max_height, label} }`
- `PalletPackRequest { box: PalletBoxIn, pallet: PalletSpecIn, quantity }`

**`main.py` (append):** `POST /api/pallet/optimize` → calls `pallet_packing.pattern.run_pallet_pack`, returns `PalletPackResponse`. Synchronous (the solve is instant — no SSE/threads needed). Import added alongside the existing ones; existing routes untouched.

**Verify:** boot backend, curl/inline-POST `/api/pallet/optimize` → 200 with expected counts; confirm `/api/optimize`, `/api/optimize/stream`, `/api/trace` still respond unchanged.

---

## Phase 3 — Frontend data layer (isolated)

**`lib/palletApi.ts`** (new, standalone — does not import from `api.ts` except optionally reusing the `PackError` class): `PalletPackRequest`/`PalletPackResult` TS types + `apiPalletPack(req): Promise<PalletPackResult>` (POST `/api/pallet/optimize`, maps `boxId → cartonId` like `mapOptimizeResponse`).

**`store/palletPackSlice.ts`** (new):
- State: `palletPackResult`, `palletLoading`, `palletError`
- Inputs: `palletType`, `palletMaxHeight`, `palletQuantity`, `selectedCartonId`
- Action: `runPalletPacker()` — reads its own inputs + the chosen carton, calls `apiPalletPack`, stores result
- Register in `store/index.ts` (one line, additive)

**Pallet presets mirror** for the UI selector (in `lib/palletApi.ts` or a small `lib/palletTypes.ts`), mirroring `presets.py`.

**Verify:** `npx tsc -b clean`; call `runPalletPacker()` from a temporary button and log the result.

---

## Phase 4 — Frontend 3D (forked, isolated)

New dir `components/3d/pallet/` (forks, not edits):

- **`PalletMesh.tsx`** — a wooden pallet deck platform (block/stringer look) + optional load-height guide box; no doors. Sibling of `ContainerMesh`.
- **`PalletManager.tsx`** — lays out `pallets_needed` pallets side-by-side along X (own `buildPalletWorldMap`, same gap idea as `CONTAINER_GAP_CM`); renders one `PalletMesh` each.
- **`PalletInstancedCartons.tsx`** — fork of `InstancedCartons`: replicate the single-pallet placements across each pallet's `worldX` (truncate the last to `last_pallet_count`), `InstancedMesh` + product color + seq labels. Entry animation drops from above (Y) instead of sliding through a door.

**`Canvas.tsx`** (the one shared file — minimal branch):
```tsx
{packingMode === 'container'
  ? <><ContainerManager /><InstancedCartons /></>   // unchanged path
  : <><PalletManager /><PalletInstancedCartons /></>}
```

**Camera fit:** reuse `fitDistance`; either extend `CameraController` to read pallet dims when in pallet mode, or add a small `PalletCameraController` mounted only in pallet mode (keeps container camera logic untouched).

**Verify:** run app, toggle to Pallet mode via the existing `PackingModeToggle`, pack, confirm pallets + cartons render and animate; toggle back to Container mode and confirm it's visually identical to before.

---

## Phase 5 — Frontend controls & results (right sidebar)

`RightSidebar.tsx` already switches on `packingMode`; fill its pallet branch:

- **Carton source:** pick a product from the loaded product master / imported cartons, or manual dims entry (w/h/d, rotation, stacking)
- **Pallet-type selector** (glow-toggle, mirror of `ContainerTypeSelector`), max-height input, quantity input, **"Pack Pallet"** button → `runPalletPacker()`
- **Results block:** cartons/layer, layers, cartons/pallet, pallets needed (last partial), footprint/height/volume utilization
- Loading + error states mirror the left sidebar's patterns

**Verify:** full click-through — choose product, pallet type, quantity → Pack → stats + 3D match.

---

## End-to-end verification

1. Backend test harness green: `python -m pallet_packing.test_pattern`
2. Container regression: `/api/optimize/stream` + `/api/trace` unchanged; container 3D mode visually identical and untouched
3. `npx tsc -b clean`
4. App: Pallet mode → pick product + EUR1 + qty → Pack → correct counts, 3D pallets render/animate, stats correct; switch back to Container mode works exactly as before
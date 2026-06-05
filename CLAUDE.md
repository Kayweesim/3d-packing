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
│       ├── App.tsx                           # Root layout: sidebar left, canvas right
│       ├── components/
│       │   ├── 3d/
│       │   │   ├── Canvas.tsx                # R3F scene, camera, lighting, OrbitControls
│       │   │   ├── ContainerMesh.tsx         # Wireframe container + 75° open doors
│       │   │   ├── ContainerManager.tsx      # Renders containers side-by-side from store
│       │   │   ├── InstancedBoxes.tsx        # All packed cartons via InstancedMesh + GSAP
│       │   │   └── CartonPreview.tsx         # Mini R3F canvas — live 3D preview in CartonEditDialog
│       │   └── ui/
│       │       ├── Sidebar.tsx               # Left panel: container types, import, pallets, pack
│       │       ├── ContainerTypeSelector.tsx # Glow-toggle buttons for 20ft / 40ft
│       │       ├── PalletList.tsx            # Renders PalletRow for each pallet; empty state
│       │       ├── PalletRow.tsx             # Accordion row: header + expandable carton list
│       │       ├── CartonEditDialog.tsx      # Edit carton dims/qty/constraints; live CartonPreview
│       │       ├── UtilizationStats.tsx      # Per-container utilization bar + placement count
│       │       └── PlaybackControls.tsx      # Play/pause/scrub slider/speed multiplier
│       ├── store/
│       │   ├── index.ts                      # Zustand store combining all slices
│       │   ├── containerSlice.ts             # availableTypes, containers, containerFocusKey
│       │   ├── cartonSlice.ts                # Carton type, CartonSlice, CARTON_DEFAULTS, cartons[]
│       │   ├── palletSlice.ts                # pallets[], setPallets, removePallet, updatePalletCarton
│       │   ├── packingSlice.ts               # loading, error, totalCost, allPacked, runPacker
│       │   └── uiSlice.ts                    # sidebarOpen, darkMode, playing, speed, progress
│       └── lib/
│           ├── api.ts                        # apiOptimizeExtremePoints + OptimizerResult type
│           ├── colors.ts                     # 16-color deterministic palette (index-based)
│           └── animationState.ts             # Module-level GSAP timeline ref (canvas ↔ sidebar)
└── backend/
    ├── main.py                               # FastAPI app, CORS localhost:5173
    ├── schema.py                             # Pydantic: OptimizeRequest/Response, BoxIn, PlacementOut
    ├── requirements.txt                      # fastapi, uvicorn[standard]
    └── algorithms/
        ├── common.py                         # gravity_settle, overlaps_3d, get_orientations
        ├── optimizer.py                      # Cost-minimizing combo search + volume pre-check
        └── extreme_points.py                 # EP set, gravity + depth-first scoring, EP pruning
```

## Conventions & Standards

### Domain Model
The packing unit is a **carton** (a product box with W×H×D). Cartons are grouped into **pallets** (a logical shipment unit with an ID). A pallet contains one or more carton types.

```
Pallet  { id, label, cartons: Carton[] }
Carton  { id, label, w, h, d, quantity, colorIndex, rotationAllowed, stackingOnTop, stackingUnder }
```

`Carton` is defined in `cartonSlice.ts` and is the single type used everywhere — `palletSlice.Pallet.cartons` is `Carton[]`, and `packingSlice.runPacker` will flatten pallets into carton instances in Phase 3.

### Axis Convention
- `w` = X (cross-section width, 235 cm for both container types)
- `h` = Y (height, 239 cm)
- `d` = Z (depth/length; `z=0` = back wall, `z=d` = door)
- World X: containers placed side-by-side with 100 cm gap (`CONTAINER_GAP_CM`)

### Container Presets
- **20ft TEU:** `d=589, w=235, h=239` — cost 1.0 unit
- **40ft FEU:** `d=1203, w=235, h=239` — cost 1.5 units

### Optimizer (`POST /api/optimize/extreme-points`)
Generates all `(n20, n40)` combos sorted by `(cost, total, n20)`. Volume pre-check skips impossible combos. Runs Extreme Points on each until `all_packed=True`; returns first success or best partial.

Request: `{ boxes: [{id, label, w, h, d, quantity, colorIndex}], available_types: ["20ft", "40ft"] }`
Response: `{ containers, containers_used, total_cost, container_summary, all_packed }`

### Packing Algorithm — Extreme Points
- EP set starts at `{(0,0,0)}`; grows by 3 EPs per placement (right face, top face, front face)
- Cartons sorted by volume descending; each tries all 6 axis-aligned orientations
- Score per `(EP, orientation)`: `(gravity_settled_y, ep_z, ep_x)` — lower is better
- `gravity_settle()`: scans XZ footprint overlaps to find resting Y
- `overlaps_3d()`: separating axis theorem — overlap on ALL 3 axes = collision
- Dominated and out-of-bounds EPs pruned after each placement
- Placements sorted by `centre-z` ascending (back→door) — this is the animation order

### 3D Rendering
- Containers: transparent wireframes only (`EdgesGeometry` + `lineBasicMaterial`)
- Cartons: **must use `InstancedMesh`** — non-negotiable for 60fps at scale
- Carton colors: deterministic palette (`colorIndex % 16`), never random
- Animation: GSAP timeline, cartons slide in one-by-one from outside the door (entry Z = `containerLength + 50`)
- `timelineRef` lives in `animationState.ts` (module-level, not a React ref) so `PlaybackControls` and `InstancedBoxes` share the same timeline without prop-drilling

### Multi-Container UX
- Container list is set entirely by the optimizer result; user never manually adds/removes containers
- Clicking a container focuses the camera on it via a GSAP transition
- `containerFocusKey` increments on every `setActiveContainerIndex` call — enables re-clicking the same container to re-trigger camera zoom
- `prevFocusKeyRef` in `CameraController` guards Effect 2 — camera only zooms on explicit user click, not when the container list changes

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

## Roadmap

### Phase 2 — Excel Import
**Goal:** Parse a real Excel manifest into `palletSlice`. No backend changes.

- Install SheetJS (`xlsx`)
- `ExcelImport` component replaces the placeholder button — accepts `.xlsx`/`.xls`, parses columns `pallet_id`, `product_name`, `carton_qty`; calls `setPallets`
- **Product dimension registry** (`productDimRegistry` in a new slice or local map): stores W×H×D keyed by `label`. When the same product appears across multiple pallets, dims are pre-filled and shared. Re-importing a new sheet preserves any dims the user already entered.
- Validation: Pack button disabled (with tooltip) if any carton has `w/h/d = 0`

**AC:** Upload a real sheet → pallets populate sidebar → dims entered once apply to matching product rows across all pallets → re-import doesn't wipe entered dims.

---

### Phase 3 — Packing Integration
**Goal:** Wire `palletSlice` into the optimizer; show pallet-grouped results.

- `runPacker` (packingSlice) flattens `pallets → carton instances`, maps each to the `BoxIn` shape the API expects; standalone `cartons[]` in `cartonSlice` can be removed
- Each carton instance carries its `palletId` as a label tag so placements can be traced back to a pallet
- 3D scene: `colorIndex` assigned at the **pallet** level (all cartons on the same pallet share a color) for clearer visual tracking — replaces current per-product coloring
- `UtilizationStats` extended to show per-pallet carton counts alongside per-container utilization
- `canPack` guard updated: enabled only when all cartons have dimensions set

**AC:** Full round-trip — import Excel → set dims → Pack → 3D animation shows cartons colored by pallet → utilization stats break down by container and pallet.

## Known Gotchas

- **Pack button currently sends empty cartons (Phase 1 state).** `packingSlice.runPacker` reads from `cartonSlice.cartons[]` which starts empty (no UI to add standalone cartons). The `// TODO Phase 3` comment in `packingSlice.ts` marks where this gets replaced with the pallet flatten.
- **Carton constraints are UI-only.** `rotationAllowed`, `stackingOnTop`, `stackingUnder` exist on `Carton` and are editable in `CartonEditDialog` but are not sent to the optimizer. Phase 3 must pass them through.
- **`cartonSlice.cartons[]` is a holdover.** The standalone `cartons` array exists in the store but nothing populates it. It will be removed or repurposed in Phase 3.
- **GSAP timeline lives outside React.** `timelineRef.current` is a plain module-level object in `animationState.ts`, intentionally not inside any component or Zustand. This avoids re-render cycles on every animation frame.
- **`containerFocusKey` + `prevFocusKeyRef` are both required.** They form a two-part guard: `containerFocusKey` enables re-clicking the same container; `prevFocusKeyRef` prevents the zoom from firing on container list changes. Removing either breaks the UX.
- **`updateCarton` vs `updatePalletCarton`.** `cartonSlice` owns `updateCarton(id, updates)` for standalone cartons. `palletSlice` owns `updatePalletCarton(palletId, cartonId, updates)` for cartons within a pallet. The names are intentionally different to avoid TypeScript intersection conflicts in `StoreState`.

---

## Last Session Notes

### Phase 1 — Business pivot: boxes → pallets/cartons model

#### Business requirement change
The app pivoted from a free-form "add your own boxes" model to a logistics-specific **pallet manifest** model. Users no longer manually enter box dimensions; instead, data comes from an uploaded Excel sheet (Phase 2). Each pallet in the manifest contains one or more carton types (SKUs), each with a product label and W×H×D dimensions.

#### New domain model
- `Carton` replaces `Box` as the primary packing unit. The types are structurally identical (`id`, `label`, `w`, `h`, `d`, `quantity`, `colorIndex`, `rotationAllowed`, `stackingOnTop`, `stackingUnder`) — `Carton` is not a new shape, it is the renamed `Box`.
- `Pallet { id, label, cartons: Carton[] }` groups cartons by shipment pallet. Pallets are a UI/business grouping only; the packing algorithm still operates on individual carton instances.

#### New files created
| File | Purpose |
|---|---|
| `store/cartonSlice.ts` | `Carton` type, `CartonSlice`, `CARTON_DEFAULTS`, `createCartonSlice` |
| `store/palletSlice.ts` | `Pallet` type, `PalletSlice`, `createPalletSlice`; seeded with 3 mock pallets for Phase 1 UI dev |
| `components/ui/PalletList.tsx` | Renders a `PalletRow` per pallet; shows empty-state message when no pallets loaded |
| `components/ui/PalletRow.tsx` | Accordion row — header shows pallet label + SKU count + carton count; expanded body lists cartons with color swatch, dims, qty, and edit button |
| `components/ui/CartonEditDialog.tsx` | Edit a carton's label, W×H×D, quantity, and constraints; includes live `CartonPreview`; calls `updatePalletCarton` |
| `components/3d/CartonPreview.tsx` | Mini R3F canvas with auto-rotate, axes labels (W/H/D), and live dim updates; extracted from old `BoxPreview.tsx` and renamed |

#### Files refactored / renamed
| Before | After | Notes |
|---|---|---|
| `store/boxSlice.ts` | `store/cartonSlice.ts` | Renamed; `boxSlice.ts` left as a 3-line re-export shim |
| `Box` interface | `Carton` interface | Same shape, renamed throughout |
| `BoxSlice` | `CartonSlice` | — |
| `BOX_DEFAULTS` | `CARTON_DEFAULTS` | — |
| `boxes` (store state) | `cartons` | Applies in `cartonSlice`, `packingSlice`, `InstancedBoxes` |
| `addBox / removeBox / updateBox` | `addCarton / removeCarton / updateCarton` | — |
| `palletSlice.updateCarton` | `palletSlice.updatePalletCarton` | Renamed to avoid TypeScript intersection name collision with `cartonSlice.updateCarton` |
| `components/3d/BoxPreview.tsx` | `components/3d/CartonPreview.tsx` | New file created; `BoxPreview.tsx` left as a 1-line re-export shim |
| `components/ui/BoxEditDialog.tsx` | *(removed)* | Replaced by `CartonEditDialog.tsx`; file emptied to `export {}` |
| `components/ui/BoxForm.tsx` | *(removed)* | Manual box entry replaced by Excel import; file emptied to `export {}` |

#### Sidebar restructure
`Sidebar.tsx` was rewritten. The old "Boxes" section (with `BoxForm`) was replaced with two new sections:
1. **Import Data** — dashed-border placeholder button ("Import from Excel"); disabled until Phase 2
2. **Pallets** — `PalletList` component; each row is an expandable `PalletRow`

The Pack button `canPack` guard now checks `pallets.length > 0` instead of `boxes.length > 0`.

#### Key design decisions
- **`Carton` reuses the `Box` shape** rather than introducing a new interface. This keeps `packingSlice` and the API layer minimally changed — `OptimizeRequest.boxes` still accepts `Carton[]` directly, since the field names match exactly.
- **`updatePalletCarton` vs `updateCarton`** — two separate action names were required to avoid a TypeScript `StoreState` intersection conflict (same method name, different arity).
- **Mock pallets seeded in `palletSlice`** for Phase 1 so the accordion UI is immediately demonstrable without needing an Excel file. These are replaced by `setPallets()` when Phase 2 import is wired up.
- **`cartonSlice.cartons[]` kept in the store** for now because `packingSlice.runPacker` still reads from it (Phase 3 will replace this with a pallet flatten). The standalone `cartons` array starts empty and is currently unreachable from the UI.


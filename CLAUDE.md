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
Carton  { id, label, w, h, d, quantity, colorIndex, rotationAllowed, stacking }
```

`Carton` is defined in `cartonSlice.ts` and is the single type used everywhere — `palletSlice.Pallet.cartons` is `Carton[]`, and `packingSlice.runPacker` will flatten pallets into carton instances in Phase 3.

### Axis Convention
- `w` = X (cross-section width, 235 cm for both container types)
- `h` = Y (height, 239 cm)
- `d` = Z (depth/length; `z=0` = back wall, `z=d` = door)
- World X: containers placed side-by-side with 100 cm gap (`CONTAINER_GAP_CM`)

### Container Presets
- **20ft TEU:** `d=589, w=235, h=239`
- **40ft FEU:** `d=1203, w=235, h=239`

### Optimizer (`POST /api/optimize/extreme-points`)
Generates all `(n20, n40)` combos sorted by `(cost, total, n20)`. Volume pre-check skips impossible combos. Runs Extreme Points on each until `all_packed=True`; returns first success or best partial.

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

## What needs to be fixed
1. When it comes to pallet-by-pallet packing, it's possible that theres space at the top that is free, but if its in too deep, then the next pallet's boxes will still take that
space even though it's possible that it cannot be reached.
2. Stackable and Rotation haven't been implemented yet.
3. Numbering system has to be done so each box has numbering.




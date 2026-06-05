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


### Last Session Notes


#### Gitignore setup
- `.gitignore` (root) — OS, editor, `.env`, `docker-compose.override.yml`
- `backend/.gitignore` — `venv/`, `__pycache__`, `*.pyc`, `.pytest_cache`, coverage
- `frontend/.gitignore` — `node_modules/`, `dist/`, coverage, logs, env files


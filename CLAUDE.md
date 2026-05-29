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
├── container-packing-frontend/
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
│       │       ├── Sidebar.tsx               # Left panel shell, collapsible
│       │       ├── ContainerForm.tsx         # Add containers, 20ft/40ft preset buttons
│       │       ├── BoxForm.tsx               # Add boxes (w, h, d, quantity)
│       │       ├── ContainerSwitcher.tsx     # Dropdown/tabs to switch active container (>1 only)
│       │       ├── UtilizationStats.tsx      # % space used per container
│       │       └── PlaybackControls.tsx      # Play/pause/scrub slider/speed multiplier
│       │
│       ├── store/
│       │   └── index.ts                      # Zustand store: uiSlice, containerSlice, packingSlice
│       │
│       └── lib/
│           ├── presets.ts                    # TEU/FEU dimension constants
│           ├── mockPacker.ts                 # Guillotine algorithm in TypeScript (pre-API)
│           ├── colors.ts                     # Deterministic index-based color palette
│           └── math.ts                       # 3D placement math, bounding box helpers
│
└── container-packing-backend/
    ├── main.py                               # FastAPI app, CORS, registers /api/pack route
    ├── requirements.txt                      # pip dependencies
    └── algorithms/
        ├── __init__.py
        └── guillotine.py                     # Real packing algorithm, mirrors mockPacker output shape
```

## Core Domain Logic

### Container Presets
- **20ft TEU:** 589 × 235 × 239 cm (L×W×H)
- **40ft FEU:** 1203 × 235 × 239 cm (L×W×H)
- Custom dimensions always available alongside presets.

### Packing Algorithm
- Start with a **Guillotine algorithm** supporting multiple rectangular containers.
- Backend exposes a single POST endpoint: `/api/pack`
- Request: `{ containers: [...], boxes: [{ w, h, d, quantity }] }`
- Response: `{ containers: [{ id, placements: [{ boxId, x, y, z, w, h, d }] }] }`
- **Mock this locally first** with a deterministic JS implementation in `lib/mockPacker.ts`. Structure the Zustand store so swapping mock → real API is a one-line change.

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

After completing each phase, confirm it runs before proceeding to the next.

## What Good Output Looks Like
- TypeScript types defined for all data structures (`Box`, `Container`, `Placement`, `PackingResult`)
- Components are small and single-responsibility
- Zustand store is the single source of truth — no local state that duplicates store state
- `// TODO:` comments mark known shortcuts taken for prototype speed
- `docker-compose up` starts everything from scratch with no extra steps

---

## Session State

### Phase Progress
- [x] Phase 1 — Scaffold + Docker ✅
- [x] Phase 2 — Zustand store + TypeScript types ✅
- [x] Phase 3 — 3D Foundation ✅
- [x] Phase 4 — Mock Packer ✅
- [x] Phase 5 — Instanced Rendering ✅
- [x] Phase 6 — Animation + Playback Controls ✅ (6a ✅ · 6b ✅ · 6c ✅ · 6d ✅ · 6e ✅)
- [ ] Phase 7 — Multi-container UX
- [ ] Phase 8 — Backend (real Guillotine)
- [ ] Phase 9 — Docker wiring

### Last Session Notes

#### Phase 5 — Instanced Rendering
- `src/lib/colors.ts` — 16-color deterministic palette; `getBoxColor(colorIndex)` wraps with modulo
- `src/components/3d/InstancedBoxes.tsx` — reads `packingResult` + `boxes` + `containers` from store; mirrors `ContainerManager` layout math to get per-container `worldX`; groups placements by `boxId`; one `InstancedMesh` per unique box type (imperative `setMatrixAt` in `useEffect`, not Drei `<Instances>`, to avoid React reconciler overhead per instance); merged `EdgesGeometry` per group (all instance edges in one `BufferGeometry`) renders as one `lineSegments` draw call — white 55% opacity outlines delineate boxes; Z correction `placement.z + d/2 - containerD/2` accounts for container mesh being centered on Z=0 while mockPacker fills Z from 0→d
- `src/components/ui/BoxForm.tsx` — each box row now shows a colored square swatch (10×10px, `getBoxColor(b.colorIndex)`) after the qty, visible before Pack is clicked
- `src/components/3d/Canvas.tsx` — `<InstancedBoxes />` added to R3F scene

#### Phase 6a — Box Constraint Properties
- `src/store/boxSlice.ts` — added `rotationAllowed`, `stackingOnTop`, `stackingUnder` (all default `true`) to `Box` interface; exported `BOX_DEFAULTS` constant for reuse across forms
- `src/components/ui/BoxForm.tsx` — separate `constraints` state (boolean, resets to `BOX_DEFAULTS` after submit); 3 checkboxes (Rotation / Stack top / Stack under) rendered above Add Box button; flags passed into `addBox`
- `src/components/ui/BoxEditDialog.tsx` — `FormState` extended with 3 boolean flags; flags pre-filled from `box` prop and re-synced on open; same 3 checkboxes rendered above Save/Cancel; flags passed to `updateBox`

#### Phase 5 — Instanced Rendering + Box Edit UX (same session)
- `src/lib/colors.ts` — 16-color deterministic palette; `getBoxColor(colorIndex)` wraps with modulo
- `src/components/3d/InstancedBoxes.tsx` — reads `packingResult` + `boxes` + `containers` from store; mirrors `ContainerManager` layout math to get per-container `worldX`; groups placements by `boxId`; one `InstancedMesh` per unique box type (imperative `setMatrixAt`, not Drei `<Instances>`); merged `EdgesGeometry` per group; Z correction `placement.z + d/2 - containerD/2`
- `src/components/3d/BoxPreview.tsx` — self-contained R3F canvas; spinning box with `OrbitControls autoRotate`; `CameraPositioner` keeps box framed as dims change; `axesHelper` at box corner with W/H/D text labels (Drei `Text`)
- `src/components/ui/BoxEditDialog.tsx` — Radix `Dialog`; live 3D preview + edit form; Save calls `updateBox`, no re-pack
- `src/components/ui/BoxForm.tsx` — pencil icon opens edit dialog; color swatch per box row

#### Phase 6b — Mock Packer Refactor
- `src/lib/mockPacker.ts` — fully rewritten packer:
  - **In-out ordering**: `findBestFit` now scores by lowest-z primary (deepest inside container), volume secondary — prevents horizontal layer-by-layer packing
  - **Door**: z=container.d is the door; z=0 is the back wall; placement always fills back first
  - **Rotation**: `getOrientations(w,h,d)` returns up to 6 deduplicated axis-aligned orientations; `tryPlace` tries all orientations when `rotationAllowed=true` and picks the best-scoring candidate
  - **Stacking constraints**: `requireFloor=true` (when `stackingUnder=false`) skips elevated spaces; R2 guillotine sub-space (above) is only created when `stackingOnTop=true`
  - **Animation order**: `placements` sorted by centre-z ascending after each container is packed — this array order is the GSAP animation sequence in Phase 6d
  - `BoxInstance` now carries `rotationAllowed`, `stackingOnTop`, `stackingUnder` flags from `Box`

#### Phase 6e — PlaybackControls + Packer Floating Fix
- `src/components/ui/PlaybackControls.tsx` — Play/Pause (with icons), scrub slider (0–1 step 0.001), 0.5×/1×/2× speed buttons, Replay button; reads `playing/speed/progress` from UiSlice; uses `timelineRef.current` directly for seeking (avoids Zustand circular loop); only shown when `packingResult !== null`
- `src/components/ui/Sidebar.tsx` — added `<PlaybackControls />` below `<UtilizationStats />`
- `src/components/3d/InstancedBoxes.tsx` — changed `setPlaying(false)` → `tl.play(); setPlaying(true)` so boxes animate immediately on Pack
- `src/lib/mockPacker.ts` — added `settleY(x, z, ow, od, placements)` gravity function; updated `findBestFit` to accept `placements` and compute `actualY` via `settleY`; updated `tryPlace` to place at `actualY` (not `s.y`) and recompute R2/R3 splits using `actualY`; eliminates floating boxes with multiple box types

### Next Session Start Point
Phase 7 — Multi-container UX: container switcher dropdown (visible when >1 container), GSAP camera transition to selected container, per-container utilisation in sidebar.
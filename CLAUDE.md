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
- [ ] Phase 5 — Instanced Rendering
- [ ] Phase 6 — Animation + Playback Controls
- [ ] Phase 7 — Multi-container UX
- [ ] Phase 8 — Backend (real Guillotine)
- [ ] Phase 9 — Docker wiring

### Last Session Notes

#### Phase 3 polish (applied same session)
- `App.tsx` — `shrink-0` + `transition-[width]` on `<aside>` prevents sidebar from shrinking the canvas; `overflow-hidden` on inner wrapper completes scroll containment
- `Sidebar.tsx` — `h-full` on root div enables `overflow-y-auto` scroll pattern
- `ContainerForm.tsx`, `BoxForm.tsx` — `type="button"` added to all non-submit buttons (preset buttons + remove X) to prevent accidental form submission
- `Canvas.tsx` OrbitControls tuned: `dampingFactor=0.12`, `rotateSpeed=0.6`, `zoomSpeed=0.7`, `maxPolarAngle=Math.PI/2` (camera can't go below ground), `minPolarAngle=Math.PI/8` (prevents disorienting top-down flip)

#### Phase 4 — Mock Packer
- `src/lib/mockPacker.ts` — 3D Guillotine algorithm; maintains a `FreeSpace[]` list starting as the whole container interior; **Best Fit** heuristic (smallest fitting space wins, reduces fragmentation); guillotine split produces 3 sub-cuboids after each placement (right, above, behind); **LFD sort** (largest volume first) before packing; unplaced boxes overflow into the next container
- `src/store/packingSlice.ts` — added `pack()` action; reads `containers` + `boxes` from the combined store via `get()`, calls `runMockPacker`, stores result; `StateCreator` typed against `ContainerSlice & BoxSlice & PackingSlice` so TypeScript sees cross-slice fields; `// TODO Phase 8` marks the one-line swap for the real API call
- `src/components/ui/UtilizationStats.tsx` — renders a labeled progress bar + box count per container; hidden until `pack()` has been called at least once
- `src/components/ui/Sidebar.tsx` — added **Pack** button (disabled when no containers or boxes exist) + `<UtilizationStats />` below it
- Debug logs (`console.log('[pack] ...')`) were temporarily added to `packingSlice.ts` to diagnose a 0% utilization bug — **check if these were removed before next session**

### Next Session Start Point
Begin Phase 5 — `InstancedBoxes.tsx`: read `packingResult` from the store and render all placed boxes using `InstancedMesh`. Each unique `boxId` gets a color from a deterministic palette (build `src/lib/colors.ts`). No animation yet — just static instanced placement. Confirm boxes appear in the 3D scene after clicking Pack before moving to Phase 6.
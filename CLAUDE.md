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
10. **Packer Testing** — Rigorous test suite for packing correctness (see test cases below)

After completing each phase, confirm it runs before proceeding to the next.

## What Good Output Looks Like
- TypeScript types defined for all data structures (`Box`, `Container`, `Placement`, `PackingResult`)
- Components are small and single-responsibility
- Zustand store is the single source of truth — no local state that duplicates store state
- `// TODO:` comments mark known shortcuts taken for prototype speed
- `docker-compose up` starts everything from scratch with no extra steps

---

## Phase 10 — Packer Test Suite

All tests run against `runMockPacker` (and later the real backend via `runPacker`). Each test asserts on the returned `PackingResult[]`. Tests live in `src/lib/__tests__/packer.test.ts` using Vitest.

### What every test must verify
1. **No overlap** — no two placements share any volume in the same container.
2. **Within bounds** — every placement fits inside its container (`x+w ≤ container.d`, `y+h ≤ container.h`, `z+d ≤ container.w`).
3. **Correct count** — total placements across all containers equals total box quantity (or less if some don't fit).
4. **No floating** — every box either rests on the floor (`y=0`) or on top of another box (`y = some box's y+h`).

### Overlap check helper
```ts
function hasOverlap(placements: Placement[]): boolean {
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i], b = placements[j]
      const xOk = a.x + a.w <= b.x || b.x + b.w <= a.x
      const yOk = a.y + a.h <= b.y || b.y + b.h <= a.y
      const zOk = a.z + a.d <= b.z || b.z + b.d <= a.z
      if (!xOk && !yOk && !zOk) return true
    }
  }
  return false
}
```

### Test Cases

#### GROUP 1 — Single box type, single container

| ID | Description | Container | Box | Qty | Expected |
|---|---|---|---|---|---|
| T01 | Single box fits exactly | 100×100×100 | 100×100×100 | 1 | 1 placed, 100% utilization |
| T02 | Single box too large | 100×100×100 | 101×100×100 | 1 | 0 placed |
| T03 | Fill floor with identical boxes | 200×100×200 | 100×100×100 | 4 | 4 placed, ~100% utilization (2×2 floor layer) |
| T04 | Stack identical boxes | 100×200×100 | 100×100×100 | 2 | 2 placed (one on top of other) |
| T05 | Overfill — more boxes than fit | 100×100×100 | 50×50×50 | 100 | 8 placed (2×2×2 = 8 fit), rest unplaced |
| T06 | One large box + many small | 200×200×200 | 200×200×200 (×1) + 50×50×50 (×8) | mixed | large placed first, smalls fill remaining space or stack |

#### GROUP 2 — Multiple box types, single container

| ID | Description | Container | Boxes | Expected |
|---|---|---|---|---|
| T07 | Two sizes, equal quantity | 20ft TEU | 50×50×50 (×50) + 100×100×100 (×50) | larger boxes placed first (LFD), no overlap, no floating |
| T08 | Three sizes, LFD order | 20ft TEU | 120×80×80 (×20) + 60×60×60 (×30) + 30×30×30 (×50) | placement order: large → medium → small |
| T09 | Boxes that only fit one orientation | 200×100×50 container | 200×50×50 (×2) | both placed side by side on floor |
| T10 | Mix of tall and flat boxes | 20ft TEU | 50×200×50 (×10, tall) + 200×50×50 (×10, flat) | no floating, stacking respects gravity |

#### GROUP 3 — Boundary and edge cases

| ID | Description | Container | Boxes | Expected |
|---|---|---|---|---|
| T11 | Empty box list | 20ft TEU | none | 0 placements, 0% utilization |
| T12 | Empty container list | none | 50×50×50 (×10) | returns [] |
| T13 | Box exactly fits one axis edge | 589×100×100 container | 589×100×100 (×1) | 1 placed, fits flush against all Z walls |
| T14 | Quantity 0 box | 20ft TEU | 50×50×50 (qty=0) | 0 placements |
| T15 | 1×1×1 boxes fill container | 10×10×10 container | 1×1×1 (×1000) | 1000 placed, 100% utilization |

#### GROUP 4 — Multi-container

| ID | Description | Containers | Boxes | Expected |
|---|---|---|---|---|
| T16 | Overflow from first to second | two 20ft TEUs | 100×100×100 (×200) | first container full, remainder in second |
| T17 | Second container stays empty | two 20ft TEUs | 50×50×50 (×1) | 1 placed in first, second has 0 placements |
| T18 | Each container gets different sizes | two 20ft TEUs | 200×200×200 (×10) + 50×50×50 (×500) | large boxes in first, smalls overflow into second |

#### GROUP 5 — Utilization accuracy

| ID | Description | Expected utilization |
|---|---|---|
| T19 | Perfect fit (single box fills container) | 1.0 (100%) |
| T20 | Half-fill (boxes occupy exactly half volume) | ~0.5 (50%) |
| T21 | Near-empty (1 small box in large container) | close to 0 |

### Pass criteria
- All GROUP 1–3 tests pass with zero overlap and zero out-of-bounds placements.
- GROUP 4 tests pass with correct spillover between containers.
- Utilization values are within ±1% of expected.
- Suite runs in under 500ms total (pure TS, no browser needed).

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
- [ ] Phase 8 — Backend (real Guillotine)
- [ ] Phase 9 — Docker wiring
- [ ] Phase 10 — Packer Test Suite

### Last Session Notes

#### Phase 7 — Multi-container UX
- `src/components/ui/ContainerForm.tsx` — container list rows are now clickable navigators; each `<li>` calls `setActiveContainerIndex(i)` on click; active row gets `border-primary bg-muted` highlight; hover gets `bg-accent`; X button has `e.stopPropagation()` so remove doesn't also trigger row click; reads `activeContainerIndex` + `setActiveContainerIndex` from store
- `src/components/ui/UtilizationStats.tsx` — active container row gets `bg-muted` highlight when `containers.length > 1`; uses `containers.findIndex` to match result to active index
- `src/components/3d/Canvas.tsx` — `CameraController` split into two effects:
  - Effect 1 `[containers, camera, controls]`: instant fit-all reposition when containers list changes (existing behaviour)
  - Effect 2 `[activeContainerIndex, containers, camera, controls]`: GSAP `power2.inOut` 0.8s transition to focus on the active container; `prevIndexRef` guard ensures it only fires when the index actually changes (not on container add/remove); kills previous tweens before starting new ones; animates both `camera.position` and `controls.target` (Vector3); calls `controls.update()` on every GSAP frame via `onUpdate`
- `src/lib/animationState.ts` — unchanged; Z coordinate system updated this session: container back wall = Z=0, door = Z=container.w (removed old Z-centering); `worldCenter` in `InstancedBoxes` simplified to `z: p.z + p.d / 2` (no offset); `CameraController` target updated to `maxDepth / 2`; axesHelper added at origin

### Next Session Start Point
Phase 8 — Backend: FastAPI + real Guillotine algorithm in Python, `src/lib/api.ts` calling `/api/pack`, swap mock → real in packingSlice.
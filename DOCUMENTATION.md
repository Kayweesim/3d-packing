# Container Packing Visualizer — Developer Documentation

Companion docs: [CLAUDE.md](./CLAUDE.md) (conventions + deep algorithm reference) · [CODEBASE.md](./CODEBASE.md) (file-by-file tour).

---

## 1. Overview

**What:** an interactive 3D container-packing planner. It takes a warehouse pick list (Excel), optimizes box placement across standard shipping containers (20ft/40ft), and renders the result as an animated, step-by-step 3D load plan a warehouse team can actually follow — with exportable Excel load plans and printable cross-section slices.

**Who for:** logistics/warehouse planners (built around PSA pick-list formats). Runs fully offline as a single Windows executable — no cloud services.

**Architecture & data flow:**

```
Excel pick list ──► parseExcel ──► Zustand store (pallets[]). Note that Zustand store is the main area for state management.
product master  ──► parseProductMaster ──► dims/flags lookup ──┘

        Pack button
            │  runPacker(): flatten pallets → BoxIn[] (+ dimension buffer)
            ▼
POST /api/optimize/stream  ── SSE progress ──► PackingProgressModal
            │
   optimizer.py: try container combos cheapest-first
            │  packer = REGISTRY[algorithm]      (algo1)
            ▼
   guillotine engine: depth-first placement, gravity, support,
   reachability → flat cap + staircase re-pack on last container
            │
            ▼
placements (topologically sorted) ──► InstancedCartons (R3F + GSAP)
            │                              │
            ▼                              ▼
   Excel / HTML exports            animated 3D load plan
```

- **Frontend:** React 19 + Vite + TypeScript, React Three Fiber for 3D, GSAP for the load animation, Zustand for state, Tailwind for styling.
- **Backend:** Python + FastAPI; pure-Python packing algorithms (no numpy dependency in the hot path).
- **Distribution:** PyInstaller onefile exe that serves the built frontend and self-terminates when the browser closes.

---

## 2. Setup / Getting Started

### Prerequisites
- **Python 3.11** (repo venv uses 3.11.5)
- **Node.js + npm** (any recent LTS; not pinned in the repo — flag: no `engines` field)
- Windows for the exe packaging path (PyInstaller spec is Windows-oriented); dev works anywhere

### Install
```bash
cd backend  && pip install -r requirements.txt     # fastapi, uvicorn[standard]
cd frontend && npm install                         # note: xlsx comes from the SheetJS CDN tarball, not the npm registry
```

### Run locally (dev)
```bash
# Terminal 1 — backend
cd backend
uvicorn main:app --reload --port 8000 --timeout-graceful-shutdown 3

# Terminal 2 — frontend
cd frontend
npm run dev        # http://localhost:5173 — Vite proxies /api → :8000
```
Or `start.bat` (launches both + opens the browser). No env vars are required.

> The `--timeout-graceful-shutdown 3` flag matters: the UI holds a permanent SSE connection (`/api/keepalive`), and without the flag uvicorn's reload can hang waiting for it to close → 502s from the Vite proxy.

### Build the executable
```bat
build-exe.bat      # repo root → backend\dist\main.exe (~38 MB)
```
Steps: `npm run build` → copy `frontend/dist` → `backend/frontend_dist` → `pyinstaller main.spec`. Double-click the exe: serves everything on `http://127.0.0.1:8000`, opens the browser, exits itself ~15 s after the last app tab closes.

### Run tests
```bash
cd backend
python -m packing_algos.algo_v1.test_characterize            # check against pinned baseline
python -m packing_algos.algo_v1.test_characterize --freeze   # re-pin after an INTENDED behavior change
```
Plain-assert snapshot harness (no pytest). 7 scenarios pin exact placements. There are no frontend unit tests; `npm run build` (tsc + vite) and `npm run lint` are the frontend gates.

---

## 3. Structure

```
├── build-exe.bat / start.bat        # packaging / dev launcher
├── docker-compose.yml               # containerized dev (frontend 5173 + backend 8000)
├── CLAUDE.md / CODEBASE.md          # deep docs
├── scripts/generate-test-sheets.mjs # generates Excel import test fixtures
├── backend/
│   ├── main.py                      # FastAPI app + endpoints + exe lifecycle
│   ├── schema.py                    # the entire API contract (Pydantic)
│   ├── main.spec                    # PyInstaller onefile spec
│   └── packing_algos/
│       ├── optimizer.py             # container-combination search
│       ├── registry.py              # algorithm key → packer fn (only "algo1")
│       ├── scorer.py                # fragmentation diagnostic (console)
│       └── algo_v1/                 # THE packing algorithm (package)
│           ├── ordering.py          # size-first ordering + run_algo1 entry point
│           ├── helper.py            # spaces, split, support, reach, scorer, topo sort
│           ├── engine.py            # placement loop + flat/staircase finisher
│           ├── common.py            # orientations, gravity, AABB overlap
│           ├── trace.py             # step-trace for the visualizer
│           └── test_characterize.py # snapshot tests (+ _baseline.json)
└── frontend/src/
    ├── main.tsx / App.tsx           # entry + root layout
    ├── store/                       # Zustand slices (container/carton/pallet/packing/ui)
    ├── lib/                         # api, excel import/export, exportFolder, colors, …
    └── components/
        ├── 3d/                      # Canvas, ContainerMesh/Manager, InstancedCartons, …
        └── ui/                      # Sidebar + all panels/dialogs/controls
```

**Where to look for X:**

| X | Location |
|---|---|
| Core packing algorithm | `backend/packing_algos/algo_v1/engine.py` (+ `helper.py`, `ordering.py`) |
| Placement rules (support/reach) | `algo_v1/helper.py::_is_fully_supported`, `_is_reachable` |
| Staircase / flat re-pack | `algo_v1/engine.py::_flat_repack_search`, `_staircase_repack_search` |
| Container presets & costs | `backend/packing_algos/optimizer.py::_TYPES` (source of truth) |
| API routes | `backend/main.py` |
| API request/response shapes | `backend/schema.py` |
| Excel parsing / round-trip | `frontend/src/lib/excelImport.ts` / `excelExport.ts` |
| 3D animation core | `frontend/src/components/3d/InstancedCartons.tsx` |
| App state | `frontend/src/store/*.ts` (one combined store) |
| Sidebar UI wiring | `frontend/src/components/ui/Sidebar.tsx` |

---

## 4. Core Concepts / Modules

### Domain model
- **Carton** `{ id, label, productCode?, w, h, d, quantity, rotationAllowed, stacking }` — the packing unit. `id` must be globally unique (`${palletId}-${product}` on import) because it keys cartonId→pallet maps everywhere; `productCode` is display/coloring only.
- **Pallet** `{ id, label, cartons[] }` — a logical shipment unit. Backend identity = `colorIndex` (pallet index).
- **Axis convention:** `w`=X (width), `h`=Y (height), `d`=Z (depth; z=0 back wall, z=d door). All cm.

### Guillotine engine (`backend/packing_algos/algo_v1/`)
Responsible for placing carton instances into one or more containers.
- Free space = list of non-overlapping cuboids (`_Space`); each placement splits its host space into Front/Right/Above children (cut order `"front"` or `"above"`).
- Per carton: try **every space × every allowed orientation**, gravity-settle, filter (fit, ≥90% base support, worker reachability, optional height ceiling), pick lowest score `(pz, py, px)` — deepest, lowest, leftmost. Greedy: no backtracking.
- Between pallets, free spaces are **coalesced** (`_merge_spaces`) so the next pallet packs at its own grid pitch.
- Placements are re-ordered by a topological sort (supporter before supported) into a physically valid, pallet-grouped animation order.
- **Last-container finisher** (skipped when `lashing=True`): phase 1 finds the shortest uniform height cap that still fits everything (gallop + binary search); phase 2 keeps that cap and finds the earliest stair-plateau so the load front descends one layer per step (`_StairCeiling` envelope — a placement *constraint*, so it composes with all rules). Worst case = flat cap; never worse.
- **Gotchas:**
  - Reachability blocks candidates >50 cm behind same-lane cargo that is *not entirely above* them (walls **and** lower steps) — this is what prevents boxes landing on top of a finished ridge.
  - Feasibility-vs-cap monotonicity ("more headroom never places fewer") is an assumption of both searches — holds for this scorer, but a custom scorer could break it.
  - Behavior is pinned by `test_characterize.py`; run it before/after engine changes and only `--freeze` intentionally.

### algo1 (`backend/packing_algos/algo_v1/ordering.py`)
Ordering layer on top of the engine (engine unchanged), public entry point `run_algo1`: biggest pallets first (dominant-carton volume), biggest cartons first within a pallet, same-product pallets contiguous, non-stackable pallets last. Single-entry strategy menu; `best_ordering` machinery kept for re-adding multi-start strategies. It is the only registered algorithm — the legacy `guillotine` packer (volume-desc single pass) was removed 2026-07 (git history has it); unknown algorithm keys return HTTP 400.

### Optimizer (`backend/packing_algos/optimizer.py`)
Enumerates `(n20, n40)` combos under `MAX_COST = 10` sorted by `(cost, total, n20)`, volume-pre-checks, packs each with the selected packer, returns the first fully-packed combo (else the best partial).

### Frontend state (`store/`)
One combined Zustand store, five slices. Rule: the store is the single source of truth — no duplicated local state. `containers` is written only from optimizer results; `containerFocusKey` increments per click so re-clicking re-zooms the camera.

### 3D rendering (`components/3d/`)
- `InstancedCartons` is the hot path: one `InstancedMesh` per `cartonId + placed-dims` group (**required** for 60 fps), one GSAP tween driving a single `progress` clock 0→N; every visual (positions, seq labels, pallet-ID labels, edge outlines, rotation planes) derives from that number inside `useFrame`.
- Colors are **product-based** (`buildProductColorMap`) — same product = same color across pallets; pallet identity is shown by the top-face pallet-ID label instead.

### Excel round-trip (`lib/excelImport.ts` / `excelExport.ts`)
Exported plans are re-importable: the pick-list sheet name (`COPY EXCEL PICK LIST HERE`) and headers deliberately match the import regexes, and pack settings (Dimension Buffer %, Lashing) ride on the Summary sheet as label/value rows. Plain PSA pick lists (no Summary sheet) import without touching the toggles.

### Export destination (`lib/exportFolder.ts`)
File System Access API (Chrome/Edge only): folder picked once, `FileSystemDirectoryHandle` persisted in IndexedDB (handles are not JSON-serializable — localStorage can't hold them), write permission re-confirmed inside the Export click gesture. Unsupported browsers fall back to a normal download.

### Exe lifecycle (`backend/main.py`)
Each app tab holds an SSE connection to `/api/keepalive`; a watchdog thread (started only when `sys.frozen`) exits the process after 15 s with zero connections (120 s startup grace). `console=False` builds need the `sys.stdout is None` guard + `log_config=None` or uvicorn's logging setup crashes.

---

## 5. API / Interfaces

### HTTP endpoints (`backend/main.py`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness → `{"status": "ok"}` |
| POST | `/api/optimize` | pack synchronously → `OptimizeResponse` |
| POST | `/api/optimize/stream` | same, as SSE with live progress (what the UI uses) |
| POST | `/api/trace` | step-by-step placement trace for the visualizer |
| GET | `/api/keepalive` | SSE ping stream; exe self-exit watchdog counts these |
| GET | `/` | static frontend (`frontend_dist`), packaged builds |

### Shapes (`backend/schema.py`, abridged)
```python
OptimizeRequest  { boxes: BoxIn[], available_types: ['20ft'|'40ft', ...],
                   algorithm: str = "algo1", lashing: bool = False }
BoxIn            { id, label, w, h, d, quantity, colorIndex,
                   rotationAllowed = True, stacking = True }          # cm
OptimizeResponse { containers: ContainerResult[], containers_used: ContainerUsed[],
                   total_cost: float, container_summary: str, all_packed: bool }
ContainerResult  { containerId, placements: PlacementOut[],           # sorted into animation order
                   utilization: 0.0–1.0, flatApplied: bool }
PlacementOut     { boxId, x, y, z, w, h, d }                          # placed (post-rotation) dims
TraceRequest     { boxes, containers?: ContainerIn[],                 # None → single 20ft
                   algorithm = "algo1", lashing = False }
```

### SSE event protocol (`/api/optimize/stream`)
```jsonc
{"type": "progress", "placed": 130, "total": 500, "pct": 21}  // pct bands: 0–82 place, 83–96 re-pack, 97 finalise
{"type": "result",   "data": { /* OptimizeResponse */ }}
{"type": "error",    "message": "..."}
```

### Key frontend exports (`lib/`)
```ts
apiOptimize(boxes, types, algo, lashing, onProgress?) → Promise<PackingApiResult>  // consumes the SSE
parseExcel(file) → Promise<{ pallets: Pallet[], settings: ImportedSettings }>
exportLoadPlan(result, pallets, containers, cost, allPacked, importName, folder, buffer, lashing) → Promise<string|null>
pickExportFolder() / restoreExportFolder() / ensureWritePermission(handle) / writeToFolder(handle, name, bytes)
buildProductColorMap(pallets) → Map<productName, hexColor>
```

### Error-handling conventions
- Backend: `HTTPException` with a user-facing `detail` (400 for bad input / unknown algorithm key); stream failures become `{"type":"error"}` events.
- Frontend: `api.ts` wraps every failure in `PackError` with a display-ready message ("Backend unreachable — is the server running?"); UI components render errors inline (red text under the triggering control), never as alerts.
- Parsers (`parseExcel`, `parseProductMaster`) reject with `Error` whose message is shown verbatim in the Sidebar; invalid rows are silently skipped rather than fatal.

---

## 6. Coding Conventions

- **TypeScript everywhere** on the frontend; typed domain objects (`Pallet`, `Carton`, `Container`, `Placement`, `PackingResult`). `tsc -b` must pass clean.
- **File docblocks:** every file opens with a `filename.ts — purpose` comment listing its exports; exported functions carry JSDoc/docstrings. Comments explain *why*, not *what*; magic numbers become named constants (`REACH_LIMIT_CM`, `_SUPPORT_RATIO`, `SLICE_Z_TOL`).
- **Python:** module docstrings with "HOW IT WORKS" sections for algorithm files; `_underscore` prefix = module-private; `from __future__ import annotations`; plain asserts for tests (no pytest dependency).
- **State discipline:** Zustand is the single source of truth; components own only transient UI state (loading/error/drag). Prefer less state complexity when approaches are equivalent.
- **Components:** small, single-responsibility; shared chrome extracted (`Section`); dialogs use Radix.
- **3D:** `InstancedMesh` for anything ×N; deterministic colors; all animation derives from the one GSAP `progress` clock.
- **Backend changes to the engine** must keep `test_characterize.py` green (or consciously re-freeze); new algorithms go through `registry.py`, never inline in the endpoint.
- **Naming:** camelCase TS, snake_case Python, kebab-case for multi-word files is *not* used — components are PascalCase `.tsx`, libs are camelCase `.ts`.
- `// TODO:` marks known shortcuts.

### Known cosmetic drift (documented, intentional backlog)
- `ContainerTypeSelector` shows `1203 × 235 × 269`, `mockPacker.ts` uses `1203 × 235 × 239` for the 40ft — backend's `1202 × 235 × 269` is authoritative; display/mock only.

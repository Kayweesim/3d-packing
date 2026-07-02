# 3D Container Packing Visualiser — Research Report

**Author:** Kay Wee Sim
**Date:** June 2026

---

## Abstract

This report presents the design, development, and evaluation of a web-based 3D container packing visualiser targeting logistics professionals. The system accepts a structured Excel manifest of goods organised into pallets and cartons, automatically determines the optimal combination of shipping containers, and produces an animated, interactive three-dimensional load plan. The core contribution is a practical implementation of a 3D guillotine bin-packing algorithm with per-pallet spatial separation, gravity settling, and full-support constraints — packaged inside a modern full-stack web application deployable via Docker. The system demonstrates that a heuristic-based approach can produce feasible, physically valid load plans for real logistics workloads without the cost or complexity of commercial optimisation software.

---

## 1. Introduction

Container loading — the process of deciding how to arrange goods inside a shipping container — is a problem faced daily by logistics operators, freight forwarders, and warehouse managers. A poorly arranged container wastes space, increases shipping costs, and can lead to unsafe loads where boxes collapse or cannot be reached during unloading.

In practice, load planning is often done manually or with basic spreadsheet tools, relying heavily on the experience of the planner. Commercial software solutions exist but are expensive, require specialised training, and are typically desktop-bound — making them impractical for on-site use.

This project addresses the gap by building a free, self-hosted, browser-accessible tool that:

1. Accepts existing Excel pick lists with minimal reformatting
2. Automatically selects the cheapest container configuration that fits all goods
3. Produces a physically valid 3D packing arrangement
4. Animates the load plan carton by carton so operators can follow the sequence on site
5. Exports the result back to Excel for documentation and handover

---

## 2. Problem Statement

### 2.1 The Bin Packing Problem

At its core, container loading is a variant of the **3D Bin Packing Problem (3D-BPP)** — given a set of rectangular boxes with fixed dimensions, pack them into the minimum number of fixed-size bins such that no two boxes overlap and all boxes remain within the bin boundaries.

3D-BPP is classified as NP-hard, meaning there is no known algorithm that can find the provably optimal solution in reasonable time for large inputs. In practice, heuristic and approximation algorithms are used, trading off solution quality for speed.

### 2.2 Additional Real-World Constraints

Standard 3D-BPP does not capture the full complexity of real container loading. This system handles several additional constraints:

- **Gravity:** boxes cannot float — each box must rest on the container floor or on top of another box
- **Full support:** a box placed above floor level must have its entire bottom face supported by boxes beneath it, preventing tipping
- **Rotation:** some items may be rotated to fit (e.g. a long narrow box turned on its side); others must remain upright (fragile goods, labelled faces)
- **Stacking restrictions:** some items must not have other items placed on top of them (e.g. crushable packaging)
- **Pallet grouping:** goods are organised into pallets, and each pallet must be packed as a contiguous unit to preserve loading sequence and traceability
- **Container cost:** 20ft and 40ft containers have different costs; the system selects the cheapest combination rather than simply using the largest available

---

## 3. System Overview

The system consists of two components: a React-based frontend and a Python-based backend, communicating via a REST API.

### 3.1 User Workflow

1. The user selects which container types are available (20ft TEU, 40ft FEU, or both)
2. The user imports an Excel pick list — the system parses pallet IDs, product codes, quantities, and dimensions automatically
3. The user clicks **Pack** — the frontend sends the data to the backend, which runs the optimiser and returns a packing result
4. The result is visualised in an interactive 3D scene — cartons animate into the container one by one in loading sequence
5. The user can scrub through the animation, jump to specific pallets, and inspect utilisation statistics
6. The result can be exported back to Excel as a formal load plan with sequence numbers, positions, and rotation flags

### 3.2 Container Types

| Type | Label | Width | Height | Depth | Relative Cost |
|---|---|---|---|---|---|
| 20ft | 20ft TEU | 235 cm | 239 cm | 589 cm | 1.0 unit |
| 40ft | 40ft FEU | 235 cm | 269 cm | 1,202 cm | 1.5 units |

The system can select any combination of these types up to a maximum cost of 10 units (equivalent to ten 20ft containers). The optimiser always tries the cheapest combination first.

---

## 4. Technical Architecture

```
┌─────────────────────────────────┐     HTTP/JSON      ┌───────────────────────┐
│           Frontend              │ ──────────────────► │       Backend         │
│   React 19 + Vite (TypeScript)  │                     │   Python + FastAPI    │
│   React Three Fiber (3D)        │ ◄────────────────── │   Guillotine Packer   │
│   GSAP (animation)              │                     │   Container Optimiser │
│   Zustand (state)               │                     └───────────────────────┘
│   Tailwind CSS + shadcn/ui      │
└─────────────────────────────────┘
```

The frontend handles all user interaction, 3D rendering, animation, and Excel import/export. The backend is responsible solely for the packing computation — it receives a list of carton types with quantities and constraints, and returns the positions of every placed carton.

Both services run inside Docker containers and are orchestrated with Docker Compose, making the system straightforward to deploy on any machine.

### 4.1 Data Model

The fundamental unit is a **carton** — a rectangular box described by width, height, and depth in centimetres, with a quantity and two optional constraint flags:

- `rotationAllowed` — whether the packer may rotate the carton to a different orientation
- `stacking` — whether other cartons may be placed on top of this one

Cartons are grouped into **pallets**, which represent a logical shipment unit (e.g. all goods from one supplier or one pick list line). Pallet order is preserved throughout — the system packs pallets in the sequence they appear in the Excel sheet, reflecting real-world pick list order.

### 4.2 Axis Convention

All dimensions follow a consistent right-handed coordinate system:

- **X axis (W):** cross-section width — left to right facing the container door
- **Y axis (H):** height — floor to ceiling
- **Z axis (D):** depth — back wall (`z=0`) to door (`z=d`)

Cartons are always loaded from the door inward, and the animation reflects this — cartons slide in from outside the door to their final resting position.

---

## 5. Algorithm Design

### 5.1 Container Selection (Optimiser)

Before packing begins, the system must decide which containers to use. This is handled by a **combination search** in `optimizer.py`:

1. All valid `(n_20ft, n_40ft)` combinations within the cost cap are generated
2. Combinations are sorted by total cost (ascending), then by number of containers (fewer is better), then by preference for 40ft over 20ft at equal cost
3. Each combination is tried in order — a volume pre-check skips any combination where the total box volume already exceeds total container volume
4. The first combination that fits all cartons is returned; if none fully fits, the one that placed the most cartons is returned as a best-effort result

### 5.2 Packing Algorithm (3D Guillotine)

The packing algorithm is a **3D Free-Space Guillotine Packer** implemented in `guillotine.py`. The key idea is to maintain a list of free rectangular regions inside the container, and for each carton find the best available region to place it in.

#### Free Space Management

The container starts as a single free space equal to its full interior. When a carton is placed in a free space, that space is split into up to three non-overlapping sub-spaces using guillotine cuts:

- **Front:** the remaining depth in front of the placed carton, at full parent width
- **Right-in-back:** the space to the right of the carton within its depth slice
- **Above:** the space directly above the carton within its depth slice

The critical design choice is **Front-first cutting** — the Front sub-space inherits the full width of the parent space. This ensures that subsequent pallets always have a wide, unobstructed entry zone rather than a collection of narrow strips left over from previous cuttings.

#### Placement Scoring

For each carton, every combination of free space and allowed orientation is evaluated. Candidates are scored by `(z, y, x)` — depth first, then height, then lateral position. This produces a **depth-first** fill pattern where each z-slice fills completely before advancing toward the door, which mirrors the natural loading sequence.

#### Gravity and Support

Every candidate placement is subject to two physical constraints:

- **Gravity settling:** the carton drops to the highest surface directly below its footprint. It never floats.
- **Full support:** if the carton is above floor level, its entire bottom face must be covered by the top faces of already-placed cartons. A carton resting on only a corner or edge is rejected.

#### Per-Pallet Spatial Separation

Pallets are packed sequentially. After each pallet is fully placed, the algorithm computes the **z-frontier** — the furthest depth reached by any carton in that pallet. The free space list is then restructured:

- Floor-level gaps beside the current pallet's cartons are discarded (they are beside the already-loaded pallet and would interleave pallets spatially)
- Above spaces (vertical gaps on top of current pallet's cartons) are kept, as the next pallet can stack on top
- A single clean Front space is added starting at the z-frontier, giving the next pallet a full-width entry zone

This guarantees that each pallet occupies its own depth zone in the container, preserving the pick list sequence in the physical load.

#### Animation Ordering (Topological Sort)

Once all cartons are placed, their positions are reordered for animation using **Kahn's topological sort** on the support graph — if carton A supports carton B, A must animate before B. Within each valid ordering, cartons are sorted by pallet group first (preserving pick list sequence) and then back-to-front within each group, so the animation mirrors the physical loading action.

### 5.3 Complexity and Performance

The guillotine algorithm is not guaranteed to find the optimal packing — it is a heuristic. Its main strengths are:

- **Speed:** the depth-first scoring and free-space list structure mean it runs in milliseconds for typical logistics payloads (tens to hundreds of cartons)
- **Physical validity:** the gravity and full-support constraints ensure every output plan is physically executable
- **Predictability:** the deterministic pallet-order and depth-first fill mean the output is consistent and auditable

---

## 6. Key Features

### 6.1 Excel Import

The system parses `.xlsx`, `.xls`, and `.csv` files using the SheetJS library. Column headers are matched case-insensitively using regular expressions, so the system tolerates minor variations in column naming without requiring the user to reformat their pick list. Required columns are Pallet ID, Product Code, and Qty to Pick; Width, Height, and Depth are optional (defaulting to 25 cm if absent).

### 6.2 Interactive 3D Visualisation

The 3D scene is rendered using React Three Fiber (a React wrapper around the Three.js WebGL library). Key rendering decisions:

- **Instanced rendering:** all cartons of the same type and orientation are rendered as a single GPU draw call using `InstancedMesh`, enabling smooth performance at 60fps even with hundreds of cartons
- **Deterministic colour palette:** each pallet is assigned a colour from a fixed 16-colour palette based on its position in the pick list, ensuring consistent visual identity across re-packs
- **Rotation indicators:** cartons that were rotated from their original orientation display a lighter-coloured top face and an arrow indicating the original top of the box
- **Sequence numbers:** every carton displays its load sequence number on its top face once it lands, matching the numbers in the Excel export

### 6.3 Playback Controls

The animation is driven by a GSAP timeline, giving frame-accurate control over playback:

- Play, pause, and replay
- Scrub bar for seeking to any point in the animation
- Speed control (0.5×, 1×, 2×)
- Per-pallet checkpoint markers on the scrub bar — clicking jumps directly to the first carton of that pallet

### 6.4 Multi-Container Support

When goods overflow a single container, the system automatically selects additional containers. Each container is rendered side by side in the 3D scene; clicking a container focuses the camera on it. The sequence numbers and Excel export are continuous across containers.

### 6.5 Excel Export

The load plan can be exported as a structured `.xlsx` file with:

- A summary sheet listing each container, its carton count, and utilisation percentage
- One detailed sheet per container, with each row representing one placed carton — sequence number, pallet ID, product code, position (X/Y/Z in cm), placed dimensions, and whether the carton was rotated

---

## 7. Testing and Validation

Eight preloaded test cases cover the primary packing scenarios:

| # | Scenario | What it validates |
|---|---|---|
| 1 | Uniform cubes, single pallet | Clean depth-first grid fill |
| 2 | Wide boxes leaving a side gap | Cross-pallet gap filling behaviour |
| 3 | Non-stackable cartons | Single floor layer, nothing placed on top |
| 4 | Stackable vs non-stackable contrast | Visual A/B comparison of stacking behaviour |
| 5 | Low pallet with headroom for next pallet | Cross-pallet stacking via kept Above spaces |
| 6 | Forced rotation | Cartons that only fit when rotated |
| 7 | Extreme density with narrow remaining gap | Unreachability edge case |
| 8 | Overflow to second container | Sequence number continuity across containers |

Each test case runs through the full pipeline — the same API call, the same animation, the same export — so test results are directly comparable to production behaviour.

---

## 8. Limitations and Future Work

### 8.1 Current Limitations

**Floor-level side gaps:** When a pallet's cartons do not fill the full container width, the floor-level gap beside them is discarded after that pallet is placed. This is conservative — the gap is physically accessible from the door — and results in wasted space in some configurations.

**Fixed pallet ordering:** The system packs pallets strictly in the order they appear in the Excel sheet. There is no heuristic to determine whether a different pallet order would produce a better overall packing. Reordering pallets to improve utilisation currently requires editing the Excel sheet and re-importing.

**40ft dimension label mismatch:** The 40ft container display label in the UI still references outdated dimensions; the backend uses the correct high-cube specification (`1,202 × 235 × 269 cm`).

**Stale export after re-import:** If a user imports a new Excel sheet after packing without re-packing, the export will reflect the new pallet data rather than the packing result currently displayed.

### 8.2 Future Work

**Pallet order optimisation:** Implementing a look-ahead greedy or beam search approach to evaluate different pallet orderings before committing would improve container utilisation, particularly for shipments with mixed pallet sizes.

**Reachability modelling:** A more precise reachability model — discarding only spaces whose front face is blocked by placed cartons, rather than all floor-level side spaces — would recover wasted space while preserving physical validity.

**Mobile interface:** A responsive layout optimised for on-site tablet and smartphone use would make the visualiser accessible directly at the loading dock without requiring a laptop.

**Real-world data validation:** Further testing with actual logistics data — real pallet manifests from live shipments — is needed to validate that the algorithm produces consistently feasible load plans under production conditions and to identify any edge cases not covered by the existing test suite.

**Partial rotation constraints:** The current model allows either all six orientations or only the original one. A finer constraint (e.g. "may rotate around the vertical axis but not tip on its side") would be more representative of real fragile goods handling.

---

## 9. Conclusion

This project demonstrates that a heuristic 3D bin-packing system with physical validity constraints can be built and deployed as a practical web application without reliance on external paid APIs or commercial optimisation libraries. The guillotine algorithm, combined with gravity settling, full-support enforcement, and per-pallet spatial separation, produces load plans that are both space-efficient and physically executable for typical logistics workloads.

The interactive 3D visualisation and animated load sequence close the gap between the abstract output of an optimisation algorithm and the practical needs of a warehouse operator — making the result interpretable and usable directly on site. The Excel import and export integration minimises friction for users who already work with pick lists in spreadsheet form.

The system is ready for real-world stress testing with live logistics data, with the improvements identified above — particularly pallet order optimisation and reachability modelling — representing the clearest paths to further improving packing quality.

---

## Appendix: Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend framework | React 19 + Vite + TypeScript | UI components and build tooling |
| 3D rendering | React Three Fiber + Three.js | WebGL-based 3D scene |
| Animation | GSAP | Timeline-based carton entry animation |
| Styling | Tailwind CSS + shadcn/ui | Responsive UI components |
| State management | Zustand | Client-side application state |
| Backend framework | Python + FastAPI | REST API and packing computation |
| Excel I/O | SheetJS (frontend) | Import and export of `.xlsx` files |
| Containerisation | Docker + Docker Compose | Reproducible deployment |

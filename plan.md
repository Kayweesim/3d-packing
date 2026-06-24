# Plan — Optimal Pallet Sequencing

## Goal
Today the packer is **constrained to the Excel pallet order** (pick sequence). We want it to
**choose the pallet order** that packs best, while keeping everything else fixed:
- Cartons *within* a pallet stay as-is (same grouping, same volume-descending order).
- All constraints unchanged: rotation, stacking, full-support, reachability, z-frontier
  separation, flat last-container / lashing, container selection.

The **only new degree of freedom is the order in which whole pallets are loaded.** The chosen
order becomes the load/animation sequence the teams follow.

---

## Current behavior (what constrains us)
- `engine.build_groups(boxes)` returns one list per pallet, ordered by `colorIndex` ascending
  (= Excel pick order), cartons volume-desc within each group.
- `engine.pack_into_containers` packs groups **in the given order**, container by container.
- `helper._topological_sort` sets the animation/return order; its primary tie-break key is
  **`colorIndex`** — so pallet N always animates before pallet N+1.
- `colorIndex` currently does **double duty**: (a) the pallet's *color/identity*, and
  (b) its *load order*. This coupling is what blocks reordering.
- Frontend (`packingSlice.runPacker`) stamps `colorIndex = palletIndex`, derives pallet
  boundaries by **walking the returned placement order** (not by colorIndex value), and colors
  cartons via `getCartonColor(palletIndex)`.

Key consequence: because boundaries follow the **returned placement order**, if the backend
returns placements in a new optimal order, the ActivePalletPanel, PlaybackControls checkpoints,
and Excel Seq # all reflect the new sequence automatically — **provided the topological sort
returns them in that order.**

---

## Design overview

### 1. Decouple "color/identity" from "load sequence" in the engine  *(enabler, small change)*
Introduce a **sequence rank** separate from `colorIndex`:
- `colorIndex` → keeps meaning *color + pallet identity only*.
- **load sequence** → the position of a pallet in the order handed to `pack_into_containers`.

Implementation (no instance mutation, preserves `pack_into_containers` purity):
- In `pack_into_containers`, derive a map from the order of the groups it receives:
  ```
  seq_of = { group[0]["colorIndex"]: rank for rank, group in enumerate(ordered_groups) }
  ```
  (each group is exactly one pallet → one colorIndex).
- Pass `seq_of` into `_topological_sort`; change its tie-break from `colorIndex` to
  `seq_of[colorIndex]`:
  ```
  (seq_of.get(colorIndex, colorIndex), centre_z, y, x)
  ```
- **No regression:** for `guillotine`/`algo2`/`algo3`, `build_groups` already yields
  colorIndex order, so `seq_of[colorIndex] == colorIndex rank` → identical ordering to today.

This is the only engine change required. It makes "return placements in the chosen pallet
order" possible while keeping colors stable per original pallet.

### 2. New search over pallet order  *(reuses the engine, mirrors metaheuristic.py)*
A new packer that searches **permutations of the group list**, decoding each through the same
`pack_into_containers`:
- **Baseline** = original Excel order (so it can never do worse than `guillotine`).
- **Optional constructive start**: sort pallets by total volume (or footprint) descending for a
  stronger seed before local search.
- **Iterated local search (greedy accept)**, reusing the existing scaffold:
  - perturbation = **reorder pallets** (swap two pallets, and/or "or-opt" move one pallet to a
    new position) — analogous to `metaheuristic._perturb` but on the outer list, not within a
    group.
  - objective = existing `_objective` = `(total_placed, total_util)`.
  - fixed RNG seed; bounded `max_iters` + wall-clock budget (same pattern as algo2/algo3).
- Within-pallet carton order is **left untouched** (per requirement).

### 3. Registry + frontend wiring
- Register as a **new algorithm key** (e.g. `"palletseq"`), one `REGISTRY` entry, matching the
  "add a `run_*`, register it" convention. No change to optimizer/endpoint dispatch.
- Frontend: add the key to `AlgoId` (uiSlice), add one Sidebar algorithm button. Everything
  downstream (boundaries, panel, export) already keys off returned order — **no other frontend
  change needed.**

---

## Detailed changes by file

**backend/algorithms/guillotine/helper.py**
- `_topological_sort(placed)` → `_topological_sort(placed, seq_of)`: tie-break uses
  `seq_of.get(p["colorIndex"], p["colorIndex"])` as the primary key (then centre_z, y, x).

**backend/algorithms/guillotine/engine.py**
- `pack_into_containers`: build `seq_of` from the order of `ordered_groups`; pass it to every
  `_topological_sort` call in Pass 2. (The flat re-pack is unaffected — `seq_of` is global by
  colorIndex.)
- Export nothing new beyond what's already public.

**backend/algorithms/palletsequence.py**  *(new — or extend metaheuristic.py)*
- `run_pallet_search(containers, boxes, lashing=False)`:
  - `groups = build_groups(boxes)` (baseline), pack, score with `_objective`.
  - ILS loop perturbing **group order**, greedy-accept, seeded, budgeted.
  - return best results.
- Reuse `_objective`; factor a shared `_objective`/ILS helper out of `metaheuristic.py` if it
  keeps things DRY (no duplicate functions).

**backend/algorithms/registry.py**
- Import `run_pallet_search`; add `"palletseq": run_pallet_search`.

**frontend/src/store/uiSlice.ts**
- Add `"palletseq"` to the `AlgoId` union.

**frontend/src/components/ui/Sidebar.tsx**
- Add one algorithm button for the new key (icon + neon color + title).

---

## Animation / boundaries / export correctness
- `_topological_sort` now returns placements in **chosen-sequence** order → frontend boundaries
  (walk of returned order) reflect the new load sequence automatically.
- `getCartonColor(palletIndex)` still colors by **original** pallet → colors stay stable and
  recognizable regardless of load order (desirable).
- Excel "Seq #" (global returned order) and PlaybackControls checkpoints follow the new
  sequence with no extra work.
- Physical realism holds: the engine still packs group-by-group into the advancing z-frontier,
  so earlier-sequence pallets sit further back; ordering animation by `(seq, centre_z, …)` keeps
  it back-to-front and reachable, and support edges still force supporter-before-supported.

---

## Scalability & performance
- The real picklist has ~266 pallets → full permutation (N!) is impossible; **only local search
  + a constructive seed**, never exhaustive.
- Cost compounds: the optimizer calls the packer **once per container combo**, and the packer
  now searches internally. Mitigations:
  - Strict `max_iters` + wall-clock budget per invocation (mirror algo2/algo3 budgets; expose a
    light/deep ladder if useful).
  - For very large inputs, fall back to the **constructive heuristic only** (no ILS) above a
    pallet-count threshold.
  - Keep `pack_into_containers` pure so candidates re-decode cheaply (already true).

---

## Testing
- Add a `testCases.ts` case where Excel order packs poorly but a reorder fits everything or
  raises utilization (e.g. small / huge / small pallets that interleave badly in pick order but
  pack densely big-first).
- Backend parity checks:
  - `guillotine`/`algo2`/`algo3` outputs **unchanged** after the `seq_of` refactor (counts,
    flatApplied, utilization, placement order).
  - `palletseq` objective ≥ `guillotine` objective on the same input (never worse).
  - Colors remain tied to original pallets while boundaries follow the new order.

---

## Risks & open questions
1. **Confirm intent:** the optimized order becomes the **actual loading sequence** the teams
   follow (not just an internal packing trick with original order displayed). Plan assumes yes.
2. **Performance on 266 pallets** — needs the budget caps / constructive-only fallback above;
   validate against the real picklist before shipping.
3. **Opt-in vs default** — plan keeps it a **separate algorithm** (opt-in button), so existing
   behavior is preserved and selectable. Could later be promoted to default if validated.
4. **Lashing/flat interaction** — unchanged by design (flat re-pack runs after the chosen order
   packs); confirm in tests.

---

## Task checklist (phased)
- [ ] **Phase 1 (enabler):** add `seq_of` in `pack_into_containers`; thread into
      `_topological_sort`. Verify byte-for-byte parity on existing algos.
- [ ] **Phase 2 (search):** implement `run_pallet_search` (baseline + constructive seed + ILS),
      reusing `_objective`/ILS scaffold.
- [ ] **Phase 3 (wiring):** registry entry; `AlgoId` + Sidebar button.
- [ ] **Phase 4 (perf):** budgets + large-input fallback; benchmark on the real picklist.
- [ ] **Phase 5 (tests):** new test case + parity/never-worse assertions.

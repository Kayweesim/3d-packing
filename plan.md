# Plan — Tighter Packing via Deterministic Heuristics

## Goal
Close the gaps that open up between pallets (and wherever box sizes change), using
**deterministic, structural** heuristics — *no random perturbation*. Same cartons, same pallet
membership, same constraints (rotation, stacking, full-support, reachability, z-frontier, flat /
lashing, container selection). The only things we change are:
1. the **order boxes are considered** — within a pallet (Lever A) and across pallets (Lever B);
2. an optional **support-contact buffer** (Lever C).

> Note on the earlier "cartons within a pallet stay as-is" rule: changing the *consideration
> order* of cartons is **not** changing which cartons exist, their dims, quantities, or pallet
> membership — only the sequence they're placed in. This is the exact freedom `algo2`/`algo3`
> already exploit via random search; Lever A is the **principled, deterministic** version of it.

---

## Root cause of the gaps
1. **Volume-descending within-pallet sort → jagged skyline.** Sorting by `w*h*d` interleaves a
   short-wide box before a tall-narrow one, so the top surface a pallet leaves is uneven.
2. **Full-support is all-or-nothing.** `helper._is_fully_supported` rejects any carton at `py>0`
   unless its *entire* bottom face is covered (`covered ≥ bw*bd - _EPS`). A few mm of mismatch in
   the layer below → no placement → wasted vertical space.
3. **Cross-pallet stacking flows only through kept "Above" shelves.** After a pallet finishes the
   engine discards floor spaces inside the z-frontier but keeps the Above spaces. Pallet N leaves
   a shelf at height = its carton height; pallet N+1 can use it **only if its cartons share that
   height** (coplanar tops pass full-support) and tile the same footprint. The pick order
   interleaves heights, so shelves rarely line up → each pallet opens a fresh z-band.

The fix is to make the surfaces **flat and coplanar** so the support check passes naturally —
structurally, not by loosening physics.

---

## Lever A — Within-pallet Height-First sort  *(primary, ship first)*
Replace the volume-descending sort inside each pallet with **height-descending, base-area
tie-break**. Considering equal-height boxes together makes the engine fill each height tier
side-by-side on the floor before moving up, producing flat uniform "shelves". The next pallet
then lands on a flat floor and passes the 100% support check easily.

```python
# engine.build_groups — within-group sort
# OLD (jagged skyline):
#   group.sort(key=lambda b: b["w"] * b["h"] * b["d"], reverse=True)
# NEW (layer-building): tallest first, large footprints lower.
    group.sort(key=lambda b: (b["h"], b["w"] * b["d"]), reverse=True)
```

**Depth-first "wall-building" variant** (alternative, not both): sort `(d, h, w)` descending. The
engine scorer is already depth-first (`_position_score = (pz, py, px)`), so this builds clean
back-to-front walls and minimizes leftover Z slivers. Exposed as a second strategy for A/B.

**Make the sort a parameter, not an in-place edit.** `build_groups` is shared by `guillotine`,
`algo2`, `algo3` — editing its sort silently changes all three and breaks parity. Instead:

```python
def build_groups(boxes, sort: str = "volume"):  # "volume" | "height" | "depth"
    ...
    group.sort(key=_SORTERS[sort], reverse=True)
```

- `"volume"` (default) → byte-for-byte identical to today; existing keys unchanged.
- `"height"` / `"depth"` → used by the new algorithm key(s). Promote to default later if
  validated on the real picklist.

---

## Lever B — Outer pallet order by shape compatibility  *(complementary)*
Even with flat within-pallet shelves, the **order pallets load** still matters: loading
same-height pallets consecutively keeps the kept Above shelf usable across the pallet boundary
(coplanar tops → next pallet stacks instead of opening a new z-band).

Constructive sort over the pallet (group) list, deterministic:
- **Per-pallet signature** = the dominant carton. With Lever A the group is height-sorted, so
  `group[0]` is the tallest/representative carton — use its dims.
- **Sort key** `(height_band, base_w, base_d, -volume)`: height primary (quantized within `_EPS`
  → coplanar shelves), footprint next (same z-slice tiling), volume desc (stable base first).
- Pallets with a unique height form their own band — never worse than today.

**Optional deterministic refinement (opt-in "deep" variant only).** After the constructive sort,
a bounded **steepest-descent** pass: try adjacent-pallet swaps, keep one only if the *real*
packed objective (`metaheuristic._objective`) strictly improves. No RNG, no perturbation; stops
when no adjacent swap helps or a small pass cap is reached. Pure constructive sort stays default.

### Engine enabler for Lever B — decouple color/identity from load sequence
`colorIndex` currently does double duty: pallet *color/identity* **and** *load order* (the
topological sort tie-breaks on it). To return placements in a reordered pallet sequence:
- In `pack_into_containers`, derive `seq_of = {group[0]["colorIndex"]: rank}` from the order of
  the groups it receives (one colorIndex per group).
- Pass `seq_of` into `_topological_sort`; change its tie-break from `colorIndex` to
  `seq_of.get(colorIndex, colorIndex)`: `(seq_of[...], centre_z, y, x)`.
- **No regression:** for existing keys `build_groups` yields colorIndex order, so
  `seq_of[colorIndex] == colorIndex rank` → identical ordering to today.

Frontend already keys everything off the **returned placement order** (`runPacker` walks it to
derive pallet boundaries) and colors via `getCartonColor(palletIndex)` (original pallet) — so the
ActivePalletPanel, PlaybackControls checkpoints, and Excel Seq # follow the new sequence
automatically while colors stay stable. No frontend change beyond a new algorithm button.

---

## Lever C — Support-contact buffer  *(optional, global safety knob — confirm before enabling)*
Strict 100% contact is harsher than reality: a rigid carton can bridge/overhang a 1–2 cm gap.
Relaxing the threshold lets a pallet's boxes bridge minor misalignments left by the previous one,
raising density. **This is a global physics/safety change** — it affects every algorithm and the
real-world question of whether the load stays put, so it is a named constant, **default `1.0`
(today's behavior)**, opt-in:

```python
# helper.py
_SUPPORT_RATIO = 1.0   # 1.0 = full contact (current); 0.90–0.95 allows bridging small gaps
...
    if covered >= required * _SUPPORT_RATIO - _EPS:
        return True
```

Flagged for explicit sign-off because lowering it trades structural realism for density and
interacts with the lashing/flat semantics.

---

## Detailed changes by file
**backend/algorithms/guillotine/engine.py**
- `build_groups(boxes, sort="volume")` + `_SORTERS = {"volume":…, "height":…, "depth":…}`.
- `pack_into_containers`: build `seq_of` from group order; pass to each `_topological_sort` call.

**backend/algorithms/guillotine/helper.py**
- `_topological_sort(placed, seq_of)`: primary tie-break `seq_of.get(colorIndex, colorIndex)`.
- `_SUPPORT_RATIO` constant; use it in `_is_fully_supported` (default 1.0 → no behavior change).

**backend/algorithms/guillotine/__init__.py**
- Re-export anything new only if a sibling needs it (none expected; `build_groups` signature is
  backward-compatible via the default arg).

**backend/algorithms/palletsequence.py** *(new — or extend metaheuristic.py)*
- `run_layer_pack(containers, boxes, lashing=False)` — Lever A: `build_groups(boxes,
  sort="height")` → `pack_into_containers`. Pure constructive, no search.
- Optional `run_layer_pack_deep(...)` — Lever A + Lever B constructive pallet sort + bounded
  deterministic steepest-descent. Reuses `_objective`.

**backend/algorithms/registry.py**
- Add `"layerpack"` (and optionally `"layerpack_deep"`); one REGISTRY entry each.

**frontend/src/store/uiSlice.ts** — add key(s) to the `AlgoId` union.
**frontend/src/components/ui/Sidebar.tsx** — one algorithm button per new key.

---

## Decisions to confirm
1. **Height-first as new algorithm vs new global default.** Plan keeps existing keys identical and
   adds `"layerpack"` (opt-in, A/B-comparable). Promote to guillotine default later if validated.
2. **Support ratio.** Default stays `1.0`. Enable `0.90/0.95` only on explicit sign-off (safety).
3. **Outer pallet reorder = the real loading sequence** the teams follow (Lever B). Assumed yes.
4. **Height-first vs depth-first (wall) as the headline sort** — recommend height-first first;
   keep depth-first as a second strategy for benchmarking.

---

## Scalability
- Levers A and B are both **O(N log N) sorts** — no budgets, scale to 266 pallets trivially.
- Optional steepest-descent refinement is bounded (small pass cap, real-objective gate); skip it
  above a pallet-count threshold and ship the pure constructive order.
- The optimizer still calls the packer once per container combo; constructive sorts keep that cheap.

## Testing
- **Parity:** `guillotine`/`algo2`/`algo3` unchanged (counts, flatApplied, utilization, order)
  with `sort="volume"` default and `_SUPPORT_RATIO=1.0`.
- **Density win:** a test case with interleaved heights in pick order (jagged under volume sort)
  packs denser / fewer containers under `"layerpack"`.
- **Lever B:** colors stay tied to original pallets while boundaries follow the new order; objective
  ≥ guillotine.
- **Lever C:** with `_SUPPORT_RATIO=0.90`, previously-rejected bridging placements now pass; at
  `1.0` nothing changes.

## Task checklist (phased)
- [ ] **Phase 1 (Lever A):** parametrize `build_groups` sort; add `_SORTERS`; new `"layerpack"`
      key + Sidebar button. Verify parity on existing keys. Benchmark height vs depth vs volume.
- [ ] **Phase 2 (Lever B enabler):** add `seq_of` in `pack_into_containers`, thread into
      `_topological_sort`. Verify byte-for-byte parity on existing algos.
- [ ] **Phase 3 (Lever B):** constructive pallet sort + optional deterministic refinement;
      `"layerpack_deep"` key.
- [ ] **Phase 4 (Lever C):** `_SUPPORT_RATIO` constant (default 1.0). Gate enablement on sign-off.
- [ ] **Phase 5 (tests):** parity + jagged-load density case + support-buffer behavior.

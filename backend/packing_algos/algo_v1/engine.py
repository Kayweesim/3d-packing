"""
engine.py — the reusable guillotine packing engine.

═══════════════════════════════════════════════════════════════════════════════
HOW IT WORKS
═══════════════════════════════════════════════════════════════════════════════
The packer maintains a list of free rectangular cuboids (free spaces, see
`helper.py`).  The container starts as a single free space equal to its full
interior.

For each carton instance (in pallet-group order, volume-desc within group):
  1. Try every (free space, orientation) pair.
  2. Place at (space.x, gravity_settle(...), space.z) — always the XZ corner of
     the space; Y is computed by scanning placed cartons for the highest surface
     directly below this footprint.
  3. Score by the active scorer (default (space.z, settled_y, space.x) — lower is
     better: back → low → left).  Reject candidates that float (full-support
     check) or exceed the space's Y ceiling, or that a loader cannot reach.
  4. Accept the best candidate, remove the used space, and add up to 3
     non-overlapping sub-spaces produced by guillotine cuts:
       • Front:  same X-range as carton, in front of it (full height, rest depth)
       • Right:  everything to the right of the placed carton (full height/depth)
       • Above:  same XZ as carton, above it (remaining height)

This module hosts the placement loop (`_pack_group`), the multi-pallet container
loop (`_pack_container`), instance expansion (`build_groups`), the flat re-pack
search (`_flat_repack_search`, seeded by `_flat_height_cap`), the staircase
front search (`_staircase_repack_search`, which tapers the flat cap's front
cliff into a descending envelope), and the multi-container orchestration
(`pack_into_containers`).
Its building blocks — geometry, constraints, scoring and ordering — live in
`helper.py`; the ordering layer that drives it lives in `ordering.py`.
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Callable, NamedTuple

from .common import gravity_settle, get_orientations
from schema import ContainerIn, BoxIn, PlacementOut, ContainerResult

from .helper import (
    _EPS, _Space, Placement, _merge_spaces, split_space,
    _is_fully_supported, _is_reachable,
    PlacementScore, _position_score, _topological_sort,
)


# ── Single-group packing ───────────────────────────────────────────────────────

# Reports cumulative cartons placed so far. Fired once per successful placement
# so the SSE endpoint can stream real packing progress. Never raises into the
# packing loop — callers wrap it defensively.
ProgressCb = Callable[[int], None]

# Optional height envelope: ceiling(z) -> the max allowed top-face height at
# depth z. Must be non-increasing in z (the staircase re-pack's contract) so
# evaluating it at a carton's front edge is its tightest point.
Ceiling = Callable[[float], float]


def _sp_dict(s: _Space) -> dict:
    """Serialize a free space to a plain dict (for the visualizer trace)."""
    return {"x": s.x, "y": s.y, "z": s.z, "w": s.w, "h": s.h, "d": s.d}


def _find_best_placement(
    spaces: list[_Space],
    orientations: list[tuple[float, float, float]],
    current: list[dict],
    score_fn: PlacementScore,
    ceiling: Ceiling | None = None,
) -> Placement | None:
    """
    Search every (free space, orientation) pair and return the lowest-scoring
    feasible candidate as a `Placement`, or None if none fit. Factored out of
    `_pack_group` so a non-stackable carton can search a restricted
    (flattest-only) orientation set first, then fall back to the full set —
    see the "stability preference" note in `_pack_group`.

    `ceiling`, when given, is a non-increasing height envelope (the staircase
    re-pack): a candidate whose top face would poke above `ceiling(z)` at its
    front edge is rejected. The front edge is the envelope's tightest point
    over the carton's span, so the check is conservative and never admits a
    box that crosses the descending line.
    """
    best: Placement | None = None

    for si, sp in enumerate(spaces):
        for bw, bh, bd in orientations:
            if bw > sp.w + _EPS or bd > sp.d + _EPS or bh > sp.h + _EPS:
                continue

            px = sp.x
            pz = sp.z
            py = gravity_settle(px, pz, bw, bd, current)  # type: ignore[arg-type]

            if py + bh > sp.y + sp.h + _EPS:
                continue

            if ceiling is not None and py + bh > ceiling(pz + bd) + _EPS:
                continue

            if not _is_fully_supported(px, py, pz, bw, bd, current):
                continue

            # Reachability uses the carton's real resting box, not the space.
            if not _is_reachable(px, py, pz, bw, bh, bd, sp, current):
                continue

            score = score_fn(px, py, pz, bw, bh, bd, sp)
            if best is None or score < best.score:
                best = Placement(si, px, py, pz, bw, bh, bd, score)

    return best


def _place_instance(
    inst: dict,
    spaces: list[_Space],
    current: list[dict],
    score_fn: PlacementScore,
    ceiling: Ceiling | None = None,
) -> Placement | None:
    """
    Find the best placement for one carton instance, choosing which
    orientations to try based on its stacking constraint.

    A non-stackable carton never gains anything from standing tall (nothing
    will ever rest on it), and a wider footprint rests more stably. So it
    tries only its flattest orientation(s) — smallest height, i.e. resting on
    its largest face — across every space first, falling back to the taller
    orientations only if none of those fit anywhere (so we don't waste floor
    space laying a carton down somewhere an upright orientation was the only
    fit). A stackable carton — or one with only a single orientation to begin
    with — just searches its full orientation set directly.
    """
    orientations = get_orientations(inst["w"], inst["h"], inst["d"],
                                     inst.get("rotationAllowed", True))

    if not inst.get("stacking", True) and len(orientations) > 1:
        min_h = min(o[1] for o in orientations)
        flat = [o for o in orientations if o[1] <= min_h + _EPS]
        rest = [o for o in orientations if o[1] > min_h + _EPS]
        best = _find_best_placement(spaces, flat, current, score_fn, ceiling)
        if best is None and rest:
            best = _find_best_placement(spaces, rest, current, score_fn, ceiling)
        return best

    return _find_best_placement(spaces, orientations, current, score_fn, ceiling)


def _pack_group(
    group: list[dict],
    spaces: list[_Space],
    placed: list[dict],
    score_fn: PlacementScore,
    trace: list[dict] | None = None,
    cut: str = "front",
    progress_cb: ProgressCb | None = None,
    placed_offset: int = 0,
    ceiling: Ceiling | None = None,
) -> tuple[list[dict], list[dict]]:
    """
    Pack one pallet group into the given free spaces.
    `placed` contains all previously placed cartons and is used for gravity
    settling; it is NOT modified here — caller appends the returned placed list.
    Returns (pallet_placed, pallet_overflow).

    When `trace` is a list, a step snapshot (placed box, winning score, the free
    space chosen, the guillotine sub-spaces created, and the full free-space list
    after the split) is appended per placement — drives the step visualizer. When
    None (the normal path) there is zero overhead and no behaviour change.

    When `progress_cb` is given, it is called after each placement with the
    cumulative count of cartons placed across the whole pack — `placed_offset`
    (cartons placed in prior containers this pass) + cartons placed in this
    container so far. Defaults keep the normal/trace paths unchanged.
    """
    pallet_placed: list[dict] = []
    overflow: list[dict] = []

    for inst in group:
        # Gravity/support/reachability checks see everything placed so far:
        # prior pallets (`placed`, read-only) plus this pallet's own cartons.
        current = placed + pallet_placed

        best = _place_instance(inst, spaces, current, score_fn, ceiling)

        if best is None:
            overflow.append(inst)
            continue

        px, py, pz, bw, bh, bd = best.x, best.y, best.z, best.w, best.h, best.d
        pallet_placed.append({"id": inst["id"], "x": px, "y": py, "z": pz,
                               "w": bw, "h": bh, "d": bd,
                               "colorIndex": inst.get("colorIndex", 0),
                               "stacking": inst.get("stacking", True)})

        if progress_cb is not None:
            progress_cb(placed_offset + len(placed) + len(pallet_placed))

        sp = spaces.pop(best.space_idx)

        # The placed carton carves its host space into up to three
        # non-overlapping sub-spaces (Front/Right/Above) — see `split_space`
        # for how `cut` decides which region stays maximal.
        new_spaces = split_space(sp, px, py, pz, bw, bh, bd, cut)
        spaces.extend(s for _, s in new_spaces)

        if trace is not None:
            trace.append({
                "step": len(trace),
                "boxId": inst["id"],
                "colorIndex": inst.get("colorIndex", 0),
                "placed": {"x": px, "y": py, "z": pz, "w": bw, "h": bh, "d": bd},
                "score": [round(float(v), 3) for v in best.score],
                "chosenSpace": _sp_dict(sp),
                "newSpaces": [{"kind": k, **_sp_dict(s)} for k, s in new_spaces],
                "spaces": [_sp_dict(s) for s in spaces],
            })

    return pallet_placed, overflow


# ── Multi-pallet container packing ─────────────────────────────────────────────

def _pack_container(
    container: ContainerIn,
    groups: list[list[dict]],
    score_fn: PlacementScore,
    trace: list[dict] | None = None,
    cut: str = "front",
    progress_cb: ProgressCb | None = None,
    placed_offset: int = 0,
    ceiling: Ceiling | None = None,
) -> tuple[list[dict], list[list[dict]]]:
    """
    Pack pallet groups sequentially into one shared free-space list.

    Pallet order is preserved — every carton of a pallet is attempted before
    the next pallet starts — but all free spaces (floor-level gaps, Above
    spaces) carry over between pallets, so a later pallet's cartons may fill
    gaps left beside or above an earlier pallet's cartons.  Pallet identity
    is preserved logically (group order, colorIndex) rather than spatially.

    The container's height (`container.h`) bounds every stack, so passing a
    height-capped copy of a container packs the same depth-first arrangement but
    spread lower and further forward — this is how the flat last-container
    re-pack keeps a partial load low and reachable (see `pack_into_containers`).

    Returns (placed, overflow_groups) where overflow_groups preserves the
    per-pallet list structure so the caller can pass it directly to the next
    container without regrouping by colorIndex.
    """
    placed: list[dict] = []
    overflow_groups: list[list[dict]] = []
    spaces: list[_Space] = [
        _Space(0.0, 0.0, 0.0, container.w, container.h, container.d)
    ]

    for group in groups:
        if not group or not spaces:
            overflow_groups.append(group)
            continue

        # Defragment spaces left by previous pallets so this pallet packs at its
        # own pitch instead of inheriting the prior pallet's grid (closes gaps).
        _merge_spaces(spaces)

        pallet_placed, pallet_overflow = _pack_group(
            group, spaces, placed, score_fn, trace, cut,
            progress_cb=progress_cb, placed_offset=placed_offset,
            ceiling=ceiling,
        )
        placed.extend(pallet_placed)
        if pallet_overflow:
            overflow_groups.append(pallet_overflow)

    return placed, overflow_groups


# ── Reusable engine (shared by guillotine and algo2) ────────────────────────────

def build_groups(boxes: list[BoxIn]) -> list[list[dict]]:
    """
    Expand boxes into carton instances grouped by pallet (colorIndex).

    Pallet groups are ordered by colorIndex ascending (the pick sequence), and
    within each group carton instances are sorted by volume descending so the
    largest cartons claim the deepest, lowest free spaces first. The returned
    list structure (one inner list per pallet) is the unit of work the engine
    and the sibling packers (algo2) operate on.
    """
    groups: dict[int, list[dict]] = defaultdict(list)
    for box in boxes:
        base = {"id": box.id, "label": box.label,
                "w": box.w, "h": box.h, "d": box.d,
                "colorIndex": box.colorIndex,
                "rotationAllowed": box.rotationAllowed,
                "stacking": box.stacking}
        for _ in range(box.quantity):
            groups[box.colorIndex].append(dict(base))

    ordered_groups: list[list[dict]] = []
    for ci in sorted(groups):
        group = groups[ci]
        group.sort(key=lambda b: b["w"] * b["h"] * b["d"], reverse=True)
        ordered_groups.append(group)
    return ordered_groups


def _flat_height_cap(container: ContainerIn,
                     groups: list[list[dict]]) -> tuple[float, float]:
    """
    Estimate the lowest container height that can hold every carton in `groups`,
    used as a fallback seed for `_flat_repack_search` (when there's no observed
    depth-first arrangement to seed from) and to compute the search's step size.

    Returns (h1, layer):
      layer = the tallest carton's minimum placeable height — min(w,h,d) when
              rotation is allowed (flattest orientation), h otherwise. This is
              the quantization unit: every cap the search tries is a whole
              multiple of `layer`, so it always admits complete layers.
      h1    = ceil((Σ carton volume / floor area) / layer) * layer, clamped to
              [layer, container.h]. The volume/area term is the ideal level-fill
              height assuming zero packing gap — a rough fallback estimate only;
              `_flat_repack_search` prefers the real observed height when available.
    """
    floor_area = container.w * container.d
    total_vol = 0.0
    layer = 0.0
    for group in groups:
        for inst in group:
            total_vol += inst["w"] * inst["h"] * inst["d"]
            # When rotation is allowed the packer can orient the carton so its
            # smallest dimension becomes the height — use that as the layer pitch
            # so the estimate and step size reflect the flattest possible arrangement.
            if inst.get("rotationAllowed", True):
                min_h = min(inst["w"], inst["h"], inst["d"])
            else:
                min_h = inst["h"]
            layer = max(layer, min_h)
    if floor_area <= 0.0 or layer <= 0.0:
        return container.h, container.h
    h1 = math.ceil((total_vol / floor_area) / layer) * layer
    return max(layer, min(h1, container.h)), layer


def _gallop_down(seed: int, seed_placed: list[dict], test) -> tuple[int, list[dict]]:
    """
    Given a probe at index `seed` that already succeeded, find the smallest
    index that still succeeds: gallop downward doubling the gap each step
    until a probe fails (or index 1 is reached), then binary-search the
    bracket. `test(i) -> (success, placed)`. Returns (best_index, best_placed).
    """
    hi, best_placed = seed, seed_placed
    step = 1
    while hi > 1:
        lo_try = max(1, hi - step)
        ok, placed = test(lo_try)
        if not ok:
            lo = lo_try
            while lo + 1 < hi:
                mid = (lo + hi) // 2
                mid_ok, mid_placed = test(mid)
                if mid_ok:
                    hi, best_placed = mid, mid_placed
                else:
                    lo = mid
            return hi, best_placed
        hi, best_placed = lo_try, placed
        if hi == 1:
            return hi, best_placed
        step *= 2
    return hi, best_placed


def _gallop_up(seed: int, max_i: int, test) -> tuple[int, list[dict]]:
    """
    Given a probe at index `seed` that failed, find the smallest index that
    succeeds: gallop upward doubling the gap each step (`max_i` is a guaranteed
    success — see `_flat_repack_search`) until a probe succeeds, then
    binary-search the bracket. Returns (best_index, best_placed).
    """
    lo = seed
    step = 1
    hi = min(seed + step, max_i)
    ok, placed = test(hi)
    while not ok and hi < max_i:
        lo = hi
        step *= 2
        hi = min(seed + step, max_i)
        ok, placed = test(hi)
    while lo + 1 < hi:
        mid = (lo + hi) // 2
        mid_ok, mid_placed = test(mid)
        if mid_ok:
            hi, placed = mid, mid_placed
        else:
            lo = mid
    return hi, placed


def _flat_repack_search(
    container: ContainerIn,
    groups: list[list[dict]],
    cut: str,
    target: int,
    depth_placed: list[dict],
    progress_cb: ProgressCb | None = None,
    placed_offset: int = 0,
) -> tuple[list[dict], ContainerIn]:
    """
    Find the shortest height-capped copy of `container` (quantized to whole
    `layer` increments — see `_flat_height_cap`) that still places all
    `target` cartons with the same depth-first packer, and return
    (placed, capped_container) for the winning height.

    Seeded from the REAL max height used in `depth_placed` — the full-height
    depth-first pass already run for this container — rounded up to the
    nearest layer. This is a much tighter starting guess than the volume/
    floor-area estimate in `_flat_height_cap`, since it reflects this load's
    actual packing efficiency (orientation waste, non-stackable footprints,
    reachability rejections) instead of an idealized zero-gap pour.

    From that seed, gallops toward the answer (doubling the search gap each
    miss — down if the seed already succeeds, up if it doesn't) and then
    binary-searches the bracketed range, so a good seed converges in a
    handful of probes and a bad seed still costs O(log(search range)) probes
    rather than one full re-pack per layer. `container.h` itself is a
    guaranteed success (it's exactly how `depth_placed` was produced), so the
    search always terminates with a result — the only assumption is that
    placement success is monotonic non-decreasing in height (more headroom-
    never places fewer cartons), which holds in practice for this depth-first
    scorer.
    """
    h1_est, layer = _flat_height_cap(container, groups)
    if layer <= 0.0 or layer > container.h + _EPS:
        # Degenerate load, or even the flattest carton needs more height than
        # the container has — nothing shorter than full height can work.
        return depth_placed, container

    max_i = max(1, math.ceil((container.h - _EPS) / layer))

    def cap_container(i: int) -> ContainerIn:
        return ContainerIn(id=container.id, w=container.w,
                           h=min(i * layer, container.h), d=container.d)

    probes = 0

    def test(i: int) -> tuple[bool, list[dict]]:
        nonlocal probes
        probes += 1
        if progress_cb is not None:
            # Fire synthetic values above `placed_offset` (= total placed) so
            # main.py's progress_cb maps them into the flat-repack pct band.
            progress_cb(placed_offset + probes)
        placed, _ = _pack_container(cap_container(i), groups, _position_score, cut=cut)
        return len(placed) == target, placed

    observed_h = max((p["y"] + p["h"] for p in depth_placed), default=h1_est)
    seed = max(1, min(max_i, math.ceil((observed_h - _EPS) / layer)))

    seed_ok, seed_placed = test(seed)
    if seed_ok:
        best_i, best_placed = _gallop_down(seed, seed_placed, test)
    else:
        best_i, best_placed = _gallop_up(seed, max_i, test)

    return best_placed, cap_container(best_i)


class _StairCeiling:
    """
    Descending height envelope for the staircase re-pack, callable as
    ceiling(z) -> the max allowed top-face height at depth z.

    Full height `h` up to the plateau end `z_p`, then dropping one `layer`
    every `step` cm toward the door, floored at a single layer:

        h ----------.
                    |__
                       |__          <- one `layer` drop per `step` cm
        layer          .  |________
        back          z_p      door
    """

    __slots__ = ("h", "layer", "z_p", "step")

    def __init__(self, h: float, layer: float, z_p: float, step: float):
        self.h, self.layer, self.z_p, self.step = h, layer, z_p, step

    def __call__(self, z: float) -> float:
        past = z - self.z_p
        if past <= _EPS:
            return self.h
        drops = math.ceil((past - _EPS) / self.step)
        return max(self.layer, self.h - drops * self.layer)


def _stair_step_depth(groups: list[list[dict]]) -> float:
    """
    Depth (cm) of one staircase step: the flattest-orientation footprint depth
    of the layer-defining carton — the same carton whose flattest height sets
    the layer pitch in `_flat_height_cap` (mirror that logic when changing
    either). The deeper footprint dim is used so one step comfortably holds a
    full row of that carton and the envelope descends one carton-row at a time.
    """
    layer = 0.0
    step = 0.0
    for group in groups:
        for inst in group:
            if inst.get("rotationAllowed", True):
                dims = sorted((inst["w"], inst["h"], inst["d"]))
                min_h, depth = dims[0], dims[2]
            else:
                min_h, depth = inst["h"], inst["d"]
            if min_h > layer:
                layer, step = min_h, depth
    return step


def _staircase_repack_search(
    container: ContainerIn,
    groups: list[list[dict]],
    cut: str,
    target: int,
    flat_placed: list[dict],
    capped: ContainerIn,
    progress_cb: ProgressCb | None = None,
    placed_offset: int = 0,
) -> tuple[list[dict], _StairCeiling | None]:
    """
    Phase 2 of the last-container re-pack: taper the flat cap's vertical front
    cliff into a descending staircase. Keeping the cap height H* = `capped.h`
    fixed, search for the earliest plateau end z_p such that packing under the
    envelope `_StairCeiling(H*, layer, z_p, step)` still places all `target`
    cartons — the earlier the stairs start, the lower and more gradual the
    load front. The envelope is a placement constraint, not a reshape, so the
    result respects every normal rule (support, reachability, stacking).

    z_p is quantized to whole `step` widths pulled back from the door:
    k steps back means z_p = container.d - k*step, and k = 0 degenerates to
    the plain flat cap (a guaranteed success — `flat_placed` is exactly that
    arrangement), so the search always terminates no worse than flat.
    Feasibility is assumed monotone in k (a later plateau end is a pointwise
    looser envelope and never places fewer cartons — same practical
    assumption as the height search in `_flat_repack_search`), so the shared
    gallop + binary-search helpers apply, on the reversed index j = k_hi+1-k
    to make success monotone *increasing* in the searched index.

    Returns (placed, ceiling): the staircase arrangement and its envelope, or
    (flat_placed, None) when the load is already a single layer or no
    descending envelope fits everything.
    """
    _, layer = _flat_height_cap(container, groups)
    step = _stair_step_depth(groups)
    if layer <= 0.0 or layer > container.h + _EPS or step <= 0.0:
        return flat_placed, None
    if capped.h <= layer + _EPS:
        return flat_placed, None  # single-layer load — already stable

    k_hi = int(container.d // step)
    if k_hi < 1:
        return flat_placed, None

    def envelope(k: int) -> _StairCeiling:
        return _StairCeiling(capped.h, layer, container.d - k * step, step)

    probes = 0

    def test(j: int) -> tuple[bool, list[dict]]:
        nonlocal probes
        probes += 1
        if progress_cb is not None:
            # Same synthetic-progress convention as _flat_repack_search; the
            # SSE endpoint's monotonic clamp absorbs the restarted counter.
            progress_cb(placed_offset + probes)
        k = k_hi + 1 - j
        if k <= 0:
            return True, flat_placed
        placed, _ = _pack_container(capped, groups, _position_score, cut=cut,
                                    ceiling=envelope(k))
        return len(placed) == target, placed

    # Seed: stairs whose descent ends right at the flat load's front — the
    # envelope just grazes the current arrangement, displacing only the boxes
    # near the front, so a good load converges in a few probes.
    z_front = max((p["z"] + p["d"] for p in flat_placed), default=container.d)
    n_drops = max(1, round(capped.h / layer)) - 1
    k_seed = int((container.d - z_front) // step) + n_drops
    k_seed = max(1, min(k_hi, k_seed))
    seed_j = k_hi + 1 - k_seed

    seed_ok, seed_placed = test(seed_j)
    if seed_ok:
        best_j, best_placed = _gallop_down(seed_j, seed_placed, test)
    else:
        best_j, best_placed = _gallop_up(seed_j, k_hi + 1, test)

    best_k = k_hi + 1 - best_j
    if best_k <= 0:
        return flat_placed, None
    return best_placed, envelope(best_k)


class ContainerState(NamedTuple):
    """A container's packed state mid-pipeline.

    `input_groups` is retained (not just the overflow) so the flat re-pack can
    re-run this container on exactly the input it originally received.
    """
    container: ContainerIn
    placed: list[dict]
    input_groups: list[list[dict]]


def _seq_ranks(ordered_groups: list[list[dict]]) -> dict[int, int]:
    """
    Load-sequence rank per pallet: the position of each pallet (colorIndex) in
    the order of groups we were handed. This is what the topological sort uses
    to order placements, so a packer that reorders the groups (e.g. algo2) gets
    placements grouped in its chosen sequence — while colours stay tied to the
    original colorIndex. For guillotine the groups arrive in colorIndex order,
    so the result is monotonic in colorIndex and the sort result is unchanged.
    """
    return {g[0]["colorIndex"]: rank
            for rank, g in enumerate(ordered_groups) if g}


def _pack_all_containers(
    containers: list[ContainerIn],
    ordered_groups: list[list[dict]],
    score_fn: PlacementScore,
    cut: str,
    progress_cb: ProgressCb | None,
) -> tuple[list[ContainerState], int]:
    """
    Pass 1: pack every container in order with the normal scorer, carrying
    overflow forward to the next container. Stashes each container's
    placements alongside the groups it was handed, so the flat re-pack can
    re-run on that exact input.

    Returns (states, placed_offset) — placed_offset is the total cartons
    placed across every container, used both as the flat re-pack's progress
    baseline and to detect the last container that actually received cartons.
    `placed_offset` also accumulates as containers are packed so the progress
    callback reports a single monotonic count across this pass (rather than
    resetting to 0 at each container).
    """
    states: list[ContainerState] = []
    remaining_groups = ordered_groups
    placed_offset = 0
    for container in containers:
        if not remaining_groups:
            states.append(ContainerState(container, [], []))
            continue
        input_groups = remaining_groups
        placed, remaining_groups = _pack_container(
            container, input_groups, score_fn, cut=cut,
            progress_cb=progress_cb, placed_offset=placed_offset,
        )
        placed_offset += len(placed)
        states.append(ContainerState(container, placed, input_groups))
    return states, placed_offset


def _apply_flat_repack(
    states: list[ContainerState],
    apply_flat: bool,
    placed_offset: int,
    cut: str,
    progress_cb: ProgressCb | None,
) -> tuple[list[ContainerState], int]:
    """
    Re-arrange the last container that actually received cartons so a partial
    load sits low and reachable instead of as a tall back wall. Two phases:

      1. `_flat_repack_search` finds the shortest uniform height cap that
         still places every carton the full-height pass did, and re-packs
         into it with the normal depth-first scorer.
      2. `_staircase_repack_search` keeps that cap and tapers the load's
         front cliff into a descending staircase envelope, so the load ends
         at a single layer by the door instead of a vertical wall. Falls
         back to the phase-1 result untouched when no envelope fits.

    A no-op (returns `states` unchanged, flat_idx=-1) when `apply_flat` is
    False (the "lashing" case — the load is secured, so tall stacking is
    acceptable) or when no container received any cartons.

    Returns (states, flat_idx) — flat_idx marks which container index was
    re-packed, for the UI. Always set to `last_loaded` when the branch is
    taken: `_flat_repack_search` is guaranteed to succeed (full height is
    always a valid fallback, since that's exactly how the input placements
    were produced), and the staircase phase never does worse than flat.
    """
    last_loaded = max((i for i, s in enumerate(states) if s.placed), default=-1)
    flat_idx = -1
    if not apply_flat or last_loaded < 0:
        return states, flat_idx

    container, depth_placed, input_groups = states[last_loaded]
    flat_placed, capped = _flat_repack_search(
        container, input_groups, cut, len(depth_placed), depth_placed,
        progress_cb=progress_cb, placed_offset=placed_offset,
    )
    stair_placed, _ceiling = _staircase_repack_search(
        container, input_groups, cut, len(depth_placed), flat_placed, capped,
        progress_cb=progress_cb, placed_offset=placed_offset,
    )
    # Store the original (full-height) container so utilization and rendering
    # use the real dimensions; the placements fit within it.
    states[last_loaded] = ContainerState(container, stair_placed, input_groups)
    flat_idx = last_loaded

    return states, flat_idx


def _finalize_results(
    states: list[ContainerState],
    seq_of: dict[int, int],
    flat_idx: int,
) -> list[ContainerResult]:
    """Pass 2: topologically sort each container's placements and build results."""
    results: list[ContainerResult] = []
    for i, state in enumerate(states):
        container = state.container
        sorted_placed = _topological_sort(state.placed, seq_of)
        container_vol = container.w * container.h * container.d
        used_vol = sum(p["w"] * p["h"] * p["d"] for p in sorted_placed)
        results.append(ContainerResult(
            containerId=container.id,
            placements=[
                PlacementOut(
                    boxId=p["id"],
                    x=p["x"], y=p["y"], z=p["z"],
                    w=p["w"], h=p["h"], d=p["d"],
                )
                for p in sorted_placed
            ],
            utilization=used_vol / container_vol,
            flatApplied=(i == flat_idx),
        ))
    return results


def pack_into_containers(
    containers: list[ContainerIn],
    ordered_groups: list[list[dict]],
    score_fn: PlacementScore = _position_score,
    apply_flat: bool = True,
    cut: str = "front",
    progress_cb: ProgressCb | None = None,
) -> list[ContainerResult]:
    """
    Pack the given pallet groups sequentially across the containers using
    `score_fn` to rank candidate placements, then build per-container results.

    Pure with respect to `ordered_groups` (instances are read, never mutated),
    so callers may invoke it repeatedly with different orderings — this is what
    lets sibling packers (algo2) re-decode a re-sorted ordering cheaply.

    When `apply_flat` is True, the last loaded container is then re-packed with
    the SAME depth-first scorer but into a height-capped copy of the container
    (cap from `_flat_height_cap`), so a partially-filled final container sits low
    and spread-forward (topple-safe, and still loadable back-to-front) instead of
    as a tall back wall; the cap's front cliff is then tapered into a descending
    staircase envelope (`_staircase_repack_search`) so the load ends at a single
    layer by the door. This is a pure post-process: the normal pass alone
    decides the container count and which cartons land where, and the capped
    arrangement is kept only if every carton still fits — otherwise the denser
    full-height arrangement stands (a full container has no toppling risk). Set
    `apply_flat=False` (the "lashing" case) to keep the full-height arrangement
    everywhere — the load is secured by lashing, so tall stacking is acceptable.
    See `_apply_flat_repack` for the two-phase details.

    Returns one ContainerResult per container (empty placements if nothing
    remained to pack for that container).
    """
    seq_of = _seq_ranks(ordered_groups)
    states, placed_offset = _pack_all_containers(
        containers, ordered_groups, score_fn, cut, progress_cb
    )
    states, flat_idx = _apply_flat_repack(
        states, apply_flat, placed_offset, cut, progress_cb
    )

    # Signal the topological-sort / finalise phase (sentinel >> total + MAX_FLAT_STEPS).
    if progress_cb is not None:
        progress_cb(placed_offset + 100)

    return _finalize_results(states, seq_of, flat_idx)

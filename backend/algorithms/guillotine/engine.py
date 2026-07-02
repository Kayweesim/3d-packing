"""
engine.py — the reusable guillotine packing engine.

═══════════════════════════════════════════════════════════════════════════════
HOW IT WORKS
═══════════════════════════════════════════════════════════════════════════════
The packer maintains a list of free rectangular cuboids (free spaces, see
`freespace.py`).  The container starts as a single free space equal to its full
interior.

For each carton instance (in pallet-group order, volume-desc within group):
  1. Try every (free space, orientation) pair.
  2. Place at (space.x, gravity_settle(...), space.z) — always the XZ corner of
     the space; Y is computed by scanning placed cartons for the highest surface
     directly below this footprint.
  3. Score by the active scorer (default (settled_y, space.z, space.x) — lower is
     better: gravity → back → left).  Reject candidates that float (full-support
     check) or exceed the space's Y ceiling, or that a loader cannot reach.
  4. Accept the best candidate, remove the used space, and add up to 3
     non-overlapping sub-spaces produced by guillotine cuts:
       • Front:  same X-range as carton, in front of it (full height, rest depth)
       • Right:  everything to the right of the placed carton (full height/depth)
       • Above:  same XZ as carton, above it (remaining height)

This module hosts the placement loop (`_pack_group`), the multi-pallet container
loop (`_pack_container`), instance expansion (`build_groups`), the flat-cap
estimate (`_flat_height_cap`), the multi-container orchestration
(`pack_into_containers`), and the public entry point (`run_guillotine`).  Its
building blocks — geometry, constraints, scoring and ordering — live in
`helper.py`.
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Callable

from algorithms.common import gravity_settle, get_orientations
from schema import ContainerIn, BoxIn, PlacementOut, ContainerResult

from .helper import (
    _MIN_DIM, _EPS, _Space, _merge_spaces,
    _is_fully_supported, _is_reachable,
    PlacementScore, _position_score, _topological_sort,
)


# ── Single-group packing ───────────────────────────────────────────────────────

# Reports cumulative cartons placed so far. Fired once per successful placement
# so the SSE endpoint can stream real packing progress. Never raises into the
# packing loop — callers wrap it defensively.
ProgressCb = Callable[[int], None]


def _sp_dict(s: _Space) -> dict:
    """Serialize a free space to a plain dict (for the visualizer trace)."""
    return {"x": s.x, "y": s.y, "z": s.z, "w": s.w, "h": s.h, "d": s.d}


def _pack_group(
    group: list[dict],
    spaces: list[_Space],
    placed: list[dict],
    score_fn: PlacementScore,
    trace: list[dict] | None = None,
    cut: str = "front",
    progress_cb: ProgressCb | None = None,
    placed_offset: int = 0,
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
    # Combined view for gravity/support checks — grows as this group places
    all_placed = placed  # read-only alias; gravity/support checks use all_placed + pallet_placed

    for inst in group:
        iw, ih, id_ = inst["w"], inst["h"], inst["d"]
        best_score: tuple | None = None
        best: tuple | None = None   # (si, px, py, pz, bw, bh, bd)

        current = all_placed + pallet_placed  # gravity sees everything so far

        for si, sp in enumerate(spaces):
            for bw, bh, bd in get_orientations(iw, ih, id_, inst.get("rotationAllowed", True)):
                if bw > sp.w + _EPS or bd > sp.d + _EPS or bh > sp.h + _EPS:
                    continue

                px = sp.x
                pz = sp.z
                py = gravity_settle(px, pz, bw, bd, current)  # type: ignore[arg-type]

                if py + bh > sp.y + sp.h + _EPS:
                    continue

                if not _is_fully_supported(px, py, pz, bw, bd, current):
                    continue

                # Reachability uses the carton's real resting box, not the space.
                if not _is_reachable(px, py, pz, bw, bh, bd, sp, current):
                    continue

                score = score_fn(px, py, pz, bw, bh, bd, sp)
                if best_score is None or score < best_score:
                    best_score = score
                    best = (si, px, py, pz, bw, bh, bd)

        if best is None:
            overflow.append(inst)
            continue

        si, px, py, pz, bw, bh, bd = best
        pallet_placed.append({"id": inst["id"], "x": px, "y": py, "z": pz,
                               "w": bw, "h": bh, "d": bd,
                               "colorIndex": inst.get("colorIndex", 0),
                               "stacking": inst.get("stacking", True)})

        if progress_cb is not None:
            progress_cb(placed_offset + len(placed) + len(pallet_placed))

        sp = spaces.pop(si)

        # ── Guillotine split ──────────────────────────────────────────────────
        # The placed carton carves its host space into three non-overlapping
        # sub-spaces. Two cut orders trade which region stays maximal:
        #
        #   "front" (default) — Front inherits the FULL height + width of the
        #     parent, giving later/larger cartons a clear front lane; Above is the
        #     carton footprint only. Best for wide pallets needing a front lane.
        #   "above" — Above inherits the FULL width + depth of the parent (one
        #     contiguous stacking slab), so stacked cartons flush to the back
        #     instead of stranding a thin front sliver above a deeper supporter;
        #     Front/Right are capped at the carton height. Best for stacking.
        #
        # Either way the three regions are disjoint and tile the freed volume.

        new_spaces: list[tuple[str, _Space]] = []
        top = py + bh                   # carton top face
        box_h = top - sp.y              # height consumed inside the space
        fd = sp.d - bd                  # remaining depth in front of the carton
        rw = sp.w - bw                  # remaining width to the right
        above_h = (sp.y + sp.h) - top   # remaining height above the carton

        if cut == "above":
            # Above: full-width, full-depth slab above the carton (contiguous column)
            if above_h > _MIN_DIM:
                s = _Space(sp.x, top, sp.z, sp.w, above_h, sp.d)
                spaces.append(s); new_spaces.append(("Above", s))
            # Front: remaining depth at full width, capped at the carton height
            if fd > _MIN_DIM:
                s = _Space(sp.x, sp.y, pz + bd, sp.w, box_h, fd)
                spaces.append(s); new_spaces.append(("Front", s))
            # Right: right of the carton within its z-slice, capped at carton height
            if rw > _MIN_DIM:
                s = _Space(px + bw, sp.y, sp.z, rw, box_h, bd)
                spaces.append(s); new_spaces.append(("Right", s))
        else:
            # Front: remaining depth at full width + full height
            if fd > _MIN_DIM:
                s = _Space(sp.x, sp.y, pz + bd, sp.w, sp.h, fd)
                spaces.append(s); new_spaces.append(("Front", s))
            # Right: right of the carton within its z-slice, full height
            if rw > _MIN_DIM:
                s = _Space(px + bw, sp.y, sp.z, rw, sp.h, bd)
                spaces.append(s); new_spaces.append(("Right", s))
            # Above: carton footprint only — stacking within this z-slice
            if above_h > _MIN_DIM:
                s = _Space(sp.x, top, sp.z, bw, above_h, bd)
                spaces.append(s); new_spaces.append(("Above", s))

        if trace is not None:
            trace.append({
                "step": len(trace),
                "boxId": inst["id"],
                "colorIndex": inst.get("colorIndex", 0),
                "placed": {"x": px, "y": py, "z": pz, "w": bw, "h": bh, "d": bd},
                "score": [round(float(v), 3) for v in best_score],
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
        base = {"id": box.id, "w": box.w, "h": box.h, "d": box.d,
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
    used as the starting cap for the flat last-container re-pack.

    Returns (h1, layer):
      layer = the tallest carton's minimum placeable height — min(w,h,d) when
              rotation is allowed (flattest orientation), h otherwise. The re-pack
              raises the cap one `layer` at a time, and the estimate is rounded up
              to a whole number of `layer`s so the cap always admits complete layers.
      h1    = ceil((Σ carton volume / floor area) / layer) * layer, clamped to
              [layer, container.h]. The volume/area term is the ideal level-fill
              height; rounding up to a whole layer is the built-in buffer.
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


def _flat_cap_containers(container: ContainerIn, groups: list[list[dict]]):
    """
    Yield height-capped copies of `container` for the flat re-pack to try, from the
    volume-based estimate up to full height, one carton-layer taller each step.

    Centralizes the cap-raising sequence shared by the production re-pack
    (`pack_into_containers`) and the visualizer's trace (`trace._trace_flat`): a
    caller iterates these, packs each, and stops at the first that fits everything.
    """
    h1, layer = _flat_height_cap(container, groups)
    while h1 <= container.h + _EPS:
        yield ContainerIn(id=container.id, w=container.w, h=h1, d=container.d)
        if h1 >= container.h - _EPS:
            return
        h1 = min(h1 + layer, container.h)


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
    as a tall back wall. The cap starts at the volume-based estimate and is raised
    one layer at a time until every carton fits, because capping height is not
    freely traded for depth — a too-low cap can overflow. This is a pure
    post-process: the normal pass alone decides the container count and which
    cartons land where, and the capped arrangement is kept only if every carton
    still fits — otherwise the denser full-height arrangement stands (a full
    container has no toppling risk). Set `apply_flat=False` (the "lashing" case)
    to keep the full-height arrangement everywhere — the load is secured by
    lashing, so tall stacking is acceptable.

    Returns one ContainerResult per container (empty placements if nothing
    remained to pack for that container).
    """
    # Load-sequence rank per pallet: the position of each pallet (colorIndex) in
    # the order of groups we were handed. This is what the topological sort uses
    # to order placements, so a packer that reorders the groups (e.g. algo2) gets
    # placements grouped in its chosen sequence — while colours stay tied to the
    # original colorIndex. For guillotine the groups arrive in colorIndex order,
    # so seq_of is monotonic in colorIndex and the result is unchanged.
    seq_of = {g[0]["colorIndex"]: rank
              for rank, g in enumerate(ordered_groups) if g}

    # Pass 1: pack every container with the normal scorer. Stash each
    # container's placements alongside the groups it was handed, so the flat
    # re-pack below can re-run on that exact input.
    # `placed_offset` accumulates cartons placed in prior containers so the
    # progress callback reports a single monotonic count across all containers
    # in this pass (rather than resetting to 0 at each container).
    states: list[tuple[ContainerIn, list[dict], list[list[dict]]]] = []
    remaining_groups = ordered_groups
    placed_offset = 0
    for container in containers:
        if not remaining_groups:
            states.append((container, [], []))
            continue
        input_groups = remaining_groups
        placed, remaining_groups = _pack_container(
            container, input_groups, score_fn, cut=cut,
            progress_cb=progress_cb, placed_offset=placed_offset,
        )
        placed_offset += len(placed)
        states.append((container, placed, input_groups))

    # Flat re-pack: re-arrange the last container that actually received cartons
    # so a partial load sits low and reachable instead of as a tall back wall.
    # Re-pack the SAME boxes with the normal depth-first scorer into a
    # height-capped copy of the container; raise the cap one layer at a time
    # until every carton fits. Keep the capped arrangement only if it places them
    # all — otherwise the full-height depth-first arrangement (already saved)
    # stands. `flat_idx` marks the re-packed container for the UI.
    last_loaded = max((i for i, s in enumerate(states) if s[1]), default=-1)
    flat_idx = -1
    if apply_flat and last_loaded >= 0:
        container, depth_placed, input_groups = states[last_loaded]
        for attempt, capped in enumerate(_flat_cap_containers(container, input_groups)):
            # Fire synthetic values above `placed_offset` (= total placed) so
            # main.py's progress_cb maps them into the flat-repack pct band.
            if progress_cb is not None:
                progress_cb(placed_offset + attempt + 1)
            flat_placed, _ = _pack_container(capped, input_groups, _position_score, cut=cut)
            if len(flat_placed) == len(depth_placed):
                # Store the original (full-height) container so utilization and
                # rendering use the real dimensions; the placements fit within it.
                states[last_loaded] = (container, flat_placed, input_groups)
                flat_idx = last_loaded
                break

    # Signal the topological-sort / finalise phase (sentinel >> total + MAX_FLAT_STEPS).
    if progress_cb is not None:
        progress_cb(placed_offset + 100)

    # Pass 2: topologically sort each container's placements and build results.
    results: list[ContainerResult] = []
    for i, (container, placed, _) in enumerate(states):
        sorted_placed = _topological_sort(placed, seq_of)
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


# ── Public entry point ─────────────────────────────────────────────────────────

def run_guillotine(
    containers: list[ContainerIn],
    boxes: list[BoxIn],
    lashing: bool = False,
    progress_cb: ProgressCb | None = None,
) -> list[ContainerResult]:
    """
    Pack boxes into containers using the guillotine algorithm with depth-first
    (back → bottom → left) placement scoring.

    `lashing=True` skips the flat last-container re-pack (the load is secured, so
    tall depth-first stacking is acceptable). `progress_cb`, when given, streams
    cumulative cartons-placed counts for the live progress bar.
    """
    ordered_groups = build_groups(boxes)
    return pack_into_containers(containers, ordered_groups, _position_score,
                                apply_flat=not lashing, progress_cb=progress_cb)

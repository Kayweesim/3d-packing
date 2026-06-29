"""
algo2.py — Multi-start shape-compatibility packer (registry key "algo2").

Reuses the guillotine engine *unchanged*. Where `guillotine` commits to one
ordering (volume-desc cartons, Excel pallet order), algo2 is free to choose both
the carton order *within* a pallet and the order pallets load. Rather than trust
a single heuristic, it runs a small fixed menu of principled, deterministic
orderings, packs each through the engine, and keeps the least-fragmented result.

Why a menu (closed loop) instead of one sort
--------------------------------------------
Different loads want different orderings — height-first flattens vertical
skylines, depth-first squares up the z-frontier, footprint-first tiles the
floor. A single constructive guess is sometimes worse than guillotine. So algo2
decodes several candidates and scores them.

Objective (lower is better): (-total_placed, Σ envelope_volume)
  1. place the most cartons (helps the optimizer reach all-packed in a cheaper
     container);
  2. then the most compact load. Within a fixed container utilization is
     identical across orderings, so compactness is the real signal. Since
     envelope_volume = total_box_volume (constant) + internal_gap, minimizing the
     load's bounding-box volume *is* minimizing the internal gap — computed O(n)
     from the placements, no voxelization in the hot loop. (scorer.py remains the
     richer voxel diagnostic for pockets / sealed space.)

Never worse than guillotine
---------------------------
The first menu entry IS the guillotine ordering, and ties favour the earliest
entry, so the best-of can never score below guillotine — it only switches
strategy when one packs strictly tighter.

Cartons, quantities and pallet membership are unchanged — only ordering is. The
engine decouples colour/identity (colorIndex) from load order, so the chosen
sequence drives the animation while colours stay tied to the original pallet.
"""

from __future__ import annotations

from algorithms.guillotine import build_groups, pack_into_containers
from schema import BoxIn, ContainerIn, ContainerResult


def _vol(b: dict) -> float:
    return b["w"] * b["h"] * b["d"]


# Ordering menu. Each entry = (within-pallet carton key, pallet-order key | None,
# guillotine cut order). Sort keys sort descending; None keeps the pallet pick
# order (guillotine baseline). The dominant carton group[0] (after the
# within-sort) is the pallet's signature. The cut ("front"|"above") controls how
# a placement splits its free space: "above" keeps a contiguous full-depth
# stacking slab (no thin front slivers above deeper supporters), "front" keeps a
# wide front lane. The multi-start packs each and keeps the least-fragmented.
_HEIGHT_WITHIN = lambda b: (b["h"], b["w"] * b["d"])  # noqa: E731
_HEIGHT_PALLET = lambda g: (g[0]["h"], g[0]["w"] * g[0]["d"], sum(_vol(b) for b in g))  # noqa: E731
_FOOT_WITHIN = lambda b: (b["w"] * b["d"], b["h"])  # noqa: E731
_FOOT_PALLET = lambda g: (g[0]["w"] * g[0]["d"], g[0]["h"], sum(_vol(b) for b in g))  # noqa: E731




_STRATEGIES = [
    # baseline (guillotine): volume-desc cartons, Excel pallet order, front cut.
    (lambda b: _vol(b), None, "front"),
    # layer: height-first cartons, height-band pallet order (flat coplanar shelves).
    (_HEIGHT_WITHIN, _HEIGHT_PALLET, "front"),
    # layer + above-cut: contiguous stacking slab so cartons flush to the back
    # instead of stranding a thin front sliver above a deeper supporter.
    (_HEIGHT_WITHIN, _HEIGHT_PALLET, "above"),
    # wall: depth-first cartons, depth-band pallet order (clean back-to-front walls).
    (lambda b: (b["d"], b["h"], b["w"]),
     lambda g: (g[0]["d"], g[0]["h"], sum(_vol(b) for b in g)), "front"),
    # footprint: base-area-first cartons, footprint pallet order (tight floor tiling).
    (_FOOT_WITHIN, _FOOT_PALLET, "front"),
    # footprint + above-cut: tight floor tiling with contiguous stacking columns.
    (_FOOT_WITHIN, _FOOT_PALLET, "above"),
]


def _objective(results: list[ContainerResult]) -> tuple[float, float]:
    """
    Solution cost (lower is better): (-cartons_placed, Σ load-envelope volume).
    Envelope volume per container = bbox of its placements; summing it across
    containers minimizes internal gap (envelope = boxes + gap, boxes constant).
    """
    total_placed = sum(len(r.placements) for r in results)
    envelope = 0.0
    for r in results:
        if not r.placements:
            continue
        ps = r.placements
        x0 = min(p.x for p in ps); x1 = max(p.x + p.w for p in ps)
        y0 = min(p.y for p in ps); y1 = max(p.y + p.h for p in ps)
        z0 = min(p.z for p in ps); z1 = max(p.z + p.d for p in ps)
        envelope += (x1 - x0) * (y1 - y0) * (z1 - z0)
    return (-total_placed, envelope)


def _candidate_orderings(boxes: list[BoxIn]):
    """Yield (group ordering, cut) for each strategy in the menu."""
    for within_key, pallet_key, cut in _STRATEGIES:
        groups = build_groups(boxes)
        for group in groups:
            group.sort(key=within_key, reverse=True)
        if pallet_key is not None:
            groups.sort(key=pallet_key, reverse=True)
        yield groups, cut


def best_ordering(
    containers: list[ContainerIn],
    boxes: list[BoxIn],
    lashing: bool = False,
) -> tuple[list[list[dict]], list[ContainerResult], str]:
    """
    Return (winning_groups, winning_results, winning_cut): the strategy that packs
    least-fragmented for these containers, plus its packing result and cut order.

    Shared by run_algo2 (production) and the visualizer trace, so the trace shows
    the same ordering AND cut algo2 actually chose. Ties favour the earliest
    (baseline = guillotine, front cut) strategy → never worse than guillotine.
    """
    apply_flat = not lashing
    best_groups: list[list[dict]] = []
    best_results: list[ContainerResult] = []
    best_cut = "front"
    best_key: tuple[float, float] | None = None

    for groups, cut in _candidate_orderings(boxes):
        results = pack_into_containers(containers, groups, apply_flat=apply_flat, cut=cut)
        key = _objective(results)
        if best_key is None or key < best_key:
            best_key, best_groups, best_results, best_cut = key, groups, results, cut

    return best_groups, best_results, best_cut


def run_algo2(
    containers: list[ContainerIn],
    boxes: list[BoxIn],
    lashing: bool = False,
) -> list[ContainerResult]:
    """
    Pack by trying each ordering+cut strategy and keeping the least-fragmented result.

    `lashing=True` skips the flat last-container re-pack (load is secured, so tall
    stacking is acceptable) — same semantics as `run_guillotine`.
    """
    _, best_results, _ = best_ordering(containers, boxes, lashing)
    return best_results

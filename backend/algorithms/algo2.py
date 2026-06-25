"""
algo2.py — Shape-compatibility packer (registry key "algo2").

Reuses the guillotine engine *unchanged*. Unlike `guillotine`, which is bound to
the Excel pick order and sorts cartons by volume, algo2 is free to **choose the
pallet load order** and uses two deterministic, structural heuristics (no search)
to close the gaps that open up between differently-sized pallets:

Lever A — height-first *within* each pallet
    Sort each pallet's cartons by height descending (tallest first, larger
    footprints lower). The engine's full-support check rejects any carton at y>0
    unless its entire bottom face is covered; volume order interleaves
    short-wide and tall-narrow cartons, leaving a jagged top the next pallet
    can't stack onto. Considering equal-height cartons together fills each height
    tier side-by-side first, producing flat, coplanar "shelves".

Lever B — shape-compatibility ordering *across* pallets
    Reorder whole pallets so dimensionally-similar pallets load consecutively
    (same dominant height adjacent, then footprint, then larger pallets first).
    Same-height neighbours leave coplanar tops, so the kept "Above" shelf stays
    usable across the pallet boundary and the next pallet stacks instead of
    opening a fresh z-band — directly closing the cross-pallet vertical gaps.

The engine decouples a pallet's colour/identity (colorIndex) from its load order
(the order groups are handed to `pack_into_containers`), so reordering changes
the load/animation sequence while colours stay tied to the original pallet.
Cartons, quantities and pallet membership are unchanged — only ordering is.
"""

from __future__ import annotations

from algorithms.guillotine import build_groups, pack_into_containers
from schema import BoxIn, ContainerIn, ContainerResult


def _pallet_signature(group: list[dict]) -> tuple[float, float, float]:
    """
    Sort key for ordering whole pallets (Lever B), applied with reverse=True.

    Uses the pallet's dominant carton (group[0] — the tallest after the Lever A
    height sort) so similar pallets cluster: height first (coplanar shelves →
    full-support passes across the boundary), then base footprint (same z-slice
    tiling), then total pallet volume (larger, more stable pallets first).
    """
    rep = group[0]
    total_vol = sum(b["w"] * b["h"] * b["d"] for b in group)
    return (rep["h"], rep["w"] * rep["d"], total_vol)


def run_algo2(
    containers: list[ContainerIn],
    boxes: list[BoxIn],
    lashing: bool = False,
) -> list[ContainerResult]:
    """
    Pack with height-first within-pallet ordering and shape-compatibility pallet
    ordering.

    `lashing=True` skips the flat last-container re-pack (load is secured, so tall
    stacking is acceptable) — same semantics as `run_guillotine`.
    """
    groups = build_groups(boxes)

    # Lever A: height-first within each pallet (tallest first, larger footprints lower).
    for group in groups:
        group.sort(key=lambda b: (b["h"], b["w"] * b["d"]), reverse=True)

    # Lever B: load dimensionally-similar pallets consecutively.
    groups.sort(key=_pallet_signature, reverse=True)

    return pack_into_containers(containers, groups, apply_flat=not lashing)

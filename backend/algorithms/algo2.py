"""
algo2.py — Size-first packer (registry key "algo2").

Reuses the guillotine engine *unchanged*. Where `guillotine` keeps the Excel
pallet pick order, algo2 orders everything by size, biggest first: pallets are
loaded biggest-product first, and within each pallet the biggest cartons claim
the deepest, lowest free spaces. On top of the size order two invariants hold:
same-product pallets always load as one consecutive block (uniform sizes tile
cleanly), and pallets containing non-stackable cartons go last (by the door).

The menu/best-of machinery (`_Strategy`, `_candidate_orderings`, `_objective`,
`best_ordering`) is retained from the earlier multi-start design so extra
strategies can be added back as menu entries; the menu currently holds the
single size-first strategy (reduced 2026-07 by decision — one deterministic
heuristic, no multi-start search cost).

Objective (lower is better): (-total_placed, Σ envelope_volume)
  1. place the most cartons (helps the optimizer reach all-packed in a cheaper
     container);
  2. then the most compact load — envelope_volume = total_box_volume (constant)
     + internal_gap, so minimizing the load's bounding-box volume *is*
     minimizing the internal gap. With a single menu entry this just scores the
     one result; it ranks candidates again the moment a second entry exists.

Cartons, quantities and pallet membership are unchanged — only ordering is. The
engine decouples colour/identity (colorIndex) from load order, so the chosen
sequence drives the animation while colours stay tied to the original pallet.
"""

from __future__ import annotations

from typing import Callable, NamedTuple

from algorithms.guillotine import build_groups, pack_into_containers
from schema import BoxIn, ContainerIn, ContainerResult


def _vol(b: dict) -> float:
    return b["w"] * b["h"] * b["d"]


# ── Sort keys ───────────────────────────────────────────────────────────────────
#
# The within-pallet key ranks a single carton instance; the pallet key ranks a
# whole pallet group by its dominant carton group[0] (the first carton AFTER
# the within-sort), tie-broken by total pallet volume. Keys sort DESCENDING.

def _volume_within(b: dict) -> float:
    """Biggest cartons first — they claim the deepest, lowest spaces."""
    return _vol(b)


def _volume_pallet(g: list[dict]) -> tuple:
    """Biggest pallets first: dominant-carton volume, then total pallet volume."""
    return (_vol(g[0]), sum(_vol(b) for b in g))


def _product_sig(group: list[dict]) -> tuple:
    """Product identity of a pallet — the sorted set of product labels inside it.

    Pallets almost always hold exactly one product, so this is usually a
    1-tuple; a mixed pallet gets a composite signature and only groups with
    pallets carrying the identical mix.
    """
    return tuple(sorted({b.get("label", b["id"]) for b in group}))


def _group_like_products(groups: list[list[dict]]) -> None:
    """Stable-reorder pallets so same-product pallets load consecutively.

    Each pallet keeps the strategy's rank via the FIRST pallet of its product:
    the best-ranked pallet of a product anchors the block, and every sibling
    pallet of that product follows immediately, before the next product starts.
    Identically-sized products pack flush together instead of interleaving.
    Until 2026-07 this was implicit (1 pallet = 1 product ⇒ size keys cluster
    equal products); made explicit so equal-size *different* products, or
    float-noise in dims, can no longer split a product run.
    """
    first_pos: dict[tuple, int] = {}
    for i, g in enumerate(groups):
        first_pos.setdefault(_product_sig(g), i)
    groups.sort(key=lambda g: first_pos[_product_sig(g)])


def _has_unstackable(group: list[dict]) -> bool:
    """True if any carton in the pallet disallows stacking on top of it.
    Such pallets are sorted to the end of every strategy so they land near
    the door rather than mid-load, where their stacking=False ceiling would
    strand vertical gaps above them inside the loaded block.
    """
    return any(not b.get("stacking", True) for b in group)


class _Strategy(NamedTuple):
    """One entry of the ordering menu — a complete, deterministic packing recipe."""
    within: Callable[[dict], object]                    # within-pallet carton key (desc)
    pallet: Callable[[list[dict]], object] | None       # pallet-order key (desc); None = Excel pick order
    cut: str                                            # guillotine cut order: "front" | "above"
    orient: Callable[[list[dict], float], None] | None  # uniform-orientation transform; None = per-carton


# Ordering menu — currently the single size-first strategy (see module
# docstring). Add entries here to reinstate a multi-start search; ties favour
# the earliest entry. Removed strategies (height/depth/footprint keys, the
# width-fit and stand-tall orientation transforms, the "above" cut) live in
# git history prior to 2026-07 if ever needed again.
_STRATEGIES = [
    # size-first: biggest pallets first, biggest cartons first within each.
    _Strategy(_volume_within, _volume_pallet, "front", None),       
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


def _candidate_orderings(boxes: list[BoxIn], container_w: float):
    """Yield (group ordering, cut) for each strategy in the menu.

    `container_w` is the container width, passed to a strategy's orientation
    transform (if it has one); orientation is applied before sorting so the
    sort sees the rotated dims. No current menu entry uses one.
    """
    for strategy in _STRATEGIES:
        groups = build_groups(boxes)
        if strategy.orient is not None:
            for group in groups:
                strategy.orient(group, container_w)
        for group in groups:
            group.sort(key=strategy.within, reverse=True)
        if strategy.pallet is not None:
            groups.sort(key=strategy.pallet, reverse=True)
        # Same-product pallets load as one consecutive block (uniform sizes
        # tile cleanly); the strategy key decides which product leads.
        _group_like_products(groups)
        # Stable-sort: pallets with any non-stackable carton go last so they
        # land near the door, not mid-load where they'd strand gaps above them.
        groups.sort(key=_has_unstackable)
        yield groups, strategy.cut


def best_ordering(
    containers: list[ContainerIn],
    boxes: list[BoxIn],
    lashing: bool = False,
    progress_cb: Callable[[int], None] | None = None,
) -> tuple[list[list[dict]], list[ContainerResult], str]:
    """
    Return (winning_groups, winning_results, winning_cut): the menu strategy
    that packs best for these containers, plus its packing result and cut order.
    With the current single-entry menu this is simply the size-first ordering.

    Shared by run_algo2 (production) and the visualizer trace, so the trace shows
    the same ordering AND cut algo2 actually chose. Ties favour the earliest
    menu entry.

    `progress_cb`, when given, is forwarded to each strategy's pack so the live
    progress bar advances during the search. Each strategy re-packs from scratch,
    so the reported count restarts per strategy; the SSE endpoint clamps it to a
    monotonic maximum, so the bar never jumps backwards.
    """
    apply_flat = not lashing
    best_groups: list[list[dict]] = []
    best_results: list[ContainerResult] = []
    best_cut = "front"
    best_key: tuple[float, float] | None = None

    # Container width drives the width-fit orientation. All presets share the same
    # width (235 cm), so the first container is representative.
    container_w = containers[0].w if containers else 0.0

    for groups, cut in _candidate_orderings(boxes, container_w):
        results = pack_into_containers(containers, groups, apply_flat=apply_flat,
                                       cut=cut, progress_cb=progress_cb)
        key = _objective(results)
        if best_key is None or key < best_key:
            best_key, best_groups, best_results, best_cut = key, groups, results, cut

    return best_groups, best_results, best_cut


def run_algo2(
    containers: list[ContainerIn],
    boxes: list[BoxIn],
    lashing: bool = False,
    progress_cb: Callable[[int], None] | None = None,
) -> list[ContainerResult]:
    """
    Pack with the size-first ordering (biggest pallets first, biggest cartons
    first within each pallet; same-product pallets contiguous, non-stackable
    pallets by the door).

    `lashing=True` skips the flat last-container re-pack (load is secured, so tall
    stacking is acceptable) — same semantics as `run_guillotine`. `progress_cb`
    streams cumulative cartons-placed counts for the live progress bar.
    """
    _, best_results, _ = best_ordering(containers, boxes, lashing, progress_cb)
    return best_results

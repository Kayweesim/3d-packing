"""
trace.py — step-by-step guillotine trace for the algorithm visualizer.

Re-runs a single guillotine pass into ONE 20ft container, recording the
free-space split after every placement so the frontend can step through how the
container fills (which space a carton chose, its priority score, and the
Front/Right/Above sub-spaces the guillotine cut produced).

Not part of the optimizer / normal packing path — a read-only diagnostic.
Overflow cartons that don't fit the single container are simply not recorded.

The carton/pallet order traced depends on the algorithm:
  guillotine — volume-descending within each pallet, pick order across pallets.
  algo2      — the winning strategy ordering algo2 would choose for a single 20ft
               (so the trace mirrors algo2's reordering), via algo2.best_ordering.

The `lashing` flag mirrors production (see OptimizeRequest): when False (default)
the single container — being the "last container" — gets the flat / horizontal
constraint (re-packed into the lowest height cap that still fits everything, so
the load sits low and reachable). When True the load is secured, so it stacks
tall depth-first with no flat re-pack.
"""

from __future__ import annotations

from algorithms.guillotine import build_groups, _position_score
from algorithms.guillotine.engine import _pack_container, _flat_height_cap
from algorithms.guillotine.helper import _EPS
from algorithms.algo2 import best_ordering
from schema import BoxIn, ContainerIn

# 20ft TEU interior (cm) — the visualizer always traces into a single 20ft.
_TRACE_CONTAINER = ContainerIn(id="trace-20ft", w=235.0, h=239.0, d=589.0)


def _trace_flat(container: ContainerIn, groups, cut: str) -> list[dict]:
    """
    Trace the flat (height-capped) pack of `container`, mirroring the last-container
    re-pack in engine.pack_into_containers: re-pack into the lowest height cap that
    still places as many cartons as the full-height pass, and return that pass's
    trace. Falls back to the depth-first trace if even full height can't match.
    """
    depth_placed, _ = _pack_container(container, groups, _position_score, None, cut)
    target = len(depth_placed)

    h1, layer = _flat_height_cap(container, groups)
    while h1 <= container.h + _EPS:
        capped = ContainerIn(id=container.id, w=container.w, h=h1, d=container.d)
        attempt: list[dict] = []
        flat_placed, _ = _pack_container(capped, groups, _position_score, attempt, cut)
        if len(flat_placed) == target:
            return attempt
        if h1 >= container.h - _EPS:
            break
        h1 = min(h1 + layer, container.h)

    # Even full height can't match → keep the denser depth-first arrangement.
    fallback: list[dict] = []
    _pack_container(container, groups, _position_score, fallback, cut)
    return fallback


def run_trace(boxes: list[BoxIn], algorithm: str = "guillotine",
              lashing: bool = False) -> dict:
    """Pack boxes into one 20ft using `algorithm`'s ordering, returning the trace."""
    container = _TRACE_CONTAINER
    if algorithm == "algo2":
        # Score candidates the same way production would for this lashing setting,
        # and reuse algo2's winning cut + ordering.
        groups, _, cut = best_ordering([container], boxes, lashing=lashing)
    else:
        groups, cut = build_groups(boxes), "front"

    if lashing:
        # Secured load: tall depth-first stacking, no flat constraint.
        trace: list[dict] = []
        _pack_container(container, groups, _position_score, trace, cut)
    else:
        # Last container → apply the flat / horizontal constraint.
        trace = _trace_flat(container, groups, cut)

    return {
        "container": {"w": container.w, "h": container.h, "d": container.d},
        "steps": trace,
    }

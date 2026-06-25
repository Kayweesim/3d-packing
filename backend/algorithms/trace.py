"""
trace.py — step-by-step guillotine trace for the algorithm visualizer.

Re-runs a single depth-first guillotine pass into ONE 20ft container, recording
the free-space split after every placement so the frontend can step through how
the container fills (which space a carton chose, its priority score, and the
Front/Right/Above sub-spaces the guillotine cut produced).

Not part of the optimizer / normal packing path — a read-only diagnostic.
Overflow cartons that don't fit the single container are simply not recorded.

The carton/pallet order traced depends on the algorithm:
  guillotine — volume-descending within each pallet, pick order across pallets.
  algo2      — the winning strategy ordering algo2 would choose for a single 20ft
               (so the trace mirrors algo2's reordering), via algo2.best_ordering.
"""

from __future__ import annotations

from algorithms.guillotine import build_groups, _position_score
from algorithms.guillotine.engine import _pack_container
from algorithms.algo2 import best_ordering
from schema import BoxIn, ContainerIn

# 20ft TEU interior (cm) — the visualizer always traces into a single 20ft.
_TRACE_CONTAINER = ContainerIn(id="trace-20ft", w=235.0, h=239.0, d=589.0)


def run_trace(boxes: list[BoxIn], algorithm: str = "guillotine") -> dict:
    """Pack boxes into one 20ft using `algorithm`'s ordering, returning the trace."""
    if algorithm == "algo2":
        # lashing=True → score candidates with no flat re-pack, matching the
        # single-pass _pack_container we then trace into.
        groups, _ = best_ordering([_TRACE_CONTAINER], boxes, lashing=True)
    else:
        groups = build_groups(boxes)

    trace: list[dict] = []
    _pack_container(_TRACE_CONTAINER, groups, _position_score, trace)
    return {
        "container": {"w": _TRACE_CONTAINER.w, "h": _TRACE_CONTAINER.h, "d": _TRACE_CONTAINER.d},
        "steps": trace,
    }

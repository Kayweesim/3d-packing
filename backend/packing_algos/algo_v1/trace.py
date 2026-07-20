"""
trace.py — step-by-step guillotine trace for the algorithm visualizer.

Re-runs a packing pass into one or more containers (defaulting to a single 20ft
TEU when none are supplied), recording the free-space split after every placement
so the frontend can step through how each container fills. Each step carries a
`containerId` so the UI knows which container it belongs to.

Not part of the optimizer / normal packing path — a read-only diagnostic.
Overflow cartons that don't fit the supplied containers are simply not recorded.

The carton/pallet order traced is algo1's winning strategy ordering (via
ordering.best_ordering), so the trace mirrors exactly what production packs.
Any other algorithm key falls back to the engine's natural ordering
(volume-descending within each pallet, pick order across pallets).

The `lashing` flag mirrors production (see OptimizeRequest): when False (default)
the last loaded container gets the flat / horizontal constraint (re-packed into
the lowest height cap that still fits everything, so the load sits low and
reachable). When True the load is secured, so it stacks tall depth-first
everywhere with no flat re-pack.
"""

from __future__ import annotations

from .helper import _position_score
from .engine import (
    build_groups, _pack_container, _flat_repack_search, _staircase_repack_search,
)
from .ordering import best_ordering
from schema import BoxIn, ContainerIn

# 20ft TEU interior (cm) — the fallback when no containers are supplied.
_TRACE_CONTAINER = ContainerIn(id="trace-20ft", w=235.0, h=239.0, d=589.0)


def _trace_flat(container: ContainerIn, groups, cut: str) -> list[dict]:
    """
    Trace the flat + staircase re-pack of `container`, mirroring the
    last-container re-pack in engine.pack_into_containers: find the shortest
    height cap that still places every carton the full-height pass did
    (`_flat_repack_search`), then the winning staircase envelope for that cap
    (`_staircase_repack_search`) — both shared with production so the trace
    always matches what actually gets packed — then re-pack once more under
    the same cap + envelope with tracing enabled and return its trace.
    """
    depth_placed, _ = _pack_container(container, groups, _position_score, None, cut)
    flat_placed, capped = _flat_repack_search(
        container, groups, cut, len(depth_placed), depth_placed)
    # ceiling is None when no staircase fits — the traced re-pack below then
    # reproduces the plain flat arrangement, exactly like production.
    _, ceiling = _staircase_repack_search(
        container, groups, cut, len(depth_placed), flat_placed, capped)

    attempt: list[dict] = []
    _pack_container(capped, groups, _position_score, attempt, cut, ceiling=ceiling)
    return attempt


def run_trace(boxes: list[BoxIn],
              containers: list[ContainerIn] | None = None,
              algorithm: str = "algo1",
              lashing: bool = False) -> dict:
    """
    Pack boxes across `containers` (default: single 20ft TEU) using `algorithm`'s
    ordering, returning per-step trace data tagged with containerId.
    """
    if not containers:
        containers = [_TRACE_CONTAINER]

    if algorithm == "algo1":
        groups, _, cut = best_ordering(containers, boxes, lashing=lashing)
    else:
        groups, cut = build_groups(boxes), "front"

    # Pass 1: trace each container in sequence, passing overflow to the next.
    # Each state entry: (container, placed, input_groups_for_this_container, steps)
    states: list[tuple[ContainerIn, list[dict], list[list[dict]], list[dict]]] = []
    remaining_groups = groups
    for container in containers:
        if not remaining_groups:
            states.append((container, [], [], []))
            continue
        input_groups = remaining_groups
        container_steps: list[dict] = []
        placed, remaining_groups = _pack_container(
            container, input_groups, _position_score, container_steps, cut
        )
        states.append((container, placed, input_groups, container_steps))

    # Apply flat re-pack to the last container that actually received cartons.
    if not lashing:
        last_loaded = max((i for i, s in enumerate(states) if s[1]), default=-1)
        if last_loaded >= 0:
            container, placed, input_groups, _ = states[last_loaded]
            flat_steps = _trace_flat(container, input_groups, cut)
            states[last_loaded] = (container, placed, input_groups, flat_steps)

    # Tag every step with its containerId and renumber globally.
    all_steps: list[dict] = []
    global_step = 0
    for container, _, _, container_steps in states:
        for step in container_steps:
            step["containerId"] = container.id
            step["step"] = global_step
            global_step += 1
        all_steps.extend(container_steps)

    return {
        "containers": [
            {"id": c.id, "w": c.w, "h": c.h, "d": c.d} for c in containers
        ],
        "steps": all_steps,
    }

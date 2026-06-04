"""
optimizer.py — Container selection optimizer

Given a set of boxes and the container types the user wants to consider,
finds the cheapest combination of containers that fits all boxes using the
Extreme Points packing algorithm.

═══════════════════════════════════════════════════════════════════════════════
COMBINATION SEARCH STRATEGY
═══════════════════════════════════════════════════════════════════════════════
Costs:  20ft TEU = 1.0 unit,  40ft FEU = 1.5 units.

Candidates are generated as (n_20, n_40) pairs and sorted by:
    1. total cost           — cheapest combination first
    2. total containers     — fewest containers at equal cost (prefer larger)
    3. n_20                 — fewest 20ft (= more 40ft) at equal cost + count

This produces the sequence: 1×20ft → 1×40ft → 2×20ft → 1×40ft+1×20ft →
2×40ft → 3×20ft → ... which matches the stated priority rules.

A volume pre-check skips combinations where total box volume already exceeds
total container volume, avoiding an expensive packing call on an impossible
combination.

The search stops as soon as a combination places all boxes (allPacked=True).
If nothing within the cost cap fits, the best partial attempt is returned.
"""

from __future__ import annotations
import uuid
from dataclasses import dataclass

from algorithms.extreme_points import run_extreme_points
from schema import BoxIn, ContainerIn, ContainerUsed, ContainerResult, OptimizeRequest, OptimizeResponse


# ── Container type definitions ─────────────────────────────────────────────────
# Single source of truth for preset dimensions and costs.

@dataclass(frozen=True)
class _TypeDef:
    label: str
    w: float
    h: float
    d: float
    cost: float

_TYPES: dict[str, _TypeDef] = {
    "20ft": _TypeDef(label="20ft TEU", w=235, h=239, d=589,  cost=1.0),
    "40ft": _TypeDef(label="40ft FEU", w=235, h=239, d=1203, cost=1.5),
}

MAX_COST = 10.0  # search ceiling — equivalent to 10× 20ft TEU


#  This function generates a table like this based on the sorting algorithm.
#  ┌─────┬─────┬──────┬─────────────────────────────────────┐
#  │ n20 │ n40 │ cost │                 why                 │
#  ├─────┼─────┼──────┼─────────────────────────────────────┤
#  │ 1   │ 0   │ 1.0  │ cheapest                            │
#  ├─────┼─────┼──────┼─────────────────────────────────────┤
#  │ 0   │ 1   │ 1.5  │ next cheapest                       │
#  ├─────┼─────┼──────┼─────────────────────────────────────┤
#  │ 2   │ 0   │ 2.0  │                                     │
#  ├─────┼─────┼──────┼─────────────────────────────────────┤
#  │ 1   │ 1   │ 2.5  │                                     │
#  ├─────┼─────┼──────┼─────────────────────────────────────┤
#  │ 0   │ 2   │ 3.0  │ 2 containers, n20=0 sorts before... │
#  ├─────┼─────┼──────┼─────────────────────────────────────┤
#  │ 3   │ 0   │ 3.0  │ ...3 containers                     │
#  ├─────┼─────┼──────┼─────────────────────────────────────┤
#  │ 1   │ 2   │ 3.5  │ n20=1 sorts before...               │
#  ├─────┼─────┼──────┼─────────────────────────────────────┤
#  │ 2   │ 1   │ 3.5  │ ...n20=2                            │
#  └─────┴─────┴──────┴─────────────────────────────────────┘
# ── Combination generator ──────────────────────────────────────────────────────

@dataclass
class _Combo:
    n20: int
    n40: int
    cost: float
    total: int


def _generate_combinations(available_types: list[str]) -> list[_Combo]:
    """
    Return all (n_20, n_40) pairs within MAX_COST, filtered by available_types,
    sorted by (cost, total_containers, n_20).

    The sort key encodes the priority rules:
      - cheapest first
      - at equal cost, fewer containers preferred (larger containers = less waste)
      - at equal cost + count, fewer 20ft preferred (more 40ft = more capacity)
    """
    can_20 = "20ft" in available_types
    can_40 = "40ft" in available_types

    combos: list[_Combo] = []
    for n20 in range(11):        # up to 10× 20ft
        for n40 in range(8):     # up to 7× 40ft
            if n20 == 0 and n40 == 0:
                continue
            if not can_20 and n20 > 0:
                continue
            if not can_40 and n40 > 0:
                continue
            cost = n20 * _TYPES["20ft"].cost + n40 * _TYPES["40ft"].cost
            if cost > MAX_COST:
                continue
            combos.append(_Combo(n20=n20, n40=n40, cost=cost, total=n20 + n40))

    combos.sort(key=lambda c: (c.cost, c.total, c.n20))
    return combos


# ── Container builders ─────────────────────────────────────────────────────────

def _build_containers(n20: int, n40: int) -> tuple[list[ContainerIn], list[ContainerUsed]]:
    """
    Create ContainerIn (for the packing algorithm) and ContainerUsed (for the
    frontend 3D renderer) lists for a given combination.  Each container gets
    a fresh UUID so the frontend can key meshes by id.
    """
    containers_in: list[ContainerIn] = []
    containers_used: list[ContainerUsed] = []

    for type_key, count in [("20ft", n20), ("40ft", n40)]:
        t = _TYPES[type_key]
        for i in range(count):
            cid = str(uuid.uuid4())
            label = f"{t.label} {i + 1}" if count > 1 else t.label
            containers_in.append(ContainerIn(id=cid, w=t.w, h=t.h, d=t.d))
            containers_used.append(ContainerUsed(id=cid, label=label, w=t.w, h=t.h, d=t.d))

    return containers_in, containers_used


def _build_summary(n20: int, n40: int) -> str:
    parts: list[str] = []
    if n20 > 0:
        parts.append(f"{n20}× 20ft TEU")
    if n40 > 0:
        parts.append(f"{n40}× 40ft FEU")
    return " + ".join(parts)


# ── Public entry point ─────────────────────────────────────────────────────────

def run_optimizer(body: OptimizeRequest) -> OptimizeResponse:
    """
    Find the cheapest container combination that fits all boxes using the
    Extreme Points algorithm.

    Returns the first fully-packed result found, or the best partial attempt
    if no combination within MAX_COST fits everything.
    """
    boxes = body.boxes
    available_types = body.available_types

    if not boxes or not available_types:
        return OptimizeResponse(
            containers=[],
            containers_used=[],
            total_cost=0.0,
            container_summary="—",
            all_packed=True,
        )

    total_box_vol = sum(b.w * b.h * b.d * b.quantity for b in boxes)
    total_needed  = sum(b.quantity for b in boxes)
    combos        = _generate_combinations(available_types)

    best: OptimizeResponse | None = None

    for combo in combos:
        # Volume pre-check: if boxes can't physically fit, skip without packing.
        combo_vol = (
            combo.n20 * _TYPES["20ft"].w * _TYPES["20ft"].h * _TYPES["20ft"].d +
            combo.n40 * _TYPES["40ft"].w * _TYPES["40ft"].h * _TYPES["40ft"].d
        )
        if total_box_vol > combo_vol:
            continue

        containers_in, containers_used = _build_containers(combo.n20, combo.n40)
        packing = run_extreme_points(containers_in, boxes)

        total_placed = sum(len(r.placements) for r in packing)
        all_packed   = total_placed == total_needed

        response = OptimizeResponse(
            containers=packing,
            containers_used=containers_used,
            total_cost=combo.cost,
            container_summary=_build_summary(combo.n20, combo.n40),
            all_packed=all_packed,
        )

        if all_packed:
            return response

        # Track best partial: most boxes placed so far.
        if best is None or total_placed > sum(len(r.placements) for r in best.containers):
            best = response
        # Afterwards, loop back to next combo.

    # This is when you ran through all the combos, and if there's no such fit then return the best fit.
    return best or OptimizeResponse(
        containers=[],
        containers_used=[],
        total_cost=0.0,
        container_summary="—",
        all_packed=False,
    )

"""
optimizer.py — Container selection optimizer

Given a set of boxes and the container types the user wants to consider,
finds the cheapest combination of containers that fits all boxes using the
guillotine packing algorithm.

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

from algorithms.guillotine import run_guillotine
from schema import BoxIn, ContainerIn, ContainerUsed, ContainerResult, OptimizeRequest, OptimizeResponse


# ── Container type definitions ─────────────────────────────────────────────────

@dataclass(frozen=True)
class _TypeDef:
    label: str
    w: float
    h: float
    d: float
    cost: float

_TYPES: dict[str, _TypeDef] = {
    "20ft": _TypeDef(label="20ft TEU", w=235, h=239, d=589,  cost=1.0),
    "40ft": _TypeDef(label="40ft FEU", w=235, h=269, d=1202, cost=1.5),
}

MAX_COST = 10.0  # search ceiling — equivalent to 10× 20ft TEU


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
    """
    can_20 = "20ft" in available_types
    can_40 = "40ft" in available_types

    combos: list[_Combo] = []
    for n20 in range(11):
        for n40 in range(8):
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
    Find the cheapest container combination that fits all boxes.
    Returns the first fully-packed result, or the best partial attempt.
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
        combo_vol = (
            combo.n20 * _TYPES["20ft"].w * _TYPES["20ft"].h * _TYPES["20ft"].d +
            combo.n40 * _TYPES["40ft"].w * _TYPES["40ft"].h * _TYPES["40ft"].d
        )
        if total_box_vol > combo_vol:
            continue

        containers_in, containers_used = _build_containers(combo.n20, combo.n40)
        packing = run_guillotine(containers_in, boxes)

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

        if best is None or total_placed > sum(len(r.placements) for r in best.containers):
            best = response

    return best or OptimizeResponse(
        containers=[],
        containers_used=[],
        total_cost=0.0,
        container_summary="—",
        all_packed=False,
    )

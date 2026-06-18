"""
metaheuristic.py — Iterated local search packers (registry keys "algo2", "algo3").

Both packers reuse the guillotine engine *unchanged* — same depth-first
placement scorer, which benchmarking showed is already near-optimal for dense
small-carton loads and beats every best-fit variant tried. What they add is a
search over the one degree of freedom the business rules allow: the order of
cartons *within* each pallet. Pallet order (colorIndex ascending = pick
sequence) and pallet boundaries are never touched, so the load plan stays valid.

Algorithm (iterated local search, greedy accept, starting from the guillotine
baseline ordering):
  1. Decode the baseline (volume-descending within each pallet) — identical to
     run_guillotine, so the search can never do worse than guillotine.
  2. Repeatedly perturb (swap two cartons inside one randomly chosen pallet),
     re-decode, and keep the change only if it packs strictly better.
  3. Stop at max_iters or when the time budget is exhausted.

Two budgets expose a speed/quality ladder for the frontend:
  algo2  run_light_search — small budget: cheap, small gains on mixed loads.
  algo3  run_deep_search  — large budget: slowest, largest gains on mixed loads.

On uniform small-box loads both simply return the guillotine result (the
baseline is already optimal and no perturbation improves it). A fixed RNG seed
keeps results reproducible on identical input.
"""

from __future__ import annotations

import random
import time

from algorithms.guillotine import build_groups, pack_into_containers
from schema import BoxIn, ContainerIn, ContainerResult

_SEED = 42

# Per-invocation search budgets (the optimizer calls a packer once per container
# combo, so these are deliberately bounded). iters is the hard cap; the wall
# time budget protects against pathologically large inputs.
_LIGHT_ITERS, _LIGHT_BUDGET_S = 8, 0.6     # algo2
_DEEP_ITERS,  _DEEP_BUDGET_S  = 50, 3.0    # algo3


def _objective(results: list[ContainerResult]) -> tuple[int, float]:
    """Solution quality (higher is better): cartons placed, then utilization."""
    total_placed = sum(len(r.placements) for r in results)
    total_util = sum(r.utilization for r in results)
    return (total_placed, total_util)


def _perturb(groups: list[list[dict]], rng: random.Random) -> list[list[dict]]:
    """
    Return a shallow copy of `groups` with two cartons swapped inside one
    randomly chosen pallet. Instances are shared (read-only in the decoder), so
    only the list structure is copied — never the dicts.
    """
    new = [list(g) for g in groups]
    swappable = [i for i, g in enumerate(new) if len(g) >= 2]
    if not swappable:
        return new
    g = new[rng.choice(swappable)]
    a, b = rng.sample(range(len(g)), 2)
    g[a], g[b] = g[b], g[a]
    return new


def _iterated_local_search(
    containers: list[ContainerIn],
    boxes: list[BoxIn],
    max_iters: int,
    time_budget_s: float,
) -> list[ContainerResult]:
    """Search within-pallet orderings; return the best packing found (≥ baseline)."""
    best_groups = build_groups(boxes)
    best_results = pack_into_containers(containers, best_groups)  # depth-first decoder
    best_key = _objective(best_results)

    rng = random.Random(_SEED)
    deadline = time.monotonic() + time_budget_s

    for _ in range(max_iters):
        if time.monotonic() > deadline:
            break
        candidate = _perturb(best_groups, rng)
        results = pack_into_containers(containers, candidate)
        key = _objective(results)
        if key > best_key:
            best_key, best_results, best_groups = key, results, candidate

    return best_results


def run_light_search(
    containers: list[ContainerIn],
    boxes: list[BoxIn],
) -> list[ContainerResult]:
    """algo2 — light iterated local search (fast)."""
    return _iterated_local_search(containers, boxes, _LIGHT_ITERS, _LIGHT_BUDGET_S)


def run_deep_search(
    containers: list[ContainerIn],
    boxes: list[BoxIn],
) -> list[ContainerResult]:
    """algo3 — deep iterated local search (slow, densest on mixed loads)."""
    return _iterated_local_search(containers, boxes, _DEEP_ITERS, _DEEP_BUDGET_S)

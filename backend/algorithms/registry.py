"""
registry.py — maps algorithm keys to packer functions.

Every packer matches the PackerFn signature:
    (containers: list[ContainerIn], boxes: list[BoxIn]) -> list[ContainerResult]

Adding a new algorithm is a two-line change: implement a run_* function with
that signature, import it here, and add one REGISTRY entry. The optimizer and
endpoint dispatch by key and never need to know which algorithms exist.
"""

from __future__ import annotations
from typing import Callable

from algorithms.guillotine import run_guillotine
from algorithms.metaheuristic import run_light_search, run_deep_search
from schema import BoxIn, ContainerIn, ContainerResult

# A packing algorithm: packs boxes into the given containers and returns one
# ContainerResult per container.
PackerFn = Callable[[list[ContainerIn], list[BoxIn]], list[ContainerResult]]

DEFAULT_ALGORITHM = "guillotine"

# Keys match the frontend AlgoId union (uiSlice.ts). All three share the same
# depth-first guillotine engine; algo2/algo3 add increasing local-search budget
# over within-pallet ordering and are guaranteed never worse than guillotine:
#   guillotine — depth-first guillotine, single pass (fastest)
#   algo2      — light iterated local search (fast, small gains on mixed loads)
#   algo3      — deep iterated local search (slow, largest gains on mixed loads)
REGISTRY: dict[str, PackerFn] = {
    "guillotine": run_guillotine,
    "algo2": run_light_search,
    "algo3": run_deep_search,
}


def get_packer(algorithm: str) -> PackerFn:
    """
    Resolve an algorithm key to its packer function.
    @raises KeyError if the key is unknown — callers translate this into an
            HTTP 400 so the frontend receives a clear message.
    """
    return REGISTRY[algorithm]

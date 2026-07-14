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
from algorithms.algo2 import run_algo2
from schema import BoxIn, ContainerIn, ContainerResult

# A packing algorithm: packs boxes into the given containers and returns one
# ContainerResult per container. Called as packer(containers, boxes, lashing=...)
# — every packer accepts an optional `lashing` keyword (default False).
PackerFn = Callable[..., list[ContainerResult]]

DEFAULT_ALGORITHM = "algo2"

# Keys match the frontend AlgoId union (uiSlice.ts). Both share the same
# depth-first guillotine engine and differ only in the within-pallet carton
# consideration order — a deterministic, structural heuristic (no search):
#   guillotine — volume-descending (single pass, baseline)
#   algo2      — height-first (layer-building): flat coplanar shelves so the next
#                pallet stacks with full support, closing cross-pallet gaps
REGISTRY: dict[str, PackerFn] = {
    "guillotine": run_guillotine,
    "algo2": run_algo2,
}


def get_packer(algorithm: str) -> PackerFn:
    """
    Resolve an algorithm key to its packer function.
    @raises KeyError if the key is unknown — callers translate this into an
            HTTP 400 so the frontend receives a clear message.
    """
    return REGISTRY[algorithm]

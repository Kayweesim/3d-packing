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

from packing_algos.algo_v1 import run_algo1
from schema import BoxIn, ContainerIn, ContainerResult

# A packing algorithm: packs boxes into the given containers and returns one
# ContainerResult per container. Called as packer(containers, boxes, lashing=...)
# — every packer accepts an optional `lashing` keyword (default False).
PackerFn = Callable[..., list[ContainerResult]]

# Keys match the frontend AlgoId union (uiSlice.ts).
#   algo1 — size-first ordering (biggest pallets first, biggest cartons first
#           within each, front cut) over the depth-first guillotine engine.
#           See packing_algos/algo_v1/.
REGISTRY: dict[str, PackerFn] = {
    "algo1": run_algo1,
}


def get_packer(algorithm: str) -> PackerFn:
    """
    Resolve an algorithm key to its packer function.
    @raises KeyError if the key is unknown — callers translate this into an
            HTTP 400 so the frontend receives a clear message.
    """
    return REGISTRY[algorithm]

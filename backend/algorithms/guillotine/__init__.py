"""
guillotine — 3D Free-Space Guillotine Bin Packing with gravity.

Two modules:
  helper.py — building blocks: shared tolerances, the `_Space` free-cuboid model
              + coalescing, the full-support / reachability checks, the
              depth-first scorer, and the topological animation-order sort.
  engine.py — the packing engine: the placement loop, per-container packing,
              instance grouping, the flat last-container re-pack, and the public
              `run_guillotine` entry point.

This package's public surface (re-exported below) is `run_guillotine`,
`build_groups`, `pack_into_containers`, and `_Space` — the names the sibling
packers (`algo2.py`, `algo3.py`) and the registry depend on.
"""

from __future__ import annotations

from .helper import _Space, PlacementScore, _position_score, REACH_LIMIT_CM
from .engine import run_guillotine, build_groups, pack_into_containers, _flat_height_cap

__all__ = [
    "run_guillotine",
    "build_groups",
    "pack_into_containers",
    "_Space",
    "PlacementScore",
    "_position_score",
    "REACH_LIMIT_CM",
]

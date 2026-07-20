"""
algo_v1 - the production packing algorithm (registry key "algo1").

A 3D free-space guillotine bin packer with gravity, wrapped in a size-first
ordering layer. Three modules:
  helper.py   - building blocks: shared tolerances, the `_Space` free-cuboid
                model + coalescing, the full-support / reachability checks,
                the depth-first scorer, and the topological animation-order sort.
  engine.py   - the packing engine: the placement loop, per-container packing,
                instance grouping, the flat + staircase last-container re-pack,
                and the multi-container orchestration.
  ordering.py - the algorithm proper: the size-first ordering (biggest pallets
                first, biggest cartons first within each) and the public
                `run_algo1` entry point.

This package's public surface (re-exported below) is `run_algo1`,
`build_groups`, `pack_into_containers` and `_Space` - the names the registry
and the trace endpoint depend on.
"""

from __future__ import annotations

from .helper import _Space, PlacementScore, _position_score, REACH_LIMIT_CM
from .engine import build_groups, pack_into_containers, _flat_height_cap
from .ordering import run_algo1, best_ordering

__all__ = [
    "run_algo1",
    "best_ordering",
    "build_groups",
    "pack_into_containers",
    "_Space",
    "PlacementScore",
    "_position_score",
    "REACH_LIMIT_CM",
]

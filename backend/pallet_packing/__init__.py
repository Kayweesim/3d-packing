"""
pallet_packing — single-SKU pallet layer-pattern optimizer.

A parallel, isolated subsystem to the container packer (packing_algos): given ONE
carton type and a pallet footprint, it computes the best repeating layer pattern
(G4 heuristic) and how many pallets a given quantity needs. Nothing here imports
from packing_algos, and packing_algos does not import from here.

Re-exports the public surface used by the API route (main.py).
"""

from .presets import PalletType, PALLET_TYPES, DEFAULT_PALLET_KEY, resolve_pallet
from .pattern import BoxSpec, Placement3D, PalletPackResult, run_pallet_pack

__all__ = [
    "PalletType",
    "PALLET_TYPES",
    "DEFAULT_PALLET_KEY",
    "resolve_pallet",
    "BoxSpec",
    "Placement3D",
    "PalletPackResult",
    "run_pallet_pack",
]

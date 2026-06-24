"""
bestfit.py — Best-fit guillotine packer (registry key "algo2").

Reuses the guillotine engine unchanged — `build_groups` + `pack_into_containers`
— so the free-space machinery, constraints (full support, reachability, gravity,
stacking, pallet order) and the flat last-container rule all behave identically.
The only difference from `run_guillotine` is the placement scorer.

Depth (z) and gravity (y) stay the *primary* keys, so this never reorders what
the depth-first packer decided on its own — important because plain best-fit is
known to underperform depth-first on dense small-carton loads, which are packed
here exactly as guillotine packs them. The best-fit terms only replace the
arbitrary "left-most x" tiebreak guillotine falls back on when several
candidates sit at the same depth and height: the carton is then seated in the
snuggest free space (least leftover volume) and snuggest orientation (smallest
residual gaps). This tucks cartons into tight gaps and leaves large free spaces
for large cartons, helping heterogeneous / multi-pallet loads.

Adding another scorer-based packer is the same three lines: define a scorer,
write a one-line `run_*` that feeds it to `pack_into_containers`, register it.
"""

from __future__ import annotations

from algorithms.guillotine import _Space, build_groups, pack_into_containers
from schema import BoxIn, ContainerIn, ContainerResult


def _bestfit_score(px: float, py: float, pz: float,
                   bw: float, bh: float, bd: float, sp: _Space) -> tuple:
    """
    Best-fit placement scorer (lower tuple wins).

    Keys, in order:
      pz, py          — depth-first then gravity, identical to guillotine's
                        primary ordering (so dense uniform loads are unchanged).
      leftover volume — among candidates tied on (pz, py), seat into the
                        tightest fitting free space.
      residual gap    — break remaining ties by the snuggest orientation
                        (smallest total slack against the host space).
      px              — deterministic final tiebreak.
    """
    return (
        pz,
        py,
        sp.w * sp.h * sp.d - bw * bh * bd,
        (sp.w - bw) + (sp.h - bh) + (sp.d - bd),
        px,
    )


def run_bestfit(containers: list[ContainerIn], boxes: list[BoxIn]) -> list[ContainerResult]:
    """Pack with the best-fit scorer through the shared guillotine engine."""
    return pack_into_containers(containers, build_groups(boxes), _bestfit_score)

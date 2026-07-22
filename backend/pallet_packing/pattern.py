"""
pattern.py — single-SKU pallet layer-pattern optimizer (G4 heuristic).

Pure, deterministic functions — no imports from packing_algos, no I/O, no global
state. Given ONE carton type and a pallet, it finds the best repeating layer
pattern and how many pallets a quantity needs.

G4 heuristic (Scheithauer & Terno, 1996): up to one horizontal + one vertical
guillotine cut split the pallet footprint into ≤4 rectangular blocks; each block
is packed homogeneously (all cartons the same in-plane orientation within a
block), and orientations may differ across blocks. Layers stack uniformly up to
the height cap (v1 — no alternate-layer 180° interlock yet).

Rotation model: `rotationAllowed` controls only which carton dimension may point
UP (see `_vertical_orientations`). In-plane yaw (spinning a box about the
vertical axis) is always explored by the 2D solver — that is what produces
interlocking layer patterns and is physically independent of "this way up".
"""

from __future__ import annotations

from dataclasses import dataclass
from math import ceil, floor

from .presets import PalletType

# Tolerance for float dimension comparisons (cm are small integers in practice).
_EPS = 1e-9


@dataclass(frozen=True)
class BoxSpec:
    """Carton to pack (cm). Duck-typed against schema.PalletBoxIn in the API route."""
    id: str
    w: float
    h: float
    d: float
    rotationAllowed: bool = True
    stacking: bool = True


@dataclass(frozen=True)
class Placement3D:
    """One placed carton on a single pallet (cm). y is the carton's floor
    (deck top for layer 0), never floating."""
    boxId: str
    x: float
    y: float
    z: float
    w: float
    h: float
    d: float


@dataclass
class PalletPackResult:
    """Outcome for one carton type on one pallet. `placements` describes ONE full
    pallet; the caller replicates it across `pallets_needed` pallets and truncates
    the last to `last_pallet_count`."""
    placements: list[Placement3D]
    per_layer: int
    layers: int
    per_pallet: int
    pallets_needed: int
    last_pallet_count: int
    footprint_util: float   # 0–1, layer footprint area used
    height_util: float      # 0–1, stacked height vs cap
    volume_util: float      # 0–1, carton volume vs pallet envelope
    pallet: PalletType


# ── 2D layer packing (G4) ───────────────────────────────────────────────────

def _cut_positions(a: float, b: float, limit: float) -> list[float]:
    """
    Guillotine cut candidates in [0, limit] of the form i·a + j·b (plus the far
    edge). Cuts at 0 or `limit` collapse one side to empty — i.e. "no cut there" —
    so enumerating these positions covers the 0/1/2-cut cases G4 allows.
    """
    positions: set[float] = set()
    i = 0
    while i * a <= limit + _EPS:
        j = 0
        while i * a + j * b <= limit + _EPS:
            positions.add(round(i * a + j * b, 6))
            j += 1
        i += 1
    positions.add(round(limit, 6))
    return sorted(positions)


def _fill_block(
    bx: float, bz: float, bw: float, bd: float, cw: float, cd: float,
) -> tuple[list[tuple[float, float, float, float]], int]:
    """
    Fill a block (origin bx,bz; size bw×bd) homogeneously with cartons of
    footprint cw×cd, trying both in-plane orientations and keeping the denser one.
    Returns (placements, count); each placement is (x, z, w, d).
    """
    best: list[tuple[float, float, float, float]] = []
    best_count = 0
    for pw, pd in {(cw, cd), (cd, cw)}:
        if pw <= 0 or pd <= 0:
            continue
        nx = floor((bw + _EPS) / pw)
        nz = floor((bd + _EPS) / pd)
        count = nx * nz
        if count > best_count:
            best_count = count
            best = [
                (bx + ix * pw, bz + iz * pd, pw, pd)
                for ix in range(nx)
                for iz in range(nz)
            ]
    return best, best_count


def _layer_patterns(
    cw: float, cd: float, Wp: float, Dp: float,
) -> tuple[list[tuple[float, float, float, float]], int]:
    """
    Best single-layer G4 packing of cartons (footprint cw×cd) onto a Wp×Dp pallet.
    Returns (placements, count); each placement is (x, z, w, d) with the block's
    chosen in-plane orientation baked into (w, d).
    """
    if cw <= 0 or cd <= 0:
        return [], 0

    # Area upper bound — early-exit once a pattern reaches it (can't do better).
    upper = floor((Wp * Dp) / (cw * cd))
    if upper <= 0:
        return [], 0

    x_cuts = _cut_positions(cw, cd, Wp)
    z_cuts = _cut_positions(cw, cd, Dp)

    best_placements: list[tuple[float, float, float, float]] = []
    best_count = 0

    for xc in x_cuts:
        for zc in z_cuts:
            # Four guillotine blocks (some may be empty when xc/zc hit an edge).
            blocks = (
                (0.0, 0.0, xc, zc),
                (xc, 0.0, Wp - xc, zc),
                (0.0, zc, xc, Dp - zc),
                (xc, zc, Wp - xc, Dp - zc),
            )
            placements: list[tuple[float, float, float, float]] = []
            count = 0
            for bx, bz, bw, bd in blocks:
                if bw <= _EPS or bd <= _EPS:
                    continue
                pl, c = _fill_block(bx, bz, bw, bd, cw, cd)
                placements.extend(pl)
                count += c
            if count > best_count:
                best_count = count
                best_placements = placements
                if best_count >= upper:
                    return best_placements, best_count

    return best_placements, best_count


# ── Vertical orientation enumeration ─────────────────────────────────────────

def _vertical_orientations(box: BoxSpec) -> list[tuple[float, float, float]]:
    """
    Which carton dimension points UP. Returns (cw, cd, layer_h) triples — the two
    footprint dims plus the resulting layer height. All 3 axes (deduplicated) when
    rotation is allowed; natural h-up only otherwise.
    """
    if not box.rotationAllowed:
        return [(box.w, box.d, box.h)]

    raw = [
        (box.w, box.d, box.h),  # h up  → footprint w×d
        (box.h, box.d, box.w),  # w up  → footprint h×d
        (box.w, box.h, box.d),  # d up  → footprint w×h
    ]
    seen: set[tuple[float, float, float]] = set()
    out: list[tuple[float, float, float]] = []
    for cw, cd, layer_h in raw:
        key = (min(cw, cd), max(cw, cd), layer_h)  # footprint is orientation-agnostic in-plane
        if key not in seen:
            seen.add(key)
            out.append((cw, cd, layer_h))
    return out


# ── Public entry point ───────────────────────────────────────────────────────

def run_pallet_pack(box: BoxSpec, pallet: PalletType, quantity: int) -> PalletPackResult:
    """
    Pack `quantity` cartons of one type onto `pallet`, choosing the vertical
    orientation + layer pattern that maximizes cartons-per-pallet.

    Steps:
      1. For each vertical orientation, best per-layer count via `_layer_patterns`.
      2. n_layers = 1 if the carton is non-stackable, else floor(Hmax / layer_h).
      3. per_pallet = per_layer · n_layers; pick the orientation maximizing
         per_pallet (tie-break: better footprint-area utilization).
      4. Build ONE full pallet's placements (uniform column stacking).
      5. pallets_needed = ceil(quantity / per_pallet); last pallet is partial.
    """
    Wp, Dp, Hmax, deck = pallet.Wp, pallet.Dp, pallet.max_height, pallet.deck_h

    # best = (per_pallet, footprint_area, cw, cd, layer_h, n_layers, per_layer, placements2d)
    best: tuple[int, float, float, float, float, int, int, list] | None = None

    for cw, cd, layer_h in _vertical_orientations(box):
        if layer_h <= 0 or layer_h > Hmax + _EPS:
            continue  # a single layer already exceeds the height cap → infeasible
        placements2d, per_layer = _layer_patterns(cw, cd, Wp, Dp)
        if per_layer == 0:
            continue
        n_layers = 1 if not box.stacking else max(1, floor((Hmax + _EPS) / layer_h))
        per_pallet = per_layer * n_layers
        footprint_area = per_layer * cw * cd
        if best is None or (per_pallet, footprint_area) > (best[0], best[1]):
            best = (per_pallet, footprint_area, cw, cd, layer_h, n_layers, per_layer, placements2d)

    if best is None:
        # Carton doesn't fit on the pallet in any orientation within the cap.
        return PalletPackResult([], 0, 0, 0, 0, 0, 0.0, 0.0, 0.0, pallet)

    per_pallet, footprint_area, cw, cd, layer_h, n_layers, per_layer, placements2d = best

    # Build ONE full pallet's placements — uniform column stacking, deck-relative.
    placements: list[Placement3D] = []
    for layer in range(n_layers):
        y = deck + layer * layer_h
        for x, z, pw, pd in placements2d:
            placements.append(Placement3D(box.id, x, y, z, pw, layer_h, pd))

    pallets_needed = ceil(quantity / per_pallet) if quantity > 0 else 0
    last_pallet_count = quantity - (pallets_needed - 1) * per_pallet if pallets_needed > 0 else 0

    box_vol = box.w * box.h * box.d
    footprint_util = footprint_area / (Wp * Dp) if Wp * Dp > 0 else 0.0
    height_util = (n_layers * layer_h) / Hmax if Hmax > 0 else 0.0
    volume_util = (per_pallet * box_vol) / (Wp * Dp * Hmax) if Wp * Dp * Hmax > 0 else 0.0

    return PalletPackResult(
        placements=placements,
        per_layer=per_layer,
        layers=n_layers,
        per_pallet=per_pallet,
        pallets_needed=pallets_needed,
        last_pallet_count=last_pallet_count,
        footprint_util=footprint_util,
        height_util=height_util,
        volume_util=volume_util,
        pallet=pallet,
    )

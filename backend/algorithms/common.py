"""
common.py — shared math used by every packing algorithm.

Both gravity_settle and overlaps_3d operate on plain dicts of the shape:
    {"x": float, "y": float, "z": float, "w": float, "h": float, "d": float}

Using dicts (not dataclasses) keeps the hot loop free of attribute lookup overhead
and avoids any import coupling between algorithm modules.
"""

from __future__ import annotations
from typing import TypedDict


class PlacedBox(TypedDict):
    x: float
    y: float
    z: float
    w: float
    h: float
    d: float


def gravity_settle(
    x: float,
    z: float,
    bw: float,
    bd: float,
    placed: list[PlacedBox],
) -> float:
    """
    Return the Y coordinate at which a box with footprint (x, z, bw, bd) would
    come to rest if dropped straight down under gravity.

    We scan every already-placed box and check whether its XZ footprint overlaps
    the incoming box's XZ footprint.  If it does, the top face of that box
    (p.y + p.h) is a potential floor for the incoming box.  We take the maximum
    across all overlapping boxes, which gives the true resting surface.

    If nothing overlaps (open air all the way down) the box lands on the
    container floor at y = 0.

    Why XZ overlap, not full 3D?  We haven't fixed Y yet — that's what we're
    calculating.  The constraint is purely spatial: "is there something directly
    below this footprint?"
    """
    floor = 0.0
    for p in placed:
        # XZ AABB overlap: two intervals [a, a+len) and [b, b+len) overlap iff
        # a < b+len AND b < a+len.  Test both axes independently.
        x_overlap = x < p["x"] + p["w"] and p["x"] < x + bw
        z_overlap = z < p["z"] + p["d"] and p["z"] < z + bd
        if x_overlap and z_overlap:
            floor = max(floor, p["y"] + p["h"])
    return floor


def overlaps_3d(
    ax: float, ay: float, az: float, aw: float, ah: float, ad: float,
    bx: float, by: float, bz: float, bw: float, bh: float, bd: float,
) -> bool:
    """
    Return True if box A and box B share any interior volume (AABB test).

    Two axis-aligned boxes overlap if and only if they overlap on ALL three axes
    simultaneously.  A single non-overlapping axis is enough to separate them
    (separating axis theorem for AABBs).

    Uses strict inequalities (< not <=) so boxes that merely touch face-to-face
    are NOT considered overlapping — touching is fine, penetrating is not.
    """
    x_sep = ax + aw <= bx or bx + bw <= ax
    y_sep = ay + ah <= by or by + bh <= ay
    z_sep = az + ad <= bz or bz + bd <= az
    return not (x_sep or y_sep or z_sep)


def get_orientations(w: float, h: float, d: float, rotation_allowed: bool = True) -> list[tuple[float, float, float]]:
    """
    Return the set of geometrically distinct axis-aligned orientations for a box.

    If rotation_allowed is False, only the original (w, h, d) orientation is returned.
    A fully asymmetric box (all dims different) has 6 orientations.
    A box with two equal dims has 3 unique orientations.
    A cube has 1 (deduplication makes rotation a no-op for cubes regardless).

    We deduplicate by canonical string key so callers never try the same shape twice.
    """
    if not rotation_allowed:
        return [(w, h, d)]

    seen: set[str] = set()
    result: list[tuple[float, float, float]] = []
    for ow, oh, od in [
        (w, h, d), (w, d, h),
        (h, w, d), (h, d, w),
        (d, w, h), (d, h, w),
    ]:
        key = f"{ow},{oh},{od}"
        if key not in seen:
            seen.add(key)
            result.append((ow, oh, od))
    return result

"""
helper.py — building blocks for the guillotine engine.

Holds everything the engine depends on but that isn't the packing loop itself:
shared tolerances, the free-space model + coalescing, the feasibility checks
(full support, reachability), the placement scorer, and the animation-order
topological sort.

═══════════════════════════════════════════════════════════════════════════════
WHY FREE SPACES DON'T OVERLAP IN XZ
═══════════════════════════════════════════════════════════════════════════════
Each guillotine split (performed by the engine) produces three regions with
disjoint XZ footprints:
  Right   → X > px+bw          (right column, full Z range)
  Front   → X ∈ [sx, px+bw],   Z > pz+bd
  Above   → X ∈ [sx, px+bw],   Z ∈ [sz, pz+bd]  (same XZ as box, higher Y)

Right vs Front:  different X ranges.
Right vs Above:  different X ranges.
Front vs Above:  same X, different Z ranges.

Because free spaces never overlap in XZ (provable by induction), gravity_settle
for any candidate position inside a free space will return exactly the space's
Y floor — cartons placed in other spaces cannot underlie this region.

═══════════════════════════════════════════════════════════════════════════════
FULL-SUPPORT CONSTRAINT
═══════════════════════════════════════════════════════════════════════════════
A carton placed at py > 0 must have its entire bottom face covered by the top
faces of already-placed cartons.  We sum XZ intersection areas between the
candidate bottom face and every placed carton whose top is at exactly py.
Accept only if the sum ≥ bw × bd.  (Since placed cartons never overlap, summing
intersection areas is equivalent to computing union coverage.)

═══════════════════════════════════════════════════════════════════════════════
FREE-SPACE COALESCING (BETWEEN PALLETS)
═══════════════════════════════════════════════════════════════════════════════
A finished pallet leaves its free spaces fragmented at its own grid pitch — e.g.
the shelf on top of a uniform pallet survives as one "Above" space per column.
Before each new pallet packs, the free-space list is coalesced: any two spaces
that share a full face and abut are fused into their union (geometrically safe —
the union is itself a free cuboid).  This lets the next pallet pack at its own
pitch instead of inheriting the previous pallet's grid, closing the gaps that
otherwise appear between differently-sized pallets.

═══════════════════════════════════════════════════════════════════════════════
TOPOLOGICAL SORT (ANIMATION ORDER)
═══════════════════════════════════════════════════════════════════════════════
Kahn's BFS on the support graph (edge j→i: j's top face supports i's bottom
face).  Tie-break within each BFS frontier: (colorIndex, centre-Z, y, x) — back
→ door, then bottom-up, then left-to-right — so cartons animate in the z-first
inside-out loading order the frontend expects (this holds for flat/lashing-off
packs too, where a whole z-slice shares one centre-Z).
"""

from __future__ import annotations

from typing import Callable


# ── Shared tolerances and limits ─────────────────────────────────────────────────

_MIN_DIM        = 1e-3   # discard sub-spaces thinner than this
_EPS            = 1e-9   # float comparison tolerance
REACH_LIMIT_CM  = 50.0   # max depth a loader can reach past a blocking carton wall


# ── Free space ─────────────────────────────────────────────────────────────────

class _Space:
    """A free rectangular cuboid inside a container available for placement.
    Origin (x, y, z) is the back-bottom-left corner; w/h/d are its extents."""
    __slots__ = ("x", "y", "z", "w", "h", "d")

    def __init__(self, x: float, y: float, z: float,
                 w: float, h: float, d: float) -> None:
        self.x = x; self.y = y; self.z = z
        self.w = w; self.h = h; self.d = d


# ── Full-support check ─────────────────────────────────────────────────────────

def _is_fully_supported(
    px: float, py: float, pz: float,
    bw: float, bd: float,
    placed: list[dict],
) -> bool:
    if py < _EPS:
        return True
    covered = 0.0
    required = bw * bd
    for p in placed:
        if abs((p["y"] + p["h"]) - py) > _EPS:
            continue
        ix  = max(px, p["x"])
        ix2 = min(px + bw, p["x"] + p["w"])
        iz  = max(pz, p["z"])
        iz2 = min(pz + bd, p["z"] + p["d"])
        if ix2 > ix and iz2 > iz:
            # Reject if any supporting carton has stacking disabled
            if not p.get("stacking", True):
                return False
            covered += (ix2 - ix) * (iz2 - iz)
            if covered >= required - _EPS:
                return True
    return False


# ── Topological sort ───────────────────────────────────────────────────────────

def _topological_sort(placed: list[dict]) -> list[dict]:
    """
    Kahn's BFS with pallet-grouped, z→y→x ordering.

    Sort key within the BFS frontier: (colorIndex, centre_z, y, x).
    This guarantees every carton from pallet N animates before any carton from
    pallet N+1, and within a pallet cartons animate z-first (back → door), then
    bottom-up, then left-to-right. The y/x terms matter for flat (lashing-off)
    packs: there a whole z-slice shares one centre_z, and without them the BFS
    would drain layer-by-layer (all floor, then all stacks) — y-first — instead
    of finishing each z-slice before advancing.
    The topological constraint (supporter before supported) is still enforced —
    edges exist where one carton's top face directly supports another's bottom —
    and z being the primary key keeps a stacked carton's z-slice intact, so a
    box never animates before the box beneath it.
    """
    n = len(placed)
    if n == 0:
        return []

    rev: list[list[int]] = [[] for _ in range(n)]
    in_deg: list[int] = [0] * n

    for i in range(n):
        pi = placed[i]
        if pi["y"] < _EPS:
            continue
        for j in range(n):
            if i == j:
                continue
            pj = placed[j]

            # In a way, both if statements check if the box is stacked on top of the other.
            if abs((pj["y"] + pj["h"]) - pi["y"]) > _EPS:
                continue

            # Check overlap
            if (pj["x"] < pi["x"] + pi["w"] and pj["x"] + pj["w"] > pi["x"] and
                    pj["z"] < pi["z"] + pi["d"] and pj["z"] + pj["d"] > pi["z"]):
                rev[j].append(i)
                in_deg[i] += 1

    def _sort_key(i: int) -> tuple:
        p = placed[i]
        # z-slice (centre_z) first, then bottom-up (y), then left-to-right (x).
        return (p.get("colorIndex", 0), p["z"] + p["d"] / 2, p["y"], p["x"])

    ready: list[int] = sorted(
        [i for i in range(n) if in_deg[i] == 0], key=_sort_key
    )
    out: list[dict] = []

    while ready:
        i = ready.pop(0)
        out.append(placed[i])
        for j in rev[i]:
            in_deg[j] -= 1
            if in_deg[j] == 0:
                pos = len(ready)
                key_j = _sort_key(j)
                # How the sorting key works is that both are tuples (colorIndex (group), then z-indexed), if group is lower then it comes first (key_j will be less than the current
                # iterated ready[pos - 1]). Same goes for z-index).
                while pos > 0 and _sort_key(ready[pos - 1]) > key_j:
                    pos -= 1
                ready.insert(pos, j)
    return out


# ── Placement scoring (To ensure z-first, then height) ───────────────────────────────────────────────────────────

# A placement scorer ranks a candidate (lower tuple wins). Parametrizing the
# engine on this lets alternative algorithms (best-fit, metaheuristic) reuse the
# exact same placement machinery with a different placement preference.
# Signature: (px, py, pz, bw, bh, bd, space) -> comparable tuple.
PlacementScore = Callable[[float, float, float, float, float, float, "_Space"], tuple]


def _position_score(px: float, py: float, pz: float,
                    bw: float, bh: float, bd: float, sp: _Space) -> tuple:
    """
    Default (guillotine) scorer — depth-first fill.
    Fill each z-slice completely (floor + stack) before advancing toward the
    door; within a z-slice prefer low Y (gravity), then low X (left-to-right).
    """
    return (pz, py, px)


# ── Reachability check ────────────────────────────────────────────────────────

def _is_reachable(space: _Space, placed: list[dict]) -> bool:
    """
    Return False if a placed carton blocks the path to this space from the door.

    A space is blocked when any placed carton simultaneously:
      - overlaps the space in X (same lateral lane), AND
      - has its door-facing front face more than REACH_LIMIT_CM closer to the
        door than the space's own entrance (space.z + space.d).

    The reach required = p_front - z_open.  If that exceeds REACH_LIMIT_CM a
    loader standing at the door cannot reach past the blocking wall to place a
    carton into the space.
    """
    z_open = space.z + space.d  # face of this space closest to the door
    for p in placed:
        # No X overlap → carton is in a different lateral lane, not blocking
        if p["x"] + p["w"] <= space.x + _EPS or p["x"] >= space.x + space.w - _EPS:
            continue
        p_front = p["z"] + p["d"]
        if p_front - z_open > REACH_LIMIT_CM:
            return False
    return True


# ── Free-space coalescing ────────────────────────────────────────────────────────

def _try_merge(a: _Space, b: _Space) -> _Space | None:
    """
    If `a` and `b` share a full face and abut along one axis, return their union
    as a single _Space; otherwise None.

    Full-face merging is geometrically safe: two non-overlapping free cuboids
    that share an entire face have a union that is itself exactly a cuboid and is
    wholly free, so it can never overlap a placed carton or another free space.
    """
    # Merge along X (shared Y-H and Z-D faces, abutting in X)
    if (abs(a.y - b.y) < _EPS and abs(a.h - b.h) < _EPS and
            abs(a.z - b.z) < _EPS and abs(a.d - b.d) < _EPS):
        if abs(a.x + a.w - b.x) < _EPS:
            return _Space(a.x, a.y, a.z, a.w + b.w, a.h, a.d)
        if abs(b.x + b.w - a.x) < _EPS:
            return _Space(b.x, a.y, a.z, a.w + b.w, a.h, a.d)
    # Merge along Z (shared X-W and Y-H faces, abutting in Z)
    if (abs(a.x - b.x) < _EPS and abs(a.w - b.w) < _EPS and
            abs(a.y - b.y) < _EPS and abs(a.h - b.h) < _EPS):
        if abs(a.z + a.d - b.z) < _EPS:
            return _Space(a.x, a.y, a.z, a.w, a.h, a.d + b.d)
        if abs(b.z + b.d - a.z) < _EPS:
            return _Space(a.x, a.y, b.z, a.w, a.h, a.d + b.d)
    # Merge along Y (shared X-W and Z-D faces, abutting in Y)
    if (abs(a.x - b.x) < _EPS and abs(a.w - b.w) < _EPS and
            abs(a.z - b.z) < _EPS and abs(a.d - b.d) < _EPS):
        if abs(a.y + a.h - b.y) < _EPS:
            return _Space(a.x, a.y, a.z, a.w, a.h + b.h, a.d)
        if abs(b.y + b.h - a.y) < _EPS:
            return _Space(a.x, b.y, a.z, a.w, a.h + b.h, a.d)
    return None


def _merge_spaces(spaces: list[_Space]) -> None:
    """
    Coalesce the free-space list in place: repeatedly fuse full-face-adjacent
    cuboids until none remain. This defragments the spaces a finished pallet
    leaves behind (e.g. the per-column "Above" shelves on top of a uniform
    pallet) into single contiguous regions, so the next pallet packs at its own
    pitch instead of inheriting the previous pallet's grid — closing the gaps
    that otherwise appear between differently-sized pallets.
    """
    merged = True
    while merged:
        merged = False
        i = 0
        while i < len(spaces):
            j = i + 1
            while j < len(spaces):
                fused = _try_merge(spaces[i], spaces[j])
                if fused is not None:
                    spaces[i] = fused
                    spaces.pop(j)
                    merged = True
                else:
                    j += 1
            i += 1

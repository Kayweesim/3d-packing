"""
guillotine.py — 3D Free-Space Guillotine Bin Packing with gravity

═══════════════════════════════════════════════════════════════════════════════
HOW IT WORKS
═══════════════════════════════════════════════════════════════════════════════
The packer maintains a list of free rectangular cuboids (free spaces).  The
container starts as a single free space equal to its full interior.

For each carton instance (in pallet-group order, volume-desc within group):
  1. Try every (free space, orientation) pair.
  2. Place at (space.x, gravity_settle(...), space.z) — always the XZ corner of
     the space; Y is computed by scanning placed cartons for the highest surface
     directly below this footprint.
  3. Score by (settled_y, space.z, space.x) — lower is better (gravity → back →
     left).  Reject candidates that float (full-support check) or exceed the
     space's Y ceiling.
  4. Accept the best candidate, remove the used space, and add up to 3
     non-overlapping sub-spaces produced by guillotine cuts:
       • Right:  everything to the right of the placed carton (full height/depth)
       • Front:  same X-range as carton, in front of it (full height, rest depth)
       • Above:  same XZ as carton, above it (remaining height)

═══════════════════════════════════════════════════════════════════════════════
WHY FREE SPACES DON'T OVERLAP IN XZ
═══════════════════════════════════════════════════════════════════════════════
Each split produces three regions with disjoint XZ footprints:
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
face).  Tie-break within each BFS frontier: smallest centre-Z first (back →
door), so cartons animate in the inside-out loading order the frontend expects.
"""

from __future__ import annotations
from collections import defaultdict
from typing import Callable

from algorithms.common import gravity_settle, get_orientations
from schema import ContainerIn, BoxIn, PlacementOut, ContainerResult


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
    Kahn's BFS with pallet-grouped, back-to-front ordering.

    Sort key within the BFS frontier: (colorIndex, centre_z).
    This guarantees every carton from pallet N animates before any carton from
    pallet N+1, and within a pallet cartons animate back-to-front.
    The topological constraint (supporter before supported) is still enforced —
    edges exist where one carton's top face directly supports another's bottom.
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
        return (p.get("colorIndex", 0), p["z"] + p["d"] / 2)

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


def _flat_score(px: float, py: float, pz: float,
                bw: float, bh: float, bd: float, sp: _Space) -> tuple:
    """
    Height-first scorer used to re-pack the final container (see
    `pack_into_containers`). Spread cartons across the floor before stacking so a
    partially-filled last container stays low and flat — stable instead of a
    tall, topple-prone back wall. Within a layer prefer back (low Z), then left
    (low X).

    Only affects *where* cartons land, not the animation order: the topological
    sort still replays them back-to-front, column-by-column (a stacked carton
    becomes ready right after its floor supporter and wins the centre-Z
    tie-break over more-forward floor cartons), so the visualization stays
    Z-prioritized and never asks a loader to step over packed cartons.
    """
    return (py, pz, px)


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


# ── Single-group packing ───────────────────────────────────────────────────────

def _pack_group(
    group: list[dict],
    spaces: list[_Space],
    placed: list[dict],
    score_fn: PlacementScore,
    check_reach: bool = True,
) -> tuple[list[dict], list[dict]]:
    """
    Pack one pallet group into the given free spaces.
    `placed` contains all previously placed cartons and is used for gravity
    settling; it is NOT modified here — caller appends the returned placed list.
    Returns (pallet_placed, pallet_overflow).
    """
    pallet_placed: list[dict] = []
    overflow: list[dict] = []
    # Combined view for gravity/support checks — grows as this group places
    all_placed = placed  # read-only alias; gravity/support checks use all_placed + pallet_placed

    for inst in group:
        iw, ih, id_ = inst["w"], inst["h"], inst["d"]
        best_score: tuple | None = None
        best: tuple | None = None   # (si, px, py, pz, bw, bh, bd)

        current = all_placed + pallet_placed  # gravity sees everything so far

        # Flat fill spreads along the floor, fragmenting it (and the shelf above)
        # into per-carton spaces; coalesce them each step so later cartons and the
        # next layer can use the combined gaps. The depth-first scorer fills clean
        # z-slices and only needs the between-pallet merge in _pack_container.
        if score_fn is _flat_score:
            _merge_spaces(spaces)

        for si, sp in enumerate(spaces):
            if check_reach and not _is_reachable(sp, current):
                continue  # loader cannot reach past the blocking wall to this space
            for bw, bh, bd in get_orientations(iw, ih, id_, inst.get("rotationAllowed", True)):
                if bw > sp.w + _EPS or bd > sp.d + _EPS or bh > sp.h + _EPS:
                    continue

                px = sp.x
                pz = sp.z
                py = gravity_settle(px, pz, bw, bd, current)  # type: ignore[arg-type]

                if py + bh > sp.y + sp.h + _EPS:
                    continue

                if not _is_fully_supported(px, py, pz, bw, bd, current):
                    continue

                score = score_fn(px, py, pz, bw, bh, bd, sp)
                if best_score is None or score < best_score:
                    best_score = score
                    best = (si, px, py, pz, bw, bh, bd)

        if best is None:
            overflow.append(inst)
            continue

        si, px, py, pz, bw, bh, bd = best
        pallet_placed.append({"id": inst["id"], "x": px, "y": py, "z": pz,
                               "w": bw, "h": bh, "d": bd,
                               "colorIndex": inst.get("colorIndex", 0),
                               "stacking": inst.get("stacking", True)})

        sp = spaces.pop(si)

        # ── Guillotine split: Front-first ─────────────────────────────────────
        # Cutting along z=pz+bd first preserves the FULL width of the parent
        # space in the Front sub-space.  Without this, successive small cartons
        # carved from the Right sub-space leave only narrow (carton-width) Front
        # strips, preventing larger cartons from subsequent pallets fitting at all.
        #
        # Three non-overlapping sub-spaces:
        #   Front          z > pz+bd, full width sp.w, full height sp.h
        #   Right-in-back  x > px+bw, z ∈ [sp.z, pz+bd], full height sp.h
        #   Above          x ∈ [sp.x, px+bw], z ∈ [sp.z, pz+bd], y > py+bh

        # Front: remaining depth at full width — large cartons from later pallets land here 
        fd = sp.d - bd
        if fd > _MIN_DIM:
            spaces.append(_Space(sp.x, sp.y, pz + bd, sp.w, sp.h, fd))

        # Right-in-back: right of placed carton, within its z-slice
        rw = sp.w - bw
        if rw > _MIN_DIM:
            spaces.append(_Space(px + bw, sp.y, sp.z, rw, sp.h, bd))

        # Above: directly above placed carton — enables stacking within this z-slice
        above_h = (sp.y + sp.h) - (py + bh)
        if above_h > _MIN_DIM:
            spaces.append(_Space(sp.x, py + bh, sp.z, bw, above_h, bd))

    return pallet_placed, overflow


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


# ── Multi-pallet container packing ─────────────────────────────────────────────

def _pack_container(
    container: ContainerIn,
    groups: list[list[dict]],
    score_fn: PlacementScore,
    check_reach: bool = True,
) -> tuple[list[dict], list[list[dict]]]:
    """
    Pack pallet groups sequentially into one shared free-space list.

    Pallet order is preserved — every carton of a pallet is attempted before
    the next pallet starts — but all free spaces (floor-level gaps, Above
    spaces) carry over between pallets, so a later pallet's cartons may fill
    gaps left beside or above an earlier pallet's cartons.  Pallet identity
    is preserved logically (group order, colorIndex) rather than spatially.

    `check_reach=False` lifts the reachability constraint — used only for the
    flat re-pack of the final container, where the topological sort guarantees a
    column-by-column (back-to-front) load order, so a low flat stack is reachable
    even though the floor-first fill order would otherwise look blocked.

    Returns (placed, overflow_groups) where overflow_groups preserves the
    per-pallet list structure so the caller can pass it directly to the next
    container without regrouping by colorIndex.
    """
    placed: list[dict] = []
    overflow_groups: list[list[dict]] = []
    spaces: list[_Space] = [
        _Space(0.0, 0.0, 0.0, container.w, container.h, container.d)
    ]

    for group in groups:
        if not group or not spaces:
            overflow_groups.append(group)
            continue

        # Defragment spaces left by previous pallets so this pallet packs at its
        # own pitch instead of inheriting the prior pallet's grid (closes gaps).
        _merge_spaces(spaces)

        pallet_placed, pallet_overflow = _pack_group(group, spaces, placed, score_fn, check_reach)
        placed.extend(pallet_placed)
        if pallet_overflow:
            overflow_groups.append(pallet_overflow)

    return placed, overflow_groups


# ── Reusable engine (shared by guillotine, best-fit, metaheuristic) ──────────────

def build_groups(boxes: list[BoxIn]) -> list[list[dict]]:
    """
    Expand boxes into carton instances grouped by pallet (colorIndex).

    Pallet groups are ordered by colorIndex ascending (the pick sequence), and
    within each group carton instances are sorted by volume descending so the
    largest cartons claim the deepest, lowest free spaces first. The returned
    list structure (one inner list per pallet) is the unit of work the engine
    and the metaheuristic both operate on.
    """
    groups: dict[int, list[dict]] = defaultdict(list)
    for box in boxes:
        base = {"id": box.id, "w": box.w, "h": box.h, "d": box.d,
                "colorIndex": box.colorIndex,
                "rotationAllowed": box.rotationAllowed,
                "stacking": box.stacking}
        for _ in range(box.quantity):
            groups[box.colorIndex].append(dict(base))

    ordered_groups: list[list[dict]] = []
    for ci in sorted(groups):
        group = groups[ci]
        group.sort(key=lambda b: b["w"] * b["h"] * b["d"], reverse=True)
        ordered_groups.append(group)
    return ordered_groups


def pack_into_containers(
    containers: list[ContainerIn],
    ordered_groups: list[list[dict]],
    score_fn: PlacementScore = _position_score,
    apply_flat: bool = True,
) -> list[ContainerResult]:
    """
    Pack the given pallet groups sequentially across the containers using
    `score_fn` to rank candidate placements, then build per-container results.

    Pure with respect to `ordered_groups` (instances are read, never mutated),
    so callers may invoke it repeatedly with different orderings — this is what
    lets the metaheuristic re-decode perturbed orderings cheaply.

    When `apply_flat` is True, the last loaded container is then re-packed
    height-first (`_flat_score`) so a partially-filled final container sits low
    and flat (topple-safe) instead of as a tall back wall. This is a pure
    post-process: the normal pass alone decides the container count and which
    cartons land where, and the flat arrangement is kept only if every carton
    still fits — otherwise the denser depth-first arrangement stands (a full
    container has no toppling risk). Set `apply_flat=False` (the "lashing" case)
    to keep the depth-first arrangement everywhere — the load is secured by
    lashing, so tall stacking is acceptable.

    Returns one ContainerResult per container (empty placements if nothing
    remained to pack for that container).
    """
    # Pass 1: pack every container with the normal scorer. Stash each
    # container's placements alongside the groups it was handed, so the flat
    # re-pack below can re-run on that exact input.
    states: list[tuple[ContainerIn, list[dict], list[list[dict]]]] = []
    remaining_groups = ordered_groups
    for container in containers:
        if not remaining_groups:
            states.append((container, [], []))
            continue
        input_groups = remaining_groups
        placed, remaining_groups = _pack_container(container, input_groups, score_fn)
        states.append((container, placed, input_groups))

    # Flat re-pack: re-arrange the last container that actually received cartons.
    # Reachability is lifted here (the topological sort still loads it
    # back-to-front, column-by-column, so a low flat stack is reachable). Keep it
    # only if every carton still fits (len unchanged); otherwise the depth-first
    # arrangement stands. `flat_idx` marks the flattened container for the UI.
    last_loaded = max((i for i, s in enumerate(states) if s[1]), default=-1)
    flat_idx = -1
    if apply_flat and last_loaded >= 0:
        container, depth_placed, input_groups = states[last_loaded]
        flat_placed, _ = _pack_container(container, input_groups, _flat_score, check_reach=False)
        if len(flat_placed) == len(depth_placed):
            states[last_loaded] = (container, flat_placed, input_groups)
            flat_idx = last_loaded

    # Pass 2: topologically sort each container's placements and build results.
    results: list[ContainerResult] = []
    for i, (container, placed, _) in enumerate(states):
        sorted_placed = _topological_sort(placed)
        container_vol = container.w * container.h * container.d
        used_vol = sum(p["w"] * p["h"] * p["d"] for p in sorted_placed)
        results.append(ContainerResult(
            containerId=container.id,
            placements=[
                PlacementOut(
                    boxId=p["id"],
                    x=p["x"], y=p["y"], z=p["z"],
                    w=p["w"], h=p["h"], d=p["d"],
                )
                for p in sorted_placed
            ],
            utilization=used_vol / container_vol,
            flatApplied=(i == flat_idx),
        ))

    return results


# ── Public entry point ─────────────────────────────────────────────────────────

def run_guillotine(
    containers: list[ContainerIn],
    boxes: list[BoxIn],
    lashing: bool = False,
) -> list[ContainerResult]:
    """
    Pack boxes into containers using the guillotine algorithm with depth-first
    (back → bottom → left) placement scoring.

    `lashing=True` skips the flat last-container re-pack (the load is secured, so
    tall depth-first stacking is acceptable).
    """
    ordered_groups = build_groups(boxes)
    return pack_into_containers(containers, ordered_groups, _position_score,
                                apply_flat=not lashing)

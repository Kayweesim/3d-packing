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
TOPOLOGICAL SORT (ANIMATION ORDER)
═══════════════════════════════════════════════════════════════════════════════
Kahn's BFS on the support graph (edge j→i: j's top face supports i's bottom
face).  Tie-break within each BFS frontier: smallest centre-Z first (back →
door), so cartons animate in the inside-out loading order the frontend expects.
"""

from __future__ import annotations
from collections import defaultdict

from algorithms.common import gravity_settle, get_orientations
from schema import ContainerIn, BoxIn, PlacementOut, ContainerResult


_MIN_DIM = 1e-3   # discard sub-spaces thinner than this
_EPS     = 1e-9   # float comparison tolerance


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
                while pos > 0 and _sort_key(ready[pos - 1]) > key_j:
                    pos -= 1
                ready.insert(pos, j)
    return out


# ── Single-group packing ───────────────────────────────────────────────────────

def _pack_group(
    group: list[dict],
    spaces: list[_Space],
    placed: list[dict],
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

        for si, sp in enumerate(spaces):
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

                # Depth-first: fill each z-slice completely (floor + stack)
                # before advancing toward the door.  Within a z-slice prefer
                # low Y (gravity), then low X (left-to-right).
                score = (pz, py, px)
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


# ── Multi-pallet container packing ─────────────────────────────────────────────

def _pack_container(
    container: ContainerIn,
    groups: list[list[dict]],
) -> tuple[list[dict], list[dict]]:
    """
    Pack pallet groups sequentially with clean z-separation between pallets.

    After each pallet group finishes, the z-frontier (max z+d across all its
    placements) is computed and the free space list is reset to a single Front
    space starting at that frontier.  This guarantees:
      - Each pallet occupies its own contiguous z-zone (back → door order)
      - No carton from a later pallet can squeeze into the Above / Right-in-back
        sub-spaces left by an earlier pallet
      - Gravity and full-support constraints are still honoured across all
        placed cartons, so stacking within a pallet is physically valid
    """
    placed: list[dict] = []
    overflow: list[dict] = []
    spaces: list[_Space] = [
        _Space(0.0, 0.0, 0.0, container.w, container.h, container.d)
    ]

    for group in groups:
        if not group or not spaces:
            overflow.extend(group)
            continue

        pallet_placed, pallet_overflow = _pack_group(group, spaces, placed)
        placed.extend(pallet_placed)
        overflow.extend(pallet_overflow)

        if not pallet_placed:
            continue

        # Advance the z-frontier to the front face of the deepest carton placed
        # by this pallet, then rebuild the free space list:
        #
        #   Keep  — Above spaces (sp.y > 0) within this pallet's z-zone.
        #           These represent vertical gaps above this pallet's cartons.
        #           The next pallet can stack into them; gravity_settle will land
        #           on this pallet's top face, and full-support is still checked.
        #
        #   Discard — Floor-level spaces (sp.y == 0) within this pallet's z-zone.
        #             These are Right-in-back gaps beside this pallet's cartons at
        #             the same height.  Letting the next pallet use them would
        #             place cartons side-by-side with this pallet in its z-zone,
        #             breaking the per-pallet z-separation constraint.
        #
        #   Add   — A single clean Front space at z_frontier with full container
        #           width and height.  This is the next pallet's primary zone.
        z_frontier = max(p["z"] + p["d"] for p in pallet_placed)
        remaining_d = container.d - z_frontier

        above_spaces = [
            sp for sp in spaces
            if sp.y > _EPS and sp.z + sp.d <= z_frontier + _EPS
        ]
        front_spaces = (
            [_Space(0.0, 0.0, z_frontier, container.w, container.h, remaining_d)]
            if remaining_d > _MIN_DIM else []
        )
        spaces = above_spaces + front_spaces

    return placed, overflow


# ── Public entry point ─────────────────────────────────────────────────────────

def run_guillotine(
    containers: list[ContainerIn],
    boxes: list[BoxIn],
) -> list[ContainerResult]:
    """
    Pack boxes into containers sequentially using the guillotine algorithm.

    Input ordering:
      - Pallet groups are preserved (sorted by colorIndex ascending).
      - Within each group, carton types are sorted by individual volume descending
        so the largest cartons claim the deepest, lowest free spaces first.

    Returns one ContainerResult per container (empty placements if nothing
    remained to pack for that container).
    """
    # Build flat instance list grouped by pallet (colorIndex), volume-desc within group
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

    results: list[ContainerResult] = []
    remaining_groups = ordered_groups

    for container in containers:
        if not remaining_groups:
            results.append(ContainerResult(
                containerId=container.id,
                placements=[],
                utilization=0.0,
            ))
            continue

        placed, overflow_flat = _pack_container(container, remaining_groups)

        # Rebuild remaining_groups from overflow, grouped by colorIndex (pallet identity)
        if overflow_flat:
            overflow_by_color: dict[int, list[dict]] = defaultdict(list)
            for inst in overflow_flat:
                overflow_by_color[inst.get("colorIndex", 0)].append(inst)
            remaining_groups = [
                overflow_by_color[ci]
                for ci in sorted(overflow_by_color)
            ]
        else:
            remaining_groups = []

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
        ))

    return results

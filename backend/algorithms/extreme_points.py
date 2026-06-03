"""
extreme_points.py — 3D Extreme Points Bin-Packing (utilization-priority)

═══════════════════════════════════════════════════════════════════════════════
WHAT IS AN EXTREME POINT?
═══════════════════════════════════════════════════════════════════════════════
An extreme point (EP) is a candidate position for the back-left-bottom corner
of the next box to be placed.  Geometrically, an EP lies at a corner where
at least two walls (or box faces) meet — it is "extreme" in the sense that
moving any further in the negative X, Y, or Z direction would cause a
collision with something already there.

The starting EP set is {(0, 0, 0)} — the back-left-bottom corner of the
empty container.  Every time a box is placed, up to three new EPs are
generated from its exposed faces.  The set of reachable positions therefore
grows to cover every interstice between placed boxes, which is why Extreme
Points produces much denser packing than Guillotine: Guillotine only ever
offers the three sub-spaces produced by a single guillotine cut, whereas
Extreme Points offers every corner that can be reached from any face.

═══════════════════════════════════════════════════════════════════════════════
EP GENERATION — THREE NEW CANDIDATES PER PLACEMENT
═══════════════════════════════════════════════════════════════════════════════
After placing a box at (px, py, pz) with dimensions (bw, bh, bd):

    EP_right = (px + bw, py, pz)   — right face of the box
    EP_top   = (px, py + bh, pz)   — top face of the box
    EP_front = (px, py, pz + bd)   — front face (toward door, higher z)

Each candidate is gravity-settled before being added: drop it straight down
to find the true floor.  This prevents floating EPs that would produce
floating boxes.

Why only three?  More sophisticated variants (Crainic et al. 2008) generate
additional EPs by projecting each face onto every other placed box face.
We use the simpler three-face version: it still significantly outperforms
Guillotine and runs in O(n² × e) where e = |EP set|.

═══════════════════════════════════════════════════════════════════════════════
EP SCORING — GRAVITY + DEPTH-FIRST + LEFT-TO-RIGHT
═══════════════════════════════════════════════════════════════════════════════
When choosing which EP to use for the next box, we score each valid (EP,
orientation) pair by the tuple:

    (settled_y, ep_z, ep_x)

Lower tuple = better.

    settled_y  — primary:   gravity.  Always prefer to place as low as
                             possible.  Boxes land on the floor or on top
                             of other boxes before filling higher space.

    ep_z       — secondary: depth-first.  Among equally-low placements,
                             prefer positions closer to the back wall (z=0).
                             This enforces inside-out loading: the back of
                             the container fills before the front.

    ep_x       — tertiary:  left-to-right.  Among same-height same-depth
                             positions, fill left before right for a neat
                             visual result.

If you removed ep_z from the tuple, boxes could be placed at the door end
before the back was full, breaking the inside-out constraint.

═══════════════════════════════════════════════════════════════════════════════
EP PRUNING — KEEPING THE SET CLEAN
═══════════════════════════════════════════════════════════════════════════════
After each placement we scan the EP set and remove any point that now lies
inside a placed box (a "dominated" point — no box can ever start there).
We also filter out EPs that are outside the container bounds.

We do NOT deduplicate EPs aggressively beyond containment checks — duplicate
EPs at the same coordinate are harmless (both will produce the same result
and the second will be skipped via the already-placed collision check).
"""

from __future__ import annotations

from algorithms.common import gravity_settle, overlaps_3d, get_orientations, PlacedBox
from schema import ContainerIn, BoxIn, PlacementOut, ContainerResult


# ── EP validity helpers ────────────────────────────────────────────────────────

def _ep_inside_box(ex: float, ey: float, ez: float, p: PlacedBox) -> bool:
    """
    True if extreme point (ex, ey, ez) lies strictly inside placed box p.
    An EP on the face of a box is still usable — only interior points are pruned.
    """
    return (
        p["x"] < ex < p["x"] + p["w"] and
        p["y"] < ey < p["y"] + p["h"] and
        p["z"] < ez < p["z"] + p["d"]
    )


def _ep_in_bounds(ex: float, ey: float, ez: float, c: ContainerIn) -> bool:
    """True if the EP is within container boundaries (can potentially fit a 1×1×1 box)."""
    return ex < c.w and ey < c.h and ez < c.d


# ── Core: pack one container ───────────────────────────────────────────────────

def _pack_container(
    container: ContainerIn,
    instances: list[dict],   # {"box_id": str, "w": float, "h": float, "d": float}
) -> tuple[list[PlacementOut], list[dict]]:
    """
    Place as many instances as possible into one container using Extreme Points.
    Returns (placements, unplaced_instances).

    placements are sorted by centre-z ascending (back → door) for the animation.
    """
    # EP set: list of (x, y, z) tuples — candidate corner positions.
    eps: list[tuple[float, float, float]] = [(0.0, 0.0, 0.0)]

    placed: list[PlacedBox] = []
    placements: list[PlacementOut] = []
    unplaced: list[dict] = []

    for inst in instances:
        best_score: tuple[float, float, float] | None = None
        best_placement: tuple[float, float, float, float, float, float] | None = None  # px,py,pz,bw,bh,bd

        for (ex, ey, ez) in eps:
            for (ow, oh, od) in get_orientations(inst["w"], inst["h"], inst["d"]):
                # Box footprint must fit within container XZ bounds from this EP.
                if ex + ow > container.w or ez + od > container.d:
                    continue

                # Gravity: find the true resting Y for this footprint at this EP.
                actual_y = gravity_settle(ex, ez, ow, od, placed)

                # Box must not exceed container ceiling.
                if actual_y + oh > container.h:
                    continue

                # Reject if this placement overlaps any already-placed box.
                collision = any(
                    overlaps_3d(ex, actual_y, ez, ow, oh, od,
                                p["x"], p["y"], p["z"], p["w"], p["h"], p["d"])
                    for p in placed
                )
                if collision:
                    continue

                # Score: gravity first, depth-first second, left-to-right third.
                score = (actual_y, ez, ex)

                if best_score is None or score < best_score:
                    best_score = score
                    best_placement = (ex, actual_y, ez, ow, oh, od)

        if best_placement is None:
            unplaced.append(inst)
            continue

        px, py, pz, bw, bh, bd = best_placement

        # Record placement.
        p: PlacedBox = {"x": px, "y": py, "z": pz, "w": bw, "h": bh, "d": bd}
        placed.append(p)
        placements.append(PlacementOut(
            boxId=inst["box_id"],
            x=px, y=py, z=pz, w=bw, h=bh, d=bd,
        ))

        # Generate three new EPs from the exposed faces of the placed box.
        # Each candidate is gravity-settled before entering the pool.
        new_ep_candidates = [
            (px + bw, py, pz),   # right face
            (px,      py + bh, pz),   # top face — EP is at height, gravity settles it
            (px,      py, pz + bd),   # front face (toward door)
        ]
        for (cx, cy, cz) in new_ep_candidates:
            if not _ep_in_bounds(cx, cy, cz, container):
                continue
            # Gravity-settle the new EP itself: something may have been placed
            # below the top-face EP since we last looked.
            settled_cy = gravity_settle(cx, cz, 0.001, 0.001, placed)
            # Use the max of the generated y and the settled y — the EP from the
            # top face should not drop below the box that generated it.
            final_cy = max(cy, settled_cy)
            if final_cy >= container.h:
                continue
            eps.append((cx, final_cy, cz))

        # Prune EPs that now lie inside a placed box (dominated points).
        # We rebuild the list rather than remove in-place to avoid index issues.
        eps = [
            (ex, ey, ez) for (ex, ey, ez) in eps
            if not any(_ep_inside_box(ex, ey, ez, p) for p in placed)
            and _ep_in_bounds(ex, ey, ez, container)
        ]

    # Sort back → door for animation sequence.
    placements.sort(key=lambda p: p.z + p.d / 2)

    return placements, unplaced


# ── Public entry point ─────────────────────────────────────────────────────────

def run_extreme_points(containers: list[ContainerIn], boxes: list[BoxIn]) -> list[ContainerResult]:
    """
    Pack boxes into containers using the 3D Extreme Points algorithm.

    Produces higher utilization than Guillotine at the cost of more computation
    (O(n² × e) vs O(n × s)).  For 500 boxes in a TEU, typically 5–30× slower
    than Guillotine but still well under 1s in practice.

    Boxes overflow from container to container in sorted order.
    """
    if not containers or not boxes:
        return [
            ContainerResult(containerId=c.id, placements=[], utilization=0.0)
            for c in containers
        ]

    # Expand quantity → individual instances (plain dicts, no dataclass overhead).
    instances: list[dict] = [
        {"box_id": box.id, "w": box.w, "h": box.h, "d": box.d}
        for box in boxes
        for _ in range(box.quantity)
    ]

    # Sort by volume descending: largest boxes placed first to minimise
    # the "awkward remainder" problem common in EP algorithms.
    instances.sort(key=lambda i: -(i["w"] * i["h"] * i["d"]))

    results: list[ContainerResult] = []
    remaining = instances

    for container in containers:
        if not remaining:
            results.append(ContainerResult(
                containerId=container.id, placements=[], utilization=0.0,
            ))
            continue

        placements, remaining = _pack_container(container, remaining)

        container_vol = container.w * container.h * container.d
        packed_vol = sum(p.w * p.h * p.d for p in placements)
        utilization = packed_vol / container_vol if container_vol > 0 else 0.0

        results.append(ContainerResult(
            containerId=container.id,
            placements=placements,
            utilization=utilization,
        ))

    return results

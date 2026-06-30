"""
scorer.py — quick free-space fragmentation diagnostic for a packing result.

NOT part of the packing logic — a throwaway console probe so we can eyeball how
broken-up the leftover space is for a given algorithm/ordering.

How it works
------------
Each container is voxelized into a coarse grid (`_CELL_CM`); cells covered by a
placed carton are marked occupied. From the empty cells we derive two views:

  gap (internal)  — empty cells *inside the load envelope* (the bounding box of
                    all placements). This is the air trapped between/around
                    cartons within the packed region — exactly what tighter
                    nesting removes. The headline fragmentation signal, and the
                    one that actually separates good vs bad orderings.
  trapped (sealed)— empty cells anywhere in the container that are cut off from
                    the DOOR plane (z = max) by surrounding cartons. A stricter
                    subset: space you physically can't reach to load into. The
                    big open block in front of the load stays door-reachable, so
                    it is correctly NOT counted.

Reported per container: utilization, internal gap volume (+ % of the load
envelope) and its pocket count, plus sealed-off trapped volume and pockets.
Lower gap % / fewer pockets = a tighter, less fragmented load.
"""

from __future__ import annotations

import math
from collections import deque

from schema import ContainerResult, ContainerUsed

_CELL_CM = 10.0  # voxel edge (cm). Coarse = fast; fine = catches thinner gaps.


def _analyze(cont: ContainerUsed, placements, cell: float = _CELL_CM) -> dict:
    """Voxelize one container and measure internal gap + sealed trapped space."""
    nx = max(1, math.ceil(cont.w / cell))
    ny = max(1, math.ceil(cont.h / cell))
    nz = max(1, math.ceil(cont.d / cell))
    total = nx * ny * nz

    # Mark occupied cells (rasterize each placed carton's cell range).
    occ = bytearray(total)
    for p in placements:
        x0 = max(0, int(p.x // cell)); x1 = min(nx, math.ceil((p.x + p.w) / cell))
        y0 = max(0, int(p.y // cell)); y1 = min(ny, math.ceil((p.y + p.h) / cell))
        z0 = max(0, int(p.z // cell)); z1 = min(nz, math.ceil((p.z + p.d) / cell))
        for xi in range(x0, x1):
            for yi in range(y0, y1):
                base = (xi * ny + yi) * nz
                for zi in range(z0, z1):
                    occ[base + zi] = 1

    empty = total - sum(occ)
    cell_vol = cell ** 3

    # ── Sealed/trapped: empty cells not reachable from the door plane (z=nz-1) ──
    reach = bytearray(total)
    dq: deque[int] = deque()
    for xi in range(nx):
        for yi in range(ny):
            lin = (xi * ny + yi) * nz + (nz - 1)
            if not occ[lin]:
                reach[lin] = 1
                dq.append(lin)
    while dq:
        c = dq.popleft()
        z = c % nz; y = (c // nz) % ny; x = c // (nz * ny)
        for nb, ok in ((c - ny * nz, x > 0), (c + ny * nz, x < nx - 1),
                       (c - nz, y > 0), (c + nz, y < ny - 1),
                       (c - 1, z > 0), (c + 1, z < nz - 1)):
            if ok and not occ[nb] and not reach[nb]:
                reach[nb] = 1
                dq.append(nb)
    trapped = empty - sum(reach)
    trapped_pockets = _count_pockets(occ, nx, ny, nz, 0, nx, 0, ny, 0, nz, blocked=reach)

    # ── Internal gap: empty cells inside the load envelope (bbox of placements) ──
    if placements:
        ex0 = max(0, int(min(p.x for p in placements) // cell))
        ey0 = max(0, int(min(p.y for p in placements) // cell))
        ez0 = max(0, int(min(p.z for p in placements) // cell))
        ex1 = min(nx, math.ceil(max(p.x + p.w for p in placements) / cell))
        ey1 = min(ny, math.ceil(max(p.y + p.h for p in placements) / cell))
        ez1 = min(nz, math.ceil(max(p.z + p.d for p in placements) / cell))
    else:
        ex0 = ey0 = ez0 = 0; ex1 = ey1 = ez1 = 0

    env_total = max(1, (ex1 - ex0) * (ey1 - ey0) * (ez1 - ez0))
    gap = 0
    for xi in range(ex0, ex1):
        for yi in range(ey0, ey1):
            base = (xi * ny + yi) * nz
            for zi in range(ez0, ez1):
                if not occ[base + zi]:
                    gap += 1
    gap_pockets = _count_pockets(occ, nx, ny, nz, ex0, ex1, ey0, ey1, ez0, ez1)

    return {
        "gap_m3": gap * cell_vol / 1e6,
        "gap_frac": gap / env_total,
        "gap_pockets": gap_pockets,
        "trapped_m3": trapped * cell_vol / 1e6,
        "trapped_pockets": trapped_pockets,
    }


def _count_pockets(occ, nx, ny, nz, x0, x1, y0, y1, z0, z1, blocked=None) -> int:
    """
    Count 6-connected components of empty cells within [x0,x1)×[y0,y1)×[z0,z1).
    Cells where `blocked[i]` is truthy are skipped (used to exclude door-reachable
    space so only sealed pockets remain).
    """
    seen = bytearray(nx * ny * nz)
    dq: deque[int] = deque()
    pockets = 0
    for xi in range(x0, x1):
        for yi in range(y0, y1):
            base = (xi * ny + yi) * nz
            for zi in range(z0, z1):
                lin = base + zi
                if occ[lin] or seen[lin] or (blocked is not None and blocked[lin]):
                    continue
                pockets += 1
                seen[lin] = 1
                dq.append(lin)
                while dq:
                    c = dq.popleft()
                    z = c % nz; y = (c // nz) % ny; x = c // (nz * ny)
                    for nb, ok in ((c - ny * nz, x > x0), (c + ny * nz, x < x1 - 1),
                                   (c - nz, y > y0), (c + nz, y < y1 - 1),
                                   (c - 1, z > z0), (c + 1, z < z1 - 1)):
                        if ok and not occ[nb] and not seen[nb] and not (blocked is not None and blocked[nb]):
                            seen[nb] = 1
                            dq.append(nb)
    return pockets


def print_fragmentation(containers_used: list[ContainerUsed],
                        containers: list[ContainerResult],
                        header: str = "") -> None:
    """Print a one-block fragmentation report for a packing result to stdout."""
    by_id = {c.containerId: c for c in containers}
    lines: list[str] = []
    for cu in containers_used:
        cr = by_id.get(cu.id)
        if not cr or not cr.placements:
            continue
        m = _analyze(cu, cr.placements)
        lines.append(
            f"  {cu.label:<14} util={cr.utilization * 100:5.1f}%  "
            f"gap={m['gap_m3']:5.2f}m3 ({m['gap_frac'] * 100:4.1f}% of load, {m['gap_pockets']:3d} pockets)  "
            f"trapped={m['trapped_m3']:5.2f}m3 ({m['trapped_pockets']} sealed)"
        )
    if not lines:
        return
    print(f"[fragmentation] {header}".rstrip(), flush=True)
    for ln in lines:
        print(ln, flush=True)

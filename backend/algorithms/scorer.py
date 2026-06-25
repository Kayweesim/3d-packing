"""
scorer.py — quick free-space fragmentation diagnostic for a packing result.

NOT part of the packing logic — a throwaway console probe so we can eyeball how
broken-up the leftover space is for a given algorithm/ordering.

How it works
------------
Each container is voxelized into a coarse grid (`_CELL_CM`). Cells covered by a
placed carton are marked occupied. The empty cells are then split into:

  reachable — empty cells connected (through other empty cells) to the DOOR plane
              (z = max). This includes the big open block in front of / above the
              load: that is unused *capacity*, not fragmentation, so it must not
              be counted as a gap.
  trapped   — empty cells sealed off from the door by surrounding cartons. These
              are the real wasted pockets fragmentation creates.

Reported per container: utilization, total empty volume, trapped volume (+ % of
empty that is trapped), and the number of disconnected trapped pockets. Lower
trapped % and fewer pockets = a tighter, less fragmented load.
"""

from __future__ import annotations

import math
from collections import deque
from typing import Iterator

from schema import ContainerResult, ContainerUsed

_CELL_CM = 10.0  # voxel edge (cm). Coarse = fast; fine = catches thinner gaps.


def _neighbors(lin: int, nx: int, ny: int, nz: int) -> Iterator[int]:
    """Yield the 6-connected neighbour indices of a linear cell index."""
    z = lin % nz
    y = (lin // nz) % ny
    x = lin // (nz * ny)
    if x > 0:      yield lin - ny * nz
    if x < nx - 1: yield lin + ny * nz
    if y > 0:      yield lin - nz
    if y < ny - 1: yield lin + nz
    if z > 0:      yield lin - 1
    if z < nz - 1: yield lin + 1


def _analyze(cont: ContainerUsed, placements, cell: float = _CELL_CM) -> dict:
    """Voxelize one container and measure its trapped (sealed) empty space."""
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

    # Flood-fill reachable empty space inward from the door plane (z = nz-1).
    reach = bytearray(total)
    dq: deque[int] = deque()
    for xi in range(nx):
        for yi in range(ny):
            lin = (xi * ny + yi) * nz + (nz - 1)
            if not occ[lin] and not reach[lin]:
                reach[lin] = 1
                dq.append(lin)
    while dq:
        c = dq.popleft()
        for nb in _neighbors(c, nx, ny, nz):
            if not occ[nb] and not reach[nb]:
                reach[nb] = 1
                dq.append(nb)

    trapped = empty - sum(reach)

    # Count disconnected trapped pockets (components of empty & not-reachable).
    pockets = 0
    seen = bytearray(total)
    for start in range(total):
        if occ[start] or reach[start] or seen[start]:
            continue
        pockets += 1
        seen[start] = 1
        dq.append(start)
        while dq:
            c = dq.popleft()
            for nb in _neighbors(c, nx, ny, nz):
                if not occ[nb] and not reach[nb] and not seen[nb]:
                    seen[nb] = 1
                    dq.append(nb)

    cell_vol = cell ** 3
    return {
        "empty_m3": empty * cell_vol / 1e6,
        "trapped_m3": trapped * cell_vol / 1e6,
        "trapped_frac": (trapped / empty) if empty else 0.0,
        "pockets": pockets,
    }


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
            f"empty={m['empty_m3']:6.2f}m3  "
            f"trapped={m['trapped_m3']:5.2f}m3 ({m['trapped_frac'] * 100:4.1f}%)  "
            f"pockets={m['pockets']:3d}"
        )
    if not lines:
        return
    print(f"[fragmentation] {header}".rstrip(), flush=True)
    for ln in lines:
        print(ln, flush=True)

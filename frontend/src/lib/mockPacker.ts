/**
 * mockPacker.ts — 3D Guillotine Bin-Packing algorithm
 *
 * WHAT IS BIN PACKING?
 * Given a set of 3D boxes and one or more containers, arrange all boxes inside
 * the containers without overlap and without exceeding container boundaries.
 * This is NP-hard (no perfect solution in polynomial time), so we use a
 * heuristic (a "good enough" rule) instead of exhaustive search.
 *
 * THE GUILLOTINE ALGORITHM:
 * Named after the guillotine cut — each time a box is placed, the leftover
 * space is divided by straight cuts parallel to the axes, producing smaller
 * rectangular sub-spaces. These sub-spaces are tracked in a list and reused
 * for subsequent boxes.
 *
 * Contrast this with a shelf algorithm (stacks rows) or a wall algorithm
 * (fills vertical slices). Guillotine is more flexible and generally more space-
 * efficient for mixed box sizes.
 */

import type { Container } from '../store/containerSlice'
import type { Box } from '../store/boxSlice'
import type { Placement, PackingResult } from '../store/packingSlice'

// ─── Types ───────────────────────────────────────────────────────────────────

// A free rectangular region (cuboid) still available inside a container.
// The algorithm maintains a dynamic list of these and updates it after each
// box placement.
interface FreeSpace {
  x: number  // left edge (cm from container origin)
  y: number  // bottom edge (cm)
  z: number  // front edge (cm)
  w: number  // available width  (X axis)
  h: number  // available height (Y axis)
  d: number  // available depth  (Z axis)
}

// An expanded box instance — one entry per physical box after multiplying
// by quantity. Multiple instances of the same box type share the same boxId.
interface BoxInstance {
  boxId: string
  w: number
  h: number
  d: number
}

// ─── Core: find best-fit free space ──────────────────────────────────────────

// Scan all free spaces and return the index of the smallest one that fits
// a box of size (bw × bh × bd).
//
// WHY "BEST FIT" (smallest fitting space)?
// Placing a small box in a large space wastes the leftover fragments.
// Using the tightest fit minimises wasted splits and improves overall density.
// Contrast with "First Fit" (just use the first space that fits) which is
// faster but produces more fragmentation.
function findBestFit(bw: number, bh: number, bd: number, spaces: FreeSpace[]): number {
  let bestIdx = -1
  let bestVol = Infinity

  for (let i = 0; i < spaces.length; i++) {
    const s = spaces[i]
    // A space fits if all three dimensions are ≥ the box dimensions.
    if (s.w >= bw && s.h >= bh && s.d >= bd) {
      const vol = s.w * s.h * s.d
      if (vol < bestVol) {
        bestVol = vol
        bestIdx = i
      }
    }
  }

  return bestIdx  // -1 means no space fits this box
}

// ─── Core: place one box ─────────────────────────────────────────────────────

// Attempt to place a single box into the free space list using Best Fit.
// On success: removes the used space, adds up to 3 guillotine sub-spaces,
// returns the placement. On failure: returns null (box doesn't fit anywhere).
function tryPlace(
  boxId: string,
  bw: number,
  bh: number,
  bd: number,
  spaces: FreeSpace[],
): Placement | null {
  const idx = findBestFit(bw, bh, bd, spaces)
  if (idx === -1) return null

  // Remove the consumed free space from the list.
  const s = spaces[idx]
  spaces.splice(idx, 1)

  // ── Guillotine split ──────────────────────────────────────────────────────
  // The box is placed in the bottom-left-front corner of space S.
  // The remaining volume is divided into 3 non-overlapping sub-cuboids:
  //
  //   Y
  //   ▲  ┌─────────────────────┐
  //   │  │                     │ ← R2: above box, within box's X slice
  //   │  ├──────┬──────────────┤
  //   │  │  B   │              │ ← R1: to the right of box, full height
  //   │  └──────┴──────────────┘──► X
  //      (in Z: R3 is behind the box within B's footprint)
  //
  // These 3 spaces together + the placed box exactly fill space S. No overlap.
  // Split order: X first, then Y within the X slice, then Z within B's footprint.

  // R1: to the right — everything past the box's right edge, full height and depth
  if (s.w - bw > 0) {
    spaces.push({ x: s.x + bw, y: s.y, z: s.z, w: s.w - bw, h: s.h, d: s.d })
  }
  // R2: above — above the box's top edge, box's width wide, full depth
  if (s.h - bh > 0) {
    spaces.push({ x: s.x, y: s.y + bh, z: s.z, w: bw, h: s.h - bh, d: s.d })
  }
  // R3: behind — behind the box's back edge, within the box's footprint
  if (s.d - bd > 0) {
    spaces.push({ x: s.x, y: s.y, z: s.z + bd, w: bw, h: bh, d: s.d - bd })
  }

  return { boxId, x: s.x, y: s.y, z: s.z, w: bw, h: bh, d: bd }
}

// ─── Pack one container ───────────────────────────────────────────────────────

// Run the Guillotine algorithm for a single container against a list of box
// instances. Returns placements for boxes that fit, and the unplaced remainder.
function packContainer(
  container: Container,
  instances: BoxInstance[],
): { placements: Placement[]; unplaced: BoxInstance[] } {
  // The entire container interior is the initial free space.
  // Origin (0,0,0) maps to the bottom-left-front corner of this container.
  // In 3D world space, ContainerMesh.tsx adds the worldX offset on top of this.
  const spaces: FreeSpace[] = [
    { x: 0, y: 0, z: 0, w: container.w, h: container.h, d: container.d },
  ]

  const placements: Placement[] = []
  const unplaced: BoxInstance[] = []

  for (const inst of instances) {
    const p = tryPlace(inst.boxId, inst.w, inst.h, inst.d, spaces)
    if (p) placements.push(p)
    else unplaced.push(inst)
  }

  return { placements, unplaced }
}

// ─── Public entry point ───────────────────────────────────────────────────────

// Run the mock packer across all containers, returning a PackingResult per
// container. Boxes overflow from a full container into the next one.
//
// Phase 8 note: the real FastAPI backend exposes POST /api/pack with the same
// input/output shape. Swapping mock → real is a one-line change in packingSlice.ts.
export function runMockPacker(containers: Container[], boxes: Box[]): PackingResult[] {
  if (!containers.length || !boxes.length) return []

  // Expand each Box (which carries a `quantity`) into individual instances.
  // A Box with quantity=3 becomes 3 separate BoxInstances, all sharing the
  // same boxId (so they get the same color in the renderer).
  const instances: BoxInstance[] = boxes.flatMap((box) =>
    Array.from({ length: box.quantity }, () => ({
      boxId: box.id,
      w: box.w,
      h: box.h,
      d: box.d,
    })),
  )

  // Sort largest-volume first — the "Largest Fit Decreasing" (LFD) heuristic.
  // Placing large boxes first leaves the awkward small gaps for small boxes,
  // rather than painting yourself into a corner trying to fit large boxes
  // into fragmented space left by small boxes placed earlier.
  instances.sort((a, b) => b.w * b.h * b.d - a.w * a.h * a.d)

  const results: PackingResult[] = []
  let remaining = instances  // boxes not yet placed; starts as all instances

  for (const container of containers) {
    if (remaining.length === 0) {
      // No boxes left — push an empty result so the store has an entry for
      // every container (needed for consistent indexing in UtilizationStats).
      results.push({ containerId: container.id, placements: [], utilization: 0 })
      continue
    }

    const { placements, unplaced } = packContainer(container, remaining)

    // Utilization = fraction of the container volume occupied by placed boxes.
    // e.g. 0.72 means 72% of the container's interior is filled.
    const containerVol = container.w * container.h * container.d
    const packedVol = placements.reduce((sum, p) => sum + p.w * p.h * p.d, 0)

    results.push({
      containerId: container.id,
      placements,
      utilization: containerVol > 0 ? packedVol / containerVol : 0,
    })

    // Carry leftover boxes into the next container.
    remaining = unplaced
  }

  return results
}

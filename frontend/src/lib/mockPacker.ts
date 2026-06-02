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
 * DOOR / IN-OUT ORDERING:
 * The container door is at z = container.d (the high-Z face, 589cm for 20ft). Boxes must be
 * loaded deepest-first (low z = back wall) so packers never have to step on
 * already-placed boxes. The space scorer below prioritises low-z spaces.
 * After packing, placements are sorted by centre-z ascending so the animation
 * sequence matches the real loading order: back → front.
 *
 * GRAVITY SETTLE:
 * Guillotine sub-spaces (R3 in particular) can be created at elevated y even
 * when there is no physical support at that y for all x/z positions in the space.
 * To prevent floating boxes, every candidate placement is gravity-settled: we scan
 * all already-placed boxes, find the highest top-face that overlaps the new box's
 * XZ footprint, and use that as the actual resting y. The guillotine space provides
 * the XZ region; gravity provides the exact y.
 */

import type { Container } from '../store/containerSlice'
import type { Box } from '../store/boxSlice'
import type { Placement, PackingResult } from '../store/packingSlice'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FreeSpace {
  x: number
  y: number
  z: number
  w: number
  h: number
  d: number
}

interface BoxInstance {
  boxId: string
  w: number
  h: number
  d: number
  rotationAllowed: boolean
  stackingOnTop:   boolean
  stackingUnder:   boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Return all unique axis-aligned orientations of a box.
// A cube (w=h=d) produces 1 unique orientation; a square-cross-section box
// produces 3; a fully asymmetric box produces 6.
function getOrientations(w: number, h: number, d: number): [number, number, number][] {
  const seen = new Set<string>()
  const result: [number, number, number][] = []
  for (const o of [
    [w, h, d], [w, d, h],
    [h, w, d], [h, d, w],
    [d, w, h], [d, h, w],
  ] as [number, number, number][]) {
    const key = `${o[0]},${o[1]},${o[2]}`
    if (!seen.has(key)) { seen.add(key); result.push(o) }
  }
  return result
}

// Find the actual resting y for a box at (x, z) with footprint (ow × od).
// Scans placed boxes for XZ overlap; returns the maximum top-face y found,
// or 0 (container floor) if nothing is below.
function settleY(
  x: number,
  z: number,
  ow: number,
  od: number,
  placements: Placement[],
): number {
  let y = 0
  for (const p of placements) {
    if (x < p.x + p.w && x + ow > p.x && z < p.z + p.d && z + od > p.z) {
      y = Math.max(y, p.y + p.h)
    }
  }
  return y
}

// ─── Core: find best candidate across orientations ───────────────────────────

// For a given orientation (ow × oh × od), scan all free spaces and return the
// index of the best fitting space together with the gravity-settled y.
//
// Scoring: primary = lowest z (deepest inside container = furthest from door).
// This enforces in-out packing so no horizontal layer-by-layer stacking occurs.
// Secondary tiebreaker = smallest volume (Best Fit — minimises fragmentation).
//
// The height check uses the gravity-settled y, not the space's stated y, so
// boxes can land lower than the space floor when there is empty air below.
function findBestFit(
  ow: number,
  oh: number,
  od: number,
  spaces: FreeSpace[],
  requireFloor: boolean,
  placements: Placement[],
): { idx: number; z: number; vol: number; actualY: number } | null {
  let best: { idx: number; z: number; vol: number; actualY: number } | null = null

  for (let i = 0; i < spaces.length; i++) {
    const s = spaces[i]
    if (s.w < ow || s.d < od) continue

    const actualY = settleY(s.x, s.z, ow, od, placements)
    if (requireFloor && actualY > 0) continue
    // Box must fit within the vertical extent of the space (ceiling check).
    if (actualY + oh > s.y + s.h) continue

    const vol = s.w * s.h * s.d
    if (!best || s.z < best.z || (s.z === best.z && vol < best.vol)) {
      best = { idx: i, z: s.z, vol, actualY }
    }
  }

  return best
}

// ─── Core: place one box ─────────────────────────────────────────────────────

// Try all applicable orientations and pick the best candidate. On success:
// removes the used space, adds guillotine sub-spaces (respecting stackingOnTop),
// returns the placement at the gravity-settled y. On failure: null.
function tryPlace(
  inst: BoxInstance,
  spaces: FreeSpace[],
  placements: Placement[],
): Placement | null {
  const orientations = inst.rotationAllowed
    ? getOrientations(inst.w, inst.h, inst.d)
    : [[inst.w, inst.h, inst.d] as [number, number, number]]

  const requireFloor = !inst.stackingUnder

  let bestCandidate: {
    idx: number; z: number; vol: number; actualY: number
    ow: number; oh: number; od: number
  } | null = null

  for (const [ow, oh, od] of orientations) {
    const candidate = findBestFit(ow, oh, od, spaces, requireFloor, placements)
    if (!candidate) continue
    if (
      !bestCandidate ||
      candidate.z < bestCandidate.z ||
      (candidate.z === bestCandidate.z && candidate.vol < bestCandidate.vol)
    ) {
      bestCandidate = { ...candidate, ow, oh, od }
    }
  }

  if (!bestCandidate) return null

  const { idx, ow, oh, od, actualY } = bestCandidate
  const s = spaces[idx]
  spaces.splice(idx, 1)

  // ── Guillotine split ──────────────────────────────────────────────────────
  // R1: right — everything past the box's right edge, full original space height/depth.
  if (s.w - ow > 0) {
    spaces.push({ x: s.x + ow, y: s.y, z: s.z, w: s.w - ow, h: s.h, d: s.d })
  }
  // R2: above — from the top of the placed box up to the space ceiling.
  // Only created when this box allows other boxes to stack on it.
  if (inst.stackingOnTop) {
    const aboveH = s.y + s.h - (actualY + oh)
    if (aboveH > 0) {
      spaces.push({ x: s.x, y: actualY + oh, z: s.z, w: ow, h: aboveH, d: s.d })
    }
  }
  // R3: behind — deeper into container (higher z = closer to door).
  // y/h are anchored to the placed box; future placements here will gravity-settle.
  if (s.d - od > 0) {
    spaces.push({ x: s.x, y: actualY, z: s.z + od, w: ow, h: oh, d: s.d - od })
  }

  return { boxId: inst.boxId, x: s.x, y: actualY, z: s.z, w: ow, h: oh, d: od }
}

// ─── Pack one container ───────────────────────────────────────────────────────

function packContainer(
  container: Container,
  instances: BoxInstance[],
): { placements: Placement[]; unplaced: BoxInstance[] } {
  const spaces: FreeSpace[] = [
    // x = container cross-section width (container.w = 235cm)
    // z = container length/depth (container.d = 589/1203cm) — packing direction; door at z = container.d
    { x: 0, y: 0, z: 0, w: container.w, h: container.h, d: container.d },
  ]

  const placements: Placement[] = []
  const unplaced: BoxInstance[] = []

  for (const inst of instances) {
    const p = tryPlace(inst, spaces, placements)
    if (p) placements.push(p)
    else unplaced.push(inst)
  }

  // Sort deepest-first (lowest centre-z first = back of container → door).
  // This array order IS the animation sequence used in Phase 6d.
  placements.sort((a, b) => (a.z + a.d / 2) - (b.z + b.d / 2))

  return { placements, unplaced }
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function runMockPacker(containers: Container[], boxes: Box[]): PackingResult[] {
  if (!containers.length || !boxes.length) return []

  const instances: BoxInstance[] = boxes.flatMap((box) =>
    Array.from({ length: box.quantity }, () => ({
      boxId:           box.id,
      w:               box.w,
      h:               box.h,
      d:               box.d,
      rotationAllowed: box.rotationAllowed,
      stackingOnTop:   box.stackingOnTop,
      stackingUnder:   box.stackingUnder,
    })),
  )

  // LFD sort: largest volume first to minimise awkward fragmentation.
  instances.sort((a, b) => b.w * b.h * b.d - a.w * a.h * a.d)

  const results: PackingResult[] = []
  let remaining = instances

  for (const container of containers) {
    if (remaining.length === 0) {
      results.push({ containerId: container.id, placements: [], utilization: 0 })
      continue
    }

    const { placements, unplaced } = packContainer(container, remaining)

    const containerVol = container.w * container.h * container.d
    const packedVol = placements.reduce((sum, p) => sum + p.w * p.h * p.d, 0)

    results.push({
      containerId: container.id,
      placements,
      utilization: containerVol > 0 ? packedVol / containerVol : 0,
    })

    remaining = unplaced
  }

  return results
}

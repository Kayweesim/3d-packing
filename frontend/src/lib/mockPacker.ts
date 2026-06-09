import type { OptimizeRequest, OptimizerResult } from './api'
import type { Placement, PackingResult } from '../store/packingSlice'
import type { Container } from '../store/containerSlice'

// ── Container presets ──────────────────────────────────────────────────────────

const PRESET = {
  '20ft': { label: '20ft TEU', w: 235, h: 239, d: 589,  cost: 1 },
  '40ft': { label: '40ft FEU', w: 235, h: 239, d: 1203, cost: 2 },
} as const

type PresetKey = keyof typeof PRESET

// ── Topological sort (gravity-safe animation order) ────────────────────────────

/**
 * Reorders placements so every carton animates only after all cartons whose
 * top face supports its bottom face have already appeared.
 * Tie-break priority within each ready frontier: back-to-front (low z first).
 */
function topologicalSort(placements: Placement[]): Placement[] {
  const n = placements.length
  if (n === 0) return placements

  // reverseDeps[j] = indices i that depend on j (j must come before i)
  const reverseDeps: number[][] = Array.from({ length: n }, () => [])
  const inDegree: number[] = new Array(n).fill(0)

  for (let i = 0; i < n; i++) {
    const p = placements[i]
    if (p.y < 1e-9) continue  // on floor — no predecessor
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const q = placements[j]
      if (Math.abs((q.y + q.h) - p.y) > 1e-9) continue
      // q's top is at p's base — check XZ overlap
      if (q.x < p.x + p.w && q.x + q.w > p.x &&
          q.z < p.z + p.d && q.z + q.d > p.z) {
        reverseDeps[j].push(i)
        inDegree[i]++
      }
    }
  }

  // Min-heap by centre-z (back-to-front preference)
  const ready: number[] = []
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) ready.push(i)
  }
  ready.sort((a, b) => (placements[a].z + placements[a].d / 2) - (placements[b].z + placements[b].d / 2))

  const result: Placement[] = []
  while (ready.length > 0) {
    const i = ready.shift()!
    result.push(placements[i])
    const newly: number[] = []
    for (const j of reverseDeps[i]) {
      inDegree[j]--
      if (inDegree[j] === 0) newly.push(j)
    }
    // Insert newly-ready items in sorted position (small list — insertion sort is fine)
    for (const j of newly) {
      const score = placements[j].z + placements[j].d / 2
      let pos = ready.length
      while (pos > 0 && (placements[ready[pos - 1]].z + placements[ready[pos - 1]].d / 2) > score) pos--
      ready.splice(pos, 0, j)
    }
  }

  return result
}

// ── Shelf packer ───────────────────────────────────────────────────────────────

interface CartonInst { cartonId: string; w: number; h: number; d: number }

/**
 * Row-shelf algorithm: fill left→right (X), then back→front (Z), then up (Y).
 * Placements are returned sorted by centre-z ascending — the order InstancedCartons
 * expects for back-to-front animation.
 */
function packShelf(
  instances: CartonInst[],
  ctn: { w: number; h: number; d: number },
): { placements: Placement[]; overflow: CartonInst[] } {
  const placements: Placement[] = []
  const overflow:   CartonInst[] = []

  let curX = 0, curY = 0, curZ = 0
  let rowMaxD   = 0  // deepest box in current x-row → how far to advance Z
  let layerMaxH = 0  // tallest box across all rows in current layer → how far to advance Y

  for (const { cartonId, w, h, d } of instances) {
    // Skip boxes that exceed any container dimension (no rotation for simplicity)
    if (w > ctn.w || h > ctn.h || d > ctn.d) {
      overflow.push({ cartonId, w, h, d })
      continue
    }

    let placed = false

    // Attempt 1: current row position
    if (curX + w <= ctn.w && curZ + d <= ctn.d && curY + h <= ctn.h) {
      placements.push({ cartonId, x: curX, y: curY, z: curZ, w, h, d })
      curX       += w
      rowMaxD     = Math.max(rowMaxD, d)
      layerMaxH   = Math.max(layerMaxH, h)
      placed      = true
    }

    // Attempt 2: start a new x-row (advance Z by rowMaxD)
    if (!placed && rowMaxD > 0) {
      const newZ = curZ + rowMaxD
      if (w <= ctn.w && newZ + d <= ctn.d && curY + h <= ctn.h) {
        curZ       = newZ
        curX       = 0
        rowMaxD    = d
        layerMaxH  = Math.max(layerMaxH, h)
        placements.push({ cartonId, x: 0, y: curY, z: curZ, w, h, d })
        curX       = w
        placed     = true
      }
    }

    // Attempt 3: start a new layer (advance Y by layerMaxH)
    if (!placed && layerMaxH > 0) {
      const newY = curY + layerMaxH
      if (w <= ctn.w && d <= ctn.d && newY + h <= ctn.h) {
        curY       = newY
        curZ       = 0
        curX       = 0
        rowMaxD    = d
        layerMaxH  = h
        placements.push({ cartonId, x: 0, y: curY, z: 0, w, h, d })
        curX       = w
        placed     = true
      }
    }

    if (!placed) overflow.push({ cartonId, w, h, d })
  }

  // Topological sort: gravity-safe order (supporters first), back-to-front as tie-break
  return { placements: topologicalSort(placements), overflow }
}

// ── Container selection ────────────────────────────────────────────────────────

/** Packing overhead factor: containers won't be 100% full due to gaps. */
const OVERHEAD = 1.35

function selectContainerTypes(totalVolume: number, available: string[]): PresetKey[] {
  const needed = totalVolume * OVERHEAD

  type Combo = { types: PresetKey[]; cost: number }
  const candidates: Combo[] = []

  for (let n20 = 0; n20 <= 6; n20++) {
    for (let n40 = 0; n40 <= 6; n40++) {
      if (n20 === 0 && n40 === 0) continue
      if (n20 > 0 && !available.includes('20ft')) continue
      if (n40 > 0 && !available.includes('40ft')) continue

      const vol  = n20 * PRESET['20ft'].w * PRESET['20ft'].h * PRESET['20ft'].d
                 + n40 * PRESET['40ft'].w * PRESET['40ft'].h * PRESET['40ft'].d
      if (vol < needed) continue

      const types: PresetKey[] = [
        ...Array.from({ length: n20 }, () => '20ft' as const),
        ...Array.from({ length: n40 }, () => '40ft' as const),
      ]
      candidates.push({ types, cost: n20 * PRESET['20ft'].cost + n40 * PRESET['40ft'].cost })
    }
  }

  if (candidates.length === 0) {
    // Nothing fits — return the single largest available container as fallback
    const fallback: PresetKey = available.includes('40ft') ? '40ft' : '20ft'
    return [fallback]
  }

  // Sort: cheapest first, then fewest containers, then fewer 20ft
  candidates.sort((a, b) =>
    a.cost - b.cost ||
    a.types.length - b.types.length ||
    a.types.filter(t => t === '20ft').length - b.types.filter(t => t === '20ft').length
  )
  return candidates[0].types
}

// ── Public entry point ─────────────────────────────────────────────────────────

export function runMockPacker(req: OptimizeRequest): OptimizerResult {
  const { boxes, available_types } = req

  // Expand instances pallet by pallet (colorIndex = palletIndex, assigned in packingSlice).
  // Within each pallet, sort carton types by volume descending for better space utilisation.
  // Pallet order is preserved — all of pallet 0 packs before pallet 1 starts.
  const palletGroups = new Map<number, CartonInst[]>()
  for (const { id, w, h, d, quantity, colorIndex } of boxes) {
    const group = palletGroups.get(colorIndex) ?? []
    for (let i = 0; i < quantity; i++) group.push({ cartonId: id, w, h, d })
    palletGroups.set(colorIndex, group)
  }

  const instances: CartonInst[] = Array.from(palletGroups.entries())
    .sort(([a], [b]) => a - b)
    .flatMap(([, group]) => group.sort((a, b) => b.w * b.h * b.d - a.w * a.h * a.d))

  const totalVolume = instances.reduce((s, i) => s + i.w * i.h * i.d, 0)

  const types = available_types.length > 0
    ? selectContainerTypes(totalVolume, available_types)
    : ['40ft' as const]

  const containers: Container[] = types.map((type, i) => ({
    id:    `mock-ctn-${i}`,
    label: PRESET[type].label,
    w:     PRESET[type].w,
    h:     PRESET[type].h,
    d:     PRESET[type].d,
  }))

  const packingResult: PackingResult[] = []
  let remaining = instances

  for (const ctn of containers) {
    if (remaining.length === 0) {
      packingResult.push({ containerId: ctn.id, placements: [], utilization: 0 })
      continue
    }

    const { placements, overflow } = packShelf(remaining, ctn)
    const usedVol = placements.reduce((s, p) => s + p.w * p.h * p.d, 0)

    packingResult.push({
      containerId: ctn.id,
      placements,
      utilization: usedVol / (ctn.w * ctn.h * ctn.d),
    })

    remaining = overflow
  }

  const allPacked = remaining.length === 0
  const totalCost = types.reduce((s, t) => s + PRESET[t].cost, 0)
  const n20 = types.filter(t => t === '20ft').length
  const n40 = types.filter(t => t === '40ft').length
  const parts: string[] = []
  if (n20 > 0) parts.push(`${n20}× 20ft TEU`)
  if (n40 > 0) parts.push(`${n40}× 40ft FEU`)

  return {
    containersUsed: containers,
    packingResult,
    totalCost,
    containerSummary: parts.join(' + '),
    allPacked,
  }
}

import type { Carton } from '../store/cartonSlice'
import type { Container } from '../store/containerSlice'
import type { Placement, PackingResult } from '../store/packingSlice'

// ── Shared result shape ────────────────────────────────────────────────────────

export interface OptimizerResult {
  containersUsed: Container[]
  packingResult: PackingResult[]
  totalCost: number
  containerSummary: string
  allPacked: boolean
}

// ── Request shape ──────────────────────────────────────────────────────────────

export interface OptimizeRequest {
  boxes: Array<Pick<Carton, 'id' | 'label' | 'w' | 'h' | 'd' | 'quantity' | 'colorIndex'>>
  available_types: string[]
}

// ── API response shapes (mirrors backend schema — boxId is the backend field name) ──

interface ApiPlacement {
  boxId: string
  x: number
  y: number
  z: number
  w: number
  h: number
  d: number
}

interface ApiContainerResult {
  containerId: string
  placements: ApiPlacement[]
  utilization: number
}

interface ApiOptimizeResponse {
  containers: ApiContainerResult[]
  containers_used: Container[]
  total_cost: number
  container_summary: string
  all_packed: boolean
}

// ── Error type ─────────────────────────────────────────────────────────────────

export class PackError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PackError'
  }
}

// ── Private fetch helper ───────────────────────────────────────────────────────

async function callOptimizeApi(endpoint: string, req: OptimizeRequest): Promise<OptimizerResult> {
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  } catch {
    throw new PackError('Backend unreachable — is the server running?')
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
    } catch { /* ignore */ }
    throw new PackError(`Optimize failed: ${detail}`)
  }

  const data: ApiOptimizeResponse = await res.json()

  // Map backend boxId → frontend cartonId at the boundary
  const packingResult: PackingResult[] = data.containers.map((c) => ({
    containerId: c.containerId,
    utilization: c.utilization,
    placements: c.placements.map((p): Placement => ({
      cartonId: p.boxId,
      x: p.x, y: p.y, z: p.z,
      w: p.w, h: p.h, d: p.d,
    })),
  }))

  return {
    containersUsed: data.containers_used,
    packingResult,
    totalCost: data.total_cost,
    containerSummary: data.container_summary,
    allPacked: data.all_packed,
  }
}

// ── Public API functions ───────────────────────────────────────────────────────

export async function apiOptimizeExtremePoints(req: OptimizeRequest): Promise<OptimizerResult> {
  return callOptimizeApi('/api/optimize/extreme-points', req)
}

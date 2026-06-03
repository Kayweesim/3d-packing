/**
 * api.ts — typed fetch wrappers for the FastAPI optimize endpoints.
 *
 * Endpoints (defined in Phase 8 backend, to be updated in next backend phase):
 *   POST /api/optimize/guillotine
 *   POST /api/optimize/extreme-points
 *
 * Both accept { boxes, available_types } and return the optimizer-selected
 * containers alongside the packing result.
 */

import type { Box } from '../store/boxSlice'
import type { Container } from '../store/containerSlice'
import type { PackingResult } from '../store/packingSlice'

// ── Shared result shape ────────────────────────────────────────────────────────
// Both apiOptimize* and runMockOptimizer return this shape so packingSlice
// can consume either without branching on types.

export interface OptimizerResult {
  containersUsed: Container[]
  packingResult: PackingResult[]
  totalCost: number
  containerSummary: string   // e.g. "1× 40ft FEU" or "2× 20ft TEU"
  allPacked: boolean         // false if boxes exceed all combinations within cost cap
}

// ── Request shape ──────────────────────────────────────────────────────────────

export interface OptimizeRequest {
  boxes: Array<Pick<Box, 'id' | 'label' | 'w' | 'h' | 'd' | 'quantity' | 'colorIndex'>>
  available_types: string[]
}

// ── API response shape (mirrors backend OptimizeResponse) ──────────────────────

interface ApiOptimizeResponse {
  containers: PackingResult[]
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
  return {
    containersUsed: data.containers_used,
    packingResult: data.containers,
    totalCost: data.total_cost,
    containerSummary: data.container_summary,
    allPacked: data.all_packed,
  }
}

// ── Public API functions ───────────────────────────────────────────────────────

export async function apiOptimizeExtremePoints(req: OptimizeRequest): Promise<OptimizerResult> {
  return callOptimizeApi('/api/optimize/extreme-points', req)
}

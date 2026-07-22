/**
 * palletApi.ts — typed client for the single-SKU pallet packing endpoint.
 *
 * Exports: PalletPackRequest, PalletPackResult, PalletPlacement, PalletUsed,
 * apiPalletPack.
 * Standalone from api.ts (the container optimizer client) except for reusing its
 * PackError type. POSTs to /api/pallet/optimize and maps the backend's `boxId`
 * to the frontend's `cartonId` at this boundary, mirroring mapOptimizeResponse.
 */
import { PackError } from './api'
import type { PalletTypeKey } from './palletTypes'

// ── Request shape ──────────────────────────────────────────────────────────────

export interface PalletPackRequest {
  box: {
    id: string
    label: string
    w: number
    h: number
    d: number
    quantity: number
    rotationAllowed: boolean
    stacking: boolean
  }
  pallet: {
    key: PalletTypeKey
    Wp?: number
    Dp?: number
    max_height?: number
  }
  quantity: number
}

// ── Result shapes (cartonId is the frontend field; backend sends boxId) ─────────

export interface PalletPlacement {
  cartonId: string
  x: number
  y: number
  z: number
  w: number
  h: number
  d: number
}

export interface PalletUsed {
  label: string
  Wp: number
  Dp: number
  deckH: number
  maxHeight: number
}

export interface PalletPackResult {
  placements: PalletPlacement[]  // ONE full pallet; replicate across palletsNeeded
  perLayer: number
  layers: number
  perPallet: number
  palletsNeeded: number
  lastPalletCount: number
  footprintUtil: number  // 0–1
  heightUtil: number     // 0–1
  volumeUtil: number     // 0–1
  pallet: PalletUsed
}

// ── API response shape (mirrors backend schema.PalletPackResponse) ──────────────

interface ApiPalletPlacement {
  boxId: string
  x: number; y: number; z: number
  w: number; h: number; d: number
}

interface ApiPalletPackResponse {
  placements: ApiPalletPlacement[]
  per_layer: number
  layers: number
  per_pallet: number
  pallets_needed: number
  last_pallet_count: number
  footprint_util: number
  height_util: number
  volume_util: number
  pallet: { label: string; Wp: number; Dp: number; deck_h: number; max_height: number }
}

function mapResponse(data: ApiPalletPackResponse): PalletPackResult {
  return {
    placements: data.placements.map((p): PalletPlacement => ({
      cartonId: p.boxId,
      x: p.x, y: p.y, z: p.z,
      w: p.w, h: p.h, d: p.d,
    })),
    perLayer: data.per_layer,
    layers: data.layers,
    perPallet: data.per_pallet,
    palletsNeeded: data.pallets_needed,
    lastPalletCount: data.last_pallet_count,
    footprintUtil: data.footprint_util,
    heightUtil: data.height_util,
    volumeUtil: data.volume_util,
    pallet: {
      label: data.pallet.label,
      Wp: data.pallet.Wp,
      Dp: data.pallet.Dp,
      deckH: data.pallet.deck_h,
      maxHeight: data.pallet.max_height,
    },
  }
}

/**
 * Run the pallet packer (POST /api/pallet/optimize). Synchronous on the server
 * (the solve is instant), so this is a plain request/response — no SSE.
 * @throws PackError when the backend is unreachable or responds with an error.
 */
export async function apiPalletPack(req: PalletPackRequest): Promise<PalletPackResult> {
  let res: Response
  try {
    res = await fetch('/api/pallet/optimize', {
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
    throw new PackError(`Pallet pack failed: ${detail}`)
  }

  const data: ApiPalletPackResponse = await res.json()
  return mapResponse(data)
}

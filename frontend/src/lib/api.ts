/**
 * api.ts — typed client for the backend optimizer endpoint.
 *
 * Exports: OptimizerResult, OptimizeRequest, PackError, apiOptimize,
 * apiOptimizeStream (SSE progress), and the trace client.
 * POSTs to /api/optimize (the Vite dev server proxies /api → :8000), with the
 * chosen packing algorithm in the request body, and maps the backend's `boxId`
 * to the frontend's `cartonId` at this boundary. Every failure mode is
 * normalized into a PackError with a user-facing message.
 */
import type { Carton } from '../store/cartonSlice'
import type { Container } from '../store/containerSlice'
import type { Placement, PackingResult } from '../store/packingSlice'
import type { AlgoId } from '../store/uiSlice'

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
  // Carton fields plus colorIndex — the pallet grouping key stamped by
  // runPacker (Carton itself intentionally carries no colorIndex).
  boxes: Array<Pick<Carton, 'id' | 'label' | 'w' | 'h' | 'd' | 'quantity' | 'rotationAllowed' | 'stacking'> & { colorIndex: number }>
  available_types: string[]
  algorithm: AlgoId  // packer key — resolved server-side via the algorithm registry
  lashing: boolean   // true → load is secured, skip the flat last-container re-pack
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
  flatApplied?: boolean
}

interface ApiOptimizeResponse {
  containers: ApiContainerResult[]
  containers_used: Container[]
  total_cost: number
  container_summary: string
  all_packed: boolean
}

// ── Error type ─────────────────────────────────────────────────────────────────
/** User-facing packing failure — its message is rendered verbatim in the Sidebar. */
export class PackError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PackError'
  }
}

// ── Private fetch helper ───────────────────────────────────────────────────────

/** Map a backend OptimizeResponse to the frontend OptimizerResult (boxId → cartonId). */
function mapOptimizeResponse(data: ApiOptimizeResponse): OptimizerResult {
  const packingResult: PackingResult[] = data.containers.map((c) => ({
    containerId: c.containerId,
    utilization: c.utilization,
    flatApplied: c.flatApplied ?? false,
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
  return mapOptimizeResponse(data)
}

// ── Public API functions ───────────────────────────────────────────────────────

/**
 * Run the backend optimizer (POST /api/optimize). The packing algorithm is
 * selected via `req.algorithm` and dispatched server-side.
 * @throws PackError when the backend is unreachable or responds with an error.
 */
export async function apiOptimize(req: OptimizeRequest): Promise<OptimizerResult> {
  return callOptimizeApi('/api/optimize', req)
}

/** Progress event payload streamed by POST /api/optimize/stream. */
export interface OptimizeProgress {
  placed: number   // cartons placed so far (cumulative, monotonic)
  total: number    // total cartons to pack
  pct: number      // 0–99 (server caps below 100 until the result arrives)
}

/**
 * Run the optimizer with live progress (POST /api/optimize/stream).
 * Streams Server-Sent Events; `onProgress` fires as cartons are placed, and the
 * resolved value is the final result. Uses fetch + ReadableStream rather than
 * EventSource because the request is a POST with a JSON body.
 * @throws PackError when the backend is unreachable or the stream reports an error.
 */
export async function apiOptimizeStream(
  req: OptimizeRequest,
  onProgress: (p: OptimizeProgress) => void,
): Promise<OptimizerResult> {
  let res: Response
  try {
    res = await fetch('/api/optimize/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  } catch {
    throw new PackError('Backend unreachable — is the server running?')
  }

  if (!res.ok || !res.body) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
    } catch { /* ignore */ }
    throw new PackError(`Optimize failed: ${detail}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: OptimizerResult | null = null
  let errorMsg: string | null = null

  // SSE frames are separated by a blank line; each carries a single `data:` JSON.
  for (;;) {
    let done: boolean
    let value: Uint8Array | undefined
    try {
      ;({ done, value } = await reader.read())
    } catch {
      throw new PackError('Stream connection dropped — try packing again.')
    }
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''  // keep the trailing partial frame

    for (const frame of frames) {
      const line = frame.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload) continue

      let evt: Record<string, unknown>
      try {
        evt = JSON.parse(payload) as Record<string, unknown>
      } catch {
        continue  // malformed frame — skip and keep reading
      }

      if (evt.type === 'progress') {
        onProgress({ placed: evt.placed as number, total: evt.total as number, pct: evt.pct as number })
      } else if (evt.type === 'result') {
        result = mapOptimizeResponse(evt.data as ApiOptimizeResponse)
      } else if (evt.type === 'error') {
        errorMsg = evt.message as string
      }
    }
  }

  if (errorMsg) throw new PackError(`Optimize failed: ${errorMsg}`)
  if (!result) throw new PackError('Optimizer stream ended without a result.')
  return result
}

// ── Save plan (write workbook to a local/OneDrive-synced folder) ─────────────────

/**
 * Ask the local backend to write an exported workbook to a folder on disk
 * (POST /api/save-plan). Used for OneDrive-synced folders: the sync client
 * picks up the file and uploads it — no cloud API involved.
 * @param folder     Absolute path of the target folder (must exist).
 * @param filename   Workbook name, e.g. "picklist-2026-07-14.xlsx".
 * @param dataBase64 The xlsx bytes, base64-encoded (XLSX.write type:'base64').
 * @returns The absolute path the backend wrote.
 * @throws PackError with a user-facing message on any failure.
 */
export async function apiSavePlan(folder: string, filename: string, dataBase64: string): Promise<string> {
  let res: Response
  try {
    res = await fetch('/api/save-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder, filename, data_base64: dataBase64 }),
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
    throw new PackError(`Save failed: ${detail}`)
  }
  const data = await res.json() as { saved_path: string }
  return data.saved_path
}

// ── Algorithm trace (step visualizer) ───────────────────────────────────────────

export interface TraceCuboid { x: number; y: number; z: number; w: number; h: number; d: number }
export interface TraceNewSpace extends TraceCuboid { kind: 'Front' | 'Right' | 'Above' }

/** One placement step of a guillotine trace (see backend algorithms/trace.py). */
export interface TraceStep {
  step: number
  boxId: string
  colorIndex: number
  containerId: string          // which container this step belongs to
  placed: TraceCuboid          // final resting box
  score: number[]              // winning priority tuple [pz, py, px]
  chosenSpace: TraceCuboid     // free space it was placed into (pre-split)
  newSpaces: TraceNewSpace[]   // Front/Right/Above sub-spaces produced by the cut
  spaces: TraceCuboid[]        // full free-space list after this step
}

export interface TraceContainerDims { id: string; w: number; h: number; d: number }

export interface TraceResult {
  containers: TraceContainerDims[]  // one entry per container traced
  steps: TraceStep[]
}

/**
 * Step-by-step trace across one or more containers (POST /api/trace).
 * Pass `containers` from the current pack result so the trace mirrors the real
 * optimizer selection. Omit (null) to fall back to a single 20ft TEU.
 * @throws PackError on network/HTTP failure.
 */
export async function apiTrace(
  boxes: OptimizeRequest['boxes'],
  containers: TraceContainerDims[] | null,
  algorithm: AlgoId,
  lashing: boolean,
): Promise<TraceResult> {
  let res: Response
  try {
    res = await fetch('/api/trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boxes, containers, algorithm, lashing }),
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
    throw new PackError(`Trace failed: ${detail}`)
  }
  return res.json() as Promise<TraceResult>
}

/**
 * AlgorithmVisualizer.tsx — overlay that steps through a guillotine pack.
 *
 * Opened by the open-book icon in the Sidebar. Traces the current pallets into a
 * single 20ft (POST /api/trace) and lets the user step through each placement —
 * seeing the carton, its priority score, and how the free space was split into
 * Front/Right/Above sub-spaces. Discrete steps, not a continuous timeline.
 */
import { useCallback, useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Play, RotateCcw } from 'lucide-react'
import { useStore } from '@/src/store'
import { apiTrace, PackError } from '@/src/lib/api'
import type { TraceResult } from '@/src/lib/api'
import { getCartonColor } from '@/src/lib/colors'
import { FreeSpaceCanvas } from '@/src/components/3d/FreeSpaceCanvas'

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] text-muted-foreground">{k}</span>
      <span className="text-xs font-medium tabular-nums text-right">{v}</span>
    </div>
  )
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

export function AlgorithmVisualizer() {
  const open = useStore((s) => s.visualizerOpen)
  const setOpen = useStore((s) => s.setVisualizerOpen)
  const pallets = useStore((s) => s.pallets)
  const storeContainers = useStore((s) => s.containers)
  const algo = useStore((s) => s.algo)
  const lashing = useStore((s) => s.lashing)

  const [trace, setTrace] = useState<TraceResult | null>(null)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runTrace = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const boxes = pallets.flatMap((p, palletIndex) =>
        p.cartons.map((c) => ({
          id: c.id, label: c.label, w: c.w, h: c.h, d: c.d,
          quantity: c.quantity, colorIndex: palletIndex,
          rotationAllowed: c.rotationAllowed, stacking: c.stacking,
        })),
      )
      // Pass pack-result containers so the trace mirrors the real optimizer
      // selection. Fall back to null (backend defaults to single 20ft) if no
      // result exists yet.
      const traceContainers = storeContainers.length > 0
        ? storeContainers.map((c) => ({ id: c.id, w: c.w, h: c.h, d: c.d }))
        : null
      const result = await apiTrace(boxes, traceContainers, algo, lashing)
      setTrace(result)
      setStep(0)
    } catch (err) {
      setError(err instanceof PackError ? err.message : 'Trace failed')
    } finally {
      setLoading(false)
    }
  }, [pallets, storeContainers, algo, lashing])

  const steps = trace?.steps ?? []
  const lastIdx = steps.length - 1

  // Keyboard: Esc closes, ←/→ steps.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
      else if (e.key === 'ArrowRight') setStep((s) => Math.min(s + 1, lastIdx))
      else if (e.key === 'ArrowLeft') setStep((s) => Math.max(s - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, lastIdx, setOpen])

  if (!open) return null

  const current = steps[step]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative flex h-[85vh] w-[90vw] max-w-6xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div>
            <h2 className="text-sm font-semibold">
              {algo === 'algo2' ? 'algo2' : 'Guillotine'} Step Visualizer
            </h2>
            <p className="text-[10px] text-muted-foreground">
              {trace
                ? `${trace.containers.length} container${trace.containers.length > 1 ? 's' : ''}`
                : 'Single 20ft TEU'
              } · {lashing ? 'lashed (tall stack)' : 'flat constraint'}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* body */}
        <div className="flex min-h-0 flex-1">
          {/* canvas / empty state */}
          <div className="relative min-w-0 flex-1 bg-[#0d0d10]">
            {trace ? (
              <FreeSpaceCanvas containers={trace.containers} steps={steps} step={step} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <button
                  onClick={runTrace}
                  disabled={loading || pallets.length === 0}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Play size={14} />
                  {loading ? 'Tracing…' : pallets.length === 0 ? 'No pallets to trace' : 'Trace current pallets'}
                </button>
              </div>
            )}
            {error && (
              <p className="absolute bottom-3 left-3 rounded bg-background/80 px-2 py-1 text-xs text-destructive">
                {error}
              </p>
            )}
          </div>

          {/* info panel */}
          <div className="w-60 shrink-0 space-y-4 overflow-y-auto border-l border-border px-3 py-3">
            <div className="space-y-1.5">
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Free-space split
              </h3>
              <LegendRow color={'#3b82f6'} label="Front (toward door)" />
              <LegendRow color={'#22c55e'} label="Right (beside box)" />
              <LegendRow color={'#f59e0b'} label="Above (stack on top)" />
            </div>

            {current && (
              <div className="space-y-1.5 border-t border-border pt-3">
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-sm"
                    style={{ backgroundColor: getCartonColor(current.colorIndex) }}
                  />
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Step {step + 1} / {steps.length}
                  </h3>
                </div>
                {trace && trace.containers.length > 1 && (
                  <Row
                    k="Container"
                    v={`${trace.containers.findIndex((c) => c.id === current.containerId) + 1} / ${trace.containers.length}`}
                  />
                )}
                <Row k="Carton" v={current.boxId} />
                <Row k="Pallet" v={`#${current.colorIndex + 1}`} />
                <Row k="Placed W×H×D" v={`${current.placed.w}×${current.placed.h}×${current.placed.d}`} />
                <Row k="Pos x, y, z" v={`${current.placed.x}, ${current.placed.y}, ${current.placed.z}`} />
                <Row k="Score z, y, x" v={current.score.join(', ')} />
                <Row k="New spaces" v={current.newSpaces.map((n) => n.kind).join(', ') || '—'} />
                <Row k="Free spaces" v={String(current.spaces.length)} />
                <p className="pt-1 text-[10px] leading-snug text-muted-foreground">
                  Lower score wins: deepest z first, then lowest y (gravity), then left x.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* footer */}
        {trace && (() => {
          const activeContainerIdx = trace.containers.findIndex(
            (c) => c.id === steps[step]?.containerId,
          )
          const jumpToContainer = (idx: number) => {
            const id = trace.containers[idx]?.id
            if (!id) return
            const firstStep = steps.findIndex((s) => s.containerId === id)
            if (firstStep >= 0) setStep(firstStep)
          }

          return (
            <div className="flex flex-col border-t border-border">
              {/* Container selector */}
              <div className="flex items-center justify-center gap-2 border-b border-border px-4 py-1.5">
                {trace.containers.length > 1 ? (
                  <>
                    <button
                      onClick={() => jumpToContainer(activeContainerIdx - 1)}
                      disabled={activeContainerIdx <= 0}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Previous container"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                      Container {activeContainerIdx + 1} / {trace.containers.length}
                    </span>
                    <button
                      onClick={() => jumpToContainer(activeContainerIdx + 1)}
                      disabled={activeContainerIdx >= trace.containers.length - 1}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Next container"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Container 1</span>
                )}
              </div>

              {/* Step scrubber */}
              <div className="flex items-center gap-3 px-4 py-2.5">
                <button
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                  className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="Previous step"
                >
                  <ChevronLeft size={16} />
                </button>
                <input
                  type="range"
                  min={0}
                  max={lastIdx}
                  value={step}
                  onChange={(e) => setStep(Number(e.target.value))}
                  className="h-1.5 flex-1 cursor-pointer accent-primary"
                />
                <button
                  onClick={() => setStep((s) => Math.min(lastIdx, s + 1))}
                  disabled={step >= lastIdx}
                  className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="Next step"
                >
                  <ChevronRight size={16} />
                </button>
                <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                  {step + 1} / {steps.length}
                </span>
                <button
                  onClick={runTrace}
                  disabled={loading}
                  title="Re-trace current pallets"
                  className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

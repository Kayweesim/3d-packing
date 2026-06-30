/**
 * PackingProgressModal.tsx — loading overlay shown when packing takes a while.
 *
 * Exports: PackingProgressModal.
 * Only appears after SHOW_DELAY_MS of continuous loading, so fast packs never
 * trigger it. Progress is simulated (asymptotic fill to FILL_CAP), then jumps
 * to 100 % and auto-closes when the backend responds.
 *
 * Tuning constants are all at the top — easy to adjust or replace with real
 * backend progress events in the future.
 */
import { useEffect, useState } from 'react'
import { useStore } from '@/src/store'

// ── Tuning ────────────────────────────────────────────────────────────────────
const SHOW_DELAY_MS    = 400   // wait before showing (skips fast packs)
const TICK_MS          = 80    // progress bar update interval
const FILL_CAP         = 88    // simulated progress never exceeds this %
const FILL_RATE        = 0.04  // fraction of remaining gap added per tick
const COMPLETE_HOLD_MS = 450   // how long to show 100 % before closing

export function PackingProgressModal() {
  const loading = useStore((s) => s.loading)

  const [visible,  setVisible]  = useState(false)
  const [progress, setProgress] = useState(0)

  // Delay before the modal appears — avoids flashing for fast packs.
  useEffect(() => {
    if (!loading) return
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => clearTimeout(t)
  }, [loading])

  // Simulate progress while loading (asymptotic approach to FILL_CAP).
  useEffect(() => {
    if (!visible || !loading) return
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= FILL_CAP) return p
        return p + Math.max(0.1, (FILL_CAP - p) * FILL_RATE)
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [visible, loading])

  // When loading finishes: snap to 100 %, hold briefly, then close.
  useEffect(() => {
    if (loading || !visible) return
    setProgress(100)
    const t = setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, COMPLETE_HOLD_MS)
    return () => clearTimeout(t)
  }, [loading, visible])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-80 rounded-lg border border-border bg-background px-6 py-5 shadow-2xl space-y-4">

        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold">Optimising load plan…</h2>
          <p className="text-[10px] text-muted-foreground">
            Finding the best arrangement for your pallets.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-150 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-right text-[10px] tabular-nums text-muted-foreground">
            {Math.round(progress)} %
          </p>
        </div>

      </div>
    </div>
  )
}

/**
 * PackingProgressModal.tsx — loading overlay shown when packing takes a while.
 *
 * Exports: PackingProgressModal.
 * Only appears after SHOW_DELAY_MS of continuous loading, so fast packs never
 * trigger it. The bar reflects REAL progress streamed from the backend via SSE
 * (store `packingProgress`, cartons placed / cartons total). On completion it
 * holds at 100 % for COMPLETE_HOLD_MS so the finish is visible, then closes.
 *
 * Timing constants are at the top — easy to tune.
 */
import { useEffect, useState } from 'react'
import { useStore } from '@/src/store'

// ── Tuning ────────────────────────────────────────────────────────────────────
const SHOW_DELAY_MS    = 400   // wait before showing (skips fast packs)
const COMPLETE_HOLD_MS = 450   // how long to show 100 % before closing

export function PackingProgressModal() {
  const loading  = useStore((s) => s.loading)
  const progress = useStore((s) => s.packingProgress)

  const [visible, setVisible] = useState(false)

  // Delay before the modal appears — avoids flashing for fast packs.
  useEffect(() => {
    if (!loading) return
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => clearTimeout(t)
  }, [loading])

  // When loading finishes while visible, hold briefly at 100 %, then close.
  useEffect(() => {
    if (loading || !visible) return
    const t = setTimeout(() => setVisible(false), COMPLETE_HOLD_MS)
    return () => clearTimeout(t)
  }, [loading, visible])

  if (!visible) return null

  // During the post-load hold the store already reads 100; clamp defensively.
  const pct = loading ? progress : 100

  // Derive a phase label from pct — mirrors the three bands in main.py.
  const phase = pct <= 82 ? 'Placing cartons…'
              : pct <= 96 ? 'Optimising layout…'
              : 'Finalising…'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-80 rounded-lg border border-border bg-background px-6 py-5 shadow-2xl space-y-4">

        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold">Optimising load plan…</h2>
          <p className="text-[10px] text-muted-foreground">{phase}</p>
        </div>

        <div className="space-y-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-150 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-right text-[10px] tabular-nums text-muted-foreground">
            {Math.round(pct)} %
          </p>
        </div>

      </div>
    </div>
  )
}

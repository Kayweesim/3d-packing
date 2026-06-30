/**
 * PackingProgressModal.tsx — loading overlay shown when packing takes a while.
 *
 * Exports: PackingProgressModal.
 * Only appears after SHOW_DELAY_MS of continuous loading, so fast packs never
 * trigger it. The bar reflects REAL progress streamed from the backend via SSE
 * (store `packingProgress`, cartons placed / cartons total). On completion it
 * holds at 100 % for COMPLETE_HOLD_MS so the finish is visible, then closes.
 *
 * Three animated phase illustrations mirror the backend's progress bands:
 *   0–82 %  placing cartons    (Pass 1 placement loop)
 *   83–96 % compacting layout  (flat re-pack height-cap search)
 *   97–99 % ordering sequence  (topological sort / finalise)
 *
 * Timing constants are at the top — easy to tune.
 */
import { useEffect, useState } from 'react'
import { useStore } from '@/src/store'

// ── Tuning ────────────────────────────────────────────────────────────────────
const SHOW_DELAY_MS    = 400   // wait before showing (skips fast packs)
const COMPLETE_HOLD_MS = 450   // how long to show 100 % before closing

// ── CSS keyframes ─────────────────────────────────────────────────────────────
const KEYFRAMES = `
  @keyframes carton-drop {
    0%,  10% { opacity: 0; transform: translateY(-22px); }
    28%      { opacity: 1; transform: translateY(2px);   }
    36%      { opacity: 1; transform: translateY(0);     }
    62%, 76% { opacity: 1; transform: translateY(0);     }
    92%,100% { opacity: 0; transform: translateY(0);     }
  }
  @keyframes bar-pulse {
    0%, 100% { transform: scaleY(0.2); opacity: 0.3; }
    50%      { transform: scaleY(1);   opacity: 1;   }
  }
  @keyframes seq-appear {
    0%,  6%  { opacity: 0; transform: scale(0.65) translateY(6px); }
    24%, 68% { opacity: 1; transform: scale(1)    translateY(0);   }
    88%,100% { opacity: 0; transform: scale(1)    translateY(0);   }
  }
`

// ── Phase 1: cartons dropping onto the container floor ────────────────────────
function PlacingAnim() {
  return (
    <div className="relative flex items-end justify-center gap-3 h-12 pb-1">
      {/* floor */}
      <span className="absolute bottom-1 w-24 h-px bg-border/70 rounded-full" />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="relative w-6 rounded-[2px] border border-primary/60 bg-primary/10"
          style={{ height: 18, animation: `carton-drop 2.2s ease-out ${i * 0.44}s infinite` }}
        >
          {/* fold / flap line */}
          <div className="absolute top-[5px] inset-x-0 h-px bg-primary/30" />
        </div>
      ))}
    </div>
  )
}

// ── Phase 2: equalizer bars (flat re-pack / height-cap iterations) ────────────
function CompactingAnim() {
  return (
    <div className="flex items-end justify-center gap-1.5 h-12 pb-1">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="w-4 rounded-t-sm bg-primary/40 border border-primary/50"
          style={{
            height: 32,
            transformOrigin: 'bottom center',
            animation: `bar-pulse 1.1s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

// ── Phase 3: numbered boxes appearing in load order (topological sort) ─────────
function OrderingAnim() {
  return (
    <div className="flex items-center justify-center gap-2 h-12">
      {[1, 2, 3].map((n, i) => (
        <div
          key={n}
          className="w-7 h-7 rounded border border-primary/60 bg-primary/10 flex items-center justify-center text-[11px] font-mono font-semibold text-primary/80"
          style={{ animation: `seq-appear 2.1s ease-out ${i * 0.44}s infinite` }}
        >
          {n}
        </div>
      ))}
    </div>
  )
}

// ── Phase lookup ──────────────────────────────────────────────────────────────
type PhaseEntry = { maxPct: number; label: string; Anim: () => React.JSX.Element }

const PHASES: PhaseEntry[] = [
  { maxPct: 82, label: 'Placing cartons…',       Anim: PlacingAnim    },
  { maxPct: 96, label: 'Compacting layout…',      Anim: CompactingAnim },
  { maxPct: 99, label: 'Ordering load sequence…', Anim: OrderingAnim   },
]

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

  const { label, Anim: ActiveAnim } =
    PHASES.find((p) => pct <= p.maxPct) ?? PHASES[PHASES.length - 1]

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="w-80 rounded-lg border border-border bg-background px-6 py-5 shadow-2xl space-y-3">

          <h2 className="text-sm font-semibold">Optimising load plan…</h2>

          <div className="flex flex-col items-center gap-1 py-1">
            <ActiveAnim />
            <p className="text-[10px] text-muted-foreground">{label}</p>
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
    </>
  )
}

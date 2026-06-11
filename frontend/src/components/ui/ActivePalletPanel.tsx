/**
 * ActivePalletPanel.tsx — canvas overlay listing pallet segments in load order.
 *
 * Exports: ActivePalletPanel.
 * The segment containing the current globalIndex glows in its pallet color.
 * Clicking a segment jumps the GSAP timeline to its first carton.
 * Segments are identified by `firstGI` (not `palletIndex`) so a pallet split
 * across two containers highlights only the active segment, not both.
 */
import { useStore } from '@/src/store'
import { timelineRef } from '@/src/lib/animationState'

/** Right-side canvas overlay showing live pallet tracking with click-to-jump. */
export function ActivePalletPanel() {
  const packingResult    = useStore((s) => s.packingResult)
  const pallets          = useStore((s) => s.pallets)
  const palletBoundaries = useStore((s) => s.palletBoundaries)
  const totalPackedCount = useStore((s) => s.totalPackedCount)
  const progress         = useStore((s) => s.progress)

  if (!packingResult || !palletBoundaries || !totalPackedCount) return null

  const currentGI = Math.min(
    Math.floor(progress * totalPackedCount),
    totalPackedCount - 1,
  )

  // Identify the active boundary by its firstGI — unique per segment even when
  // the same pallet is split across two containers.
  const activeBoundaryFirstGI = palletBoundaries.find(
    (b) => currentGI >= b.firstGI && currentGI <= b.lastGI,
  )?.firstGI ?? -1

  return (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1 rounded-lg border border-border bg-background/80 backdrop-blur-sm px-3 py-3 min-w-[152px] max-h-[70vh] overflow-y-auto">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground pb-1">
        Loading
      </p>

      {palletBoundaries.map((b) => {
        const isActive = b.firstGI === activeBoundaryFirstGI
        const pallet   = pallets[b.palletIndex]
        const count    = b.lastGI - b.firstGI + 1

        const fraction = totalPackedCount ? b.firstGI / totalPackedCount : 0

        const jumpToCheckpoint = () => {
          const tl = timelineRef.current
          if (tl) tl.progress(fraction)
        }

        return (
          <button
            key={b.firstGI}
            type="button"
            onClick={jumpToCheckpoint}
            className="w-full flex items-center gap-2 rounded-md pl-2 pr-2.5 py-1.5 transition-all duration-300 cursor-pointer text-left"
            style={isActive ? {
              boxShadow: `0 0 10px 2px ${b.color}55, inset 0 0 10px 1px ${b.color}22`,
              border: `1px solid ${b.color}88`,
              opacity: 1,
            } : {
              border: '1px solid transparent',
              opacity: 0.35,
            }}
          >
            <div className="min-w-0">
              <p
                className="text-xs font-medium truncate leading-tight transition-colors duration-300"
                style={{ color: isActive ? b.color : undefined }}
              >
                {pallet?.label ?? b.label}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                {count} carton{count !== 1 ? 's' : ''}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

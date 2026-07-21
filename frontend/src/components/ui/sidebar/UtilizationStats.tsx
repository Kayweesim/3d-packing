/**
 * UtilizationStats.tsx — per-container utilization bars with per-pallet counts.
 *
 * Exports: UtilizationStats.
 * Renders nothing when there is no packing result.
 * The active container (when multiple exist) is highlighted with a muted background.
 */
import { useMemo } from 'react'
import { useStore } from '@/src/store'

/** List of per-container utilization bars, each broken down by pallet. */
export function UtilizationStats() {
  const packingResult          = useStore((s) => s.packingResult)
  const containers             = useStore((s) => s.containers)
  const activeContainerIndex   = useStore((s) => s.activeContainerIndex)
  const pallets                = useStore((s) => s.pallets)

  // cartonId → { palletLabel, palletIndex, productCode } for per-pallet breakdown
  const cartonPalletMap = useMemo(() => {
    const map = new Map<string, { label: string; index: number; productCode: string }>()
    pallets.forEach((p, i) =>
      p.cartons.forEach((c) => map.set(c.id, { label: p.label, index: i, productCode: c.productCode ?? c.id }))
    )
    return map
  }, [pallets])

  if (!packingResult || packingResult.length === 0) return null

  return (
    <div className="space-y-2">
      {packingResult.map((result) => {
        const containerIndex = containers.findIndex((c) => c.id === result.containerId)
        const container = containers[containerIndex]
        const isActive  = containers.length > 1 && containerIndex === activeContainerIndex
        const pct   = (result.utilization * 100).toFixed(1)
        const count = result.placements.length

        // Count placements per pallet, broken down by product code, for this container
        const palletCounts = new Map<string, Map<string, number>>()
        result.placements.forEach((p) => {
          const info = cartonPalletMap.get(p.cartonId)
          if (!info) return
          const productCounts = palletCounts.get(info.label) ?? new Map<string, number>()
          productCounts.set(info.productCode, (productCounts.get(info.productCode) ?? 0) + 1)
          palletCounts.set(info.label, productCounts)
        })
        const palletEntries = [...palletCounts.entries()]

        return (
          <div
            key={result.containerId}
            className={`space-y-1 rounded-md px-2 py-1.5 transition-colors ${
              result.flatApplied ? 'ring-1 ring-amber-500/40 bg-amber-500/5' : isActive ? 'bg-muted' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs truncate text-foreground">{container?.label ?? '—'}</span>
                {result.flatApplied && (
                  <span
                    title="This is the last container and was re-packed flat (cartons spread low across the floor) to keep the load stable and avoid toppling, rather than stacked into a tall wall."
                    className="shrink-0 rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400"
                  >
                    Flat-packed
                  </span>
                )}
              </span>
              <span className="text-xs font-medium tabular-nums text-foreground shrink-0">
                {pct}%
              </span>
            </div>

            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>

            <p className="text-[10px] text-muted-foreground">
              {count} carton{count !== 1 ? 's' : ''} placed
            </p>

            {result.flatApplied && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                Last container — packed flat for stability
              </p>
            )}

            {palletEntries.length > 0 && (
              <div className="text-[11px] space-y-0.5 pt-0.5">
                {palletEntries.map(([label, productCounts]) => (
                  <div
                    key={label}
                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-border px-2 py-1"
                  >
                    <span className="text-muted-foreground">{label}:</span>
                    {[...productCounts.entries()].map(([productCode, n]) => (
                      <span key={productCode} className="text-muted-foreground">
                        {productCode} ({n})
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

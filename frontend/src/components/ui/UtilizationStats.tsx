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

  // cartonId → { palletLabel, palletIndex } for per-pallet breakdown
  const cartonPalletMap = useMemo(() => {
    const map = new Map<string, { label: string; index: number }>()
    pallets.forEach((p, i) => p.cartons.forEach((c) => map.set(c.id, { label: p.label, index: i })))
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

        // Count placements per pallet for this container
        const palletCounts = new Map<string, number>()
        result.placements.forEach((p) => {
          const info = cartonPalletMap.get(p.cartonId)
          if (!info) return
          palletCounts.set(info.label, (palletCounts.get(info.label) ?? 0) + 1)
        })
        const palletEntries = [...palletCounts.entries()]

        return (
          <div
            key={result.containerId}
            className={`space-y-1 rounded-md px-2 py-1.5 transition-colors ${
              isActive ? 'bg-muted' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs truncate text-foreground">{container?.label ?? '—'}</span>
              <span className="text-xs font-medium tabular-nums text-foreground ml-2 shrink-0">
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

            {palletEntries.length > 0 && (
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5">
                {palletEntries.map(([label, n]) => (
                  <span key={label} className="text-[10px] text-muted-foreground">
                    {label}: {n}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

import { useStore } from '@/src/store'

export function UtilizationStats() {
  const packingResult          = useStore((s) => s.packingResult)
  const containers             = useStore((s) => s.containers)
  const activeContainerIndex   = useStore((s) => s.activeContainerIndex)

  if (!packingResult || packingResult.length === 0) return null

  return (
    <div className="space-y-2">
      {packingResult.map((result) => {
        const containerIndex = containers.findIndex((c) => c.id === result.containerId)
        const container = containers[containerIndex]
        const isActive  = containers.length > 1 && containerIndex === activeContainerIndex
        const pct   = Math.round(result.utilization * 100)
        const count = result.placements.length

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
              {count} box{count !== 1 ? 'es' : ''} placed
            </p>
          </div>
        )
      })}
    </div>
  )
}

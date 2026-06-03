import { useStore } from '@/src/store'
import { ContainerTypeSelector } from './ContainerTypeSelector'
import { BoxForm } from './BoxForm'
import { UtilizationStats } from './UtilizationStats'
import { PlaybackControls } from './PlaybackControls'
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  )
}

export function Sidebar() {
  const runPacker        = useStore((s) => s.runPacker)
  const loading          = useStore((s) => s.loading)
  const error            = useStore((s) => s.error)
  const availableTypes   = useStore((s) => s.availableTypes)
  const boxes            = useStore((s) => s.boxes)
  const totalCost        = useStore((s) => s.totalCost)
  const containerSummary = useStore((s) => s.containerSummary)
  const allPacked        = useStore((s) => s.allPacked)
  const packingResult    = useStore((s) => s.packingResult)

  const canPack = availableTypes.length > 0 && boxes.length > 0 && !loading

  return (
    <div className="h-full flex flex-col gap-6 overflow-y-auto px-4 py-4">
      <Section title="Container Types">
        <ContainerTypeSelector />
      </Section>

      <div className="border-t border-border" />

      <Section title="Boxes">
        <BoxForm />
      </Section>

      <div className="border-t border-border" />

      <div className="space-y-3">
        {/* Pack button */}
        <button
          type="button"
          onClick={runPacker}
          disabled={!canPack}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {loading ? 'Packing…' : 'Pack'}
        </button>

        {/* Error */}
        {error && (
          <p className="text-xs text-destructive leading-snug">{error}</p>
        )}

        {/* Optimizer result summary */}
        {packingResult && !loading && containerSummary && (
          <div className="rounded-md border border-border px-2.5 py-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Selected</span>
              <span className="text-xs font-medium">{containerSummary}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Cost</span>
              <span className="text-xs font-medium tabular-nums">{totalCost} units</span>
            </div>
            {!allPacked && (
              <p className="text-[10px] text-destructive leading-snug pt-0.5">
                Not all boxes fit — some were left out.
              </p>
            )}
          </div>
        )}

        <UtilizationStats />
        <PlaybackControls />
      </div>
    </div>
  )
}

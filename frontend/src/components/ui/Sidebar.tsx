/**
 * Sidebar.tsx — left panel with two views: setup (default) and test cases.
 *
 * Exports: Sidebar.
 * Setup view: algorithm toggles, container type selector, product master +
 * Excel import (extracted into ProductMasterImport / ImportDataButton),
 * dimension-buffer + lashing toggles, pallet list with search, pack button,
 * result summary, exports, utilization stats, and playback controls.
 * Test-case view: TestCasePanel + stats/playback. Toggled by the flask icon.
 */
import { useEffect, useRef, useState } from 'react'
import { Download, FlaskConical, ArrowLeft, Rabbit, Box, Columns3, Link2, BookOpen, Search } from 'lucide-react'
import { useStore } from '@/src/store'
import { Section } from './Section'
import { ContainerTypeSelector } from './ContainerTypeSelector'
import { ProductMasterImport } from './ProductMasterImport'
import { ImportDataButton } from './ImportDataButton'
import { PalletList } from './PalletList'
import { UtilizationStats } from './UtilizationStats'
import { PlaybackControls } from './PlaybackControls'
import { TestCasePanel } from './TestCasePanel'
import { exportLoadPlan } from '@/src/lib/excelExport'
import { exportLoadSlices } from '@/src/lib/loadSlicesExport'

/** Collapsible left sidebar housing all setup controls and playback UI. */
export function Sidebar() {
  const runPacker        = useStore((s) => s.runPacker)
  const loading          = useStore((s) => s.loading)
  const error            = useStore((s) => s.error)
  const availableTypes   = useStore((s) => s.availableTypes)
  const pallets          = useStore((s) => s.pallets)
  const totalCost        = useStore((s) => s.totalCost)
  const containerSummary = useStore((s) => s.containerSummary)
  const allPacked        = useStore((s) => s.allPacked)
  const packingResult    = useStore((s) => s.packingResult)
  const containers       = useStore((s) => s.containers)
  const algo                 = useStore((s) => s.algo)
  const setAlgo              = useStore((s) => s.setAlgo)
  const dimensionBuffer      = useStore((s) => s.dimensionBuffer)
  const setDimensionBuffer   = useStore((s) => s.setDimensionBuffer)
  const lashing              = useStore((s) => s.lashing)
  const setLashing           = useStore((s) => s.setLashing)
  const setVisualizerOpen    = useStore((s) => s.setVisualizerOpen)

  const sidebarRef            = useRef<HTMLDivElement>(null)
  const [palletQuery, setPalletQuery]   = useState('')
  const [view, setView]                 = useState<'setup' | 'tests'>('setup')

  const palletNeedle   = palletQuery.trim().toLowerCase()
  const firstMatchId   = palletNeedle
    ? pallets.find((p) => p.label.toLowerCase().includes(palletNeedle))?.id ?? null
    : null

  useEffect(() => {
    if (!palletNeedle || !firstMatchId) return
    const container = sidebarRef.current
    if (!container) return

    // We wrap it in a tiny delay to fix the "Ghost Element" timing issue
    setTimeout(() => {
      const el = container.querySelector(
        `[data-pallet-id="${CSS.escape(firstMatchId)}"]`,
      ) as HTMLElement | null

      if (el) {
        el.scrollIntoView({ behavior: 'instant', block: 'center' })
      }
    }, 50)
  }, [palletNeedle, firstMatchId, pallets])

  const allDimsSet = pallets.length > 0 &&
    pallets.every((p) => p.cartons.every((c) => c.w > 0 && c.h > 0 && c.d > 0))
  const canPack = availableTypes.length > 0 && allDimsSet && !loading

  const totalPalletQuantity = pallets.reduce(
    (sum, p) => sum + p.cartons.reduce((s, c) => s + c.quantity, 0), 0)
  // Testing View
  if (view === 'tests') {
    return (
      <div className="h-full flex flex-col gap-4 overflow-y-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Test Cases
          </h2>
          <button
            type="button"
            title="Back to setup"
            onClick={() => setView('setup')}
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <ArrowLeft size={14} />
          </button>
        </div>
        <TestCasePanel />
        <div className="border-t border-border" />
        <UtilizationStats />
        <PlaybackControls />
      </div>
    )
  }

  return (
    <div ref={sidebarRef} className="h-full flex flex-col gap-6 overflow-y-auto px-4 py-4">
      <div className="flex items-center justify-between -mb-4">
        <div className="flex gap-1">
          {([
            { id: 'guillotine', icon: <Rabbit size={14} />, title: 'Guillotine — fastest',          neon: '255,255,255' },
            { id: 'algo2',      icon: <Box     size={14} />, title: 'Layer build — height-first',     neon: '34,197,94'  },
          ] as const).map(({ id, icon, title, neon }) => (
            <button
              key={id}
              type="button"
              title={title}
              onClick={() => setAlgo(id)}
              className="rounded-md border p-1.5 transition-all duration-200 text-muted-foreground group"
              style={algo === id ? {
                borderColor: `rgb(${neon})`,
                color: `rgb(${neon})`,
                boxShadow: `0 0 8px 1px rgba(${neon},0.6)`,
              } : undefined}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `rgb(${neon})`
                e.currentTarget.style.color = `rgb(${neon})`
                e.currentTarget.style.boxShadow = `0 0 8px 1px rgba(${neon},0.6)`
              }}
              onMouseLeave={(e) => {
                if (algo !== id) {
                  e.currentTarget.style.borderColor = ''
                  e.currentTarget.style.color = ''
                  e.currentTarget.style.boxShadow = ''
                }
              }}
            >
              {icon}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            title="Algorithm visualizer"
            onClick={() => setVisualizerOpen(true)}
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <BookOpen size={14} />
          </button>
          <button
            type="button"
            title="Test cases"
            onClick={() => setView('tests')}
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <FlaskConical size={14} />
          </button>
        </div>
      </div>

      <Section title="Container Types">
        <ContainerTypeSelector />
      </Section>

      <div className="border-t border-border" />

      <ProductMasterImport />

      <div className="space-y-2">
        <button
          type="button"
          role="switch"
          aria-checked={dimensionBuffer === 15}
          onClick={() => setDimensionBuffer(dimensionBuffer === 15 ? 0 : 15)}
          className="w-full flex items-center justify-between gap-2"
        >
          <span className="flex items-center gap-1.5">
            <Box size={12} className="text-muted-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Dimension Buffer
            </span>
          </span>
          <span
            className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
              dimensionBuffer === 15 ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`absolute top-0.5 h-3 w-3 rounded-full bg-background transition-transform ${
                dimensionBuffer === 15 ? 'translate-x-px' : '-translate-x-3'
              }`}
            />
          </span>
        </button>
        <p className="text-[10px] text-muted-foreground leading-snug">
          {dimensionBuffer === 15
            ? 'On — +15% added to each dim before packing (e.g. 10 cm → 11.5 cm).'
            : 'Off — dimensions sent as-is.'}
        </p>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          role="switch"
          aria-checked={lashing}
          onClick={() => setLashing(!lashing)}
          className="w-full flex items-center justify-between gap-2"
        >
          <span className="flex items-center gap-1.5">
            <Link2 size={12} className="text-muted-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Lashing
            </span>
          </span>
          <span
            className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
              lashing ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`absolute top-0.5 h-3 w-3 rounded-full bg-background transition-transform ${
                lashing ? 'translate-x-px' : '-translate-x-3'
              }`}
            />
          </span>
        </button>
        <p className="text-[10px] text-muted-foreground leading-snug">
          {lashing
            ? 'On — load is lashed/secured, so cartons stack tall (depth-first). No flat re-pack.'
            : 'Off — the last container is re-packed flat (low, spread out) to stay stable against toppling.'}
        </p>
      </div>

      <div className="border-t border-border" />

      <ImportDataButton />

      <div className="border-t border-border" />

      <Section
        title="Pallets"
        right={
          pallets.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {totalPalletQuantity} Qty
            </span>
          )
        }
      >
        {pallets.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5">
            <Search size={11} className="shrink-0 text-muted-foreground" />
            <input
              type="text"
              value={palletQuery}
              onChange={(e) => setPalletQuery(e.target.value)}
              placeholder="Search pallet…"
              className="w-full bg-transparent text-[10px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        )}
        <PalletList
          needle={palletNeedle}
          firstMatchId={firstMatchId}
        />
      </Section>

      <div className="border-t border-border" />

      <div className="space-y-3">
        <button
          type="button"
          onClick={runPacker}
          disabled={!canPack}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {loading ? 'Packing…' : 'Pack'}
        </button>

        {error && (
          <p className="text-xs text-destructive leading-snug">{error}</p>
        )}

        {packingResult && !loading && containerSummary && (
          <div className="rounded-md border border-border px-2.5 py-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Selected</span>
              <span className="text-xs font-medium">{containerSummary}</span>
            </div>
            {!allPacked && (
              <p className="text-[10px] text-destructive leading-snug pt-0.5">
                Not all cartons fit — some were left out.
              </p>
            )}
          </div>
        )}

        {packingResult && !loading && (
          <button
            type="button"
            onClick={() => exportLoadPlan(packingResult, pallets, containers, totalCost, allPacked)}
            className="w-full flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
          >
            <Download size={13} />
            Export Load Plan
          </button>
        )}

        {packingResult && !loading && (
          <button
            type="button"
            onClick={() => exportLoadSlices(packingResult, pallets, containers)}
            className="w-full flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
          >
            <Columns3 size={13} />
            Export Load Slices
          </button>
        )}

        <UtilizationStats />
        <PlaybackControls />
      </div>
    </div>
  )
}

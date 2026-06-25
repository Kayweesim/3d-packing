/**
 * Sidebar.tsx — left panel with two views: setup (default) and test cases.
 *
 * Exports: Sidebar.
 * Setup view: container type selector, Excel import, pallet list, pack button,
 * result summary, export button, utilization stats, and playback controls.
 * Test-case view: TestCasePanel + stats/playback. Toggled by the flask icon.
 */
import { useRef, useState } from 'react'
import { Upload, Download, FlaskConical, ArrowLeft, Rabbit, Box, Columns3, Link2, BookOpen } from 'lucide-react'
import { useStore } from '@/src/store'
import { ContainerTypeSelector } from './ContainerTypeSelector'
import { PalletList } from './PalletList'
import { UtilizationStats } from './UtilizationStats'
import { PlaybackControls } from './PlaybackControls'
import { TestCasePanel } from './TestCasePanel'
import { parseExcel } from '@/src/lib/excelImport'
import { exportLoadPlan } from '@/src/lib/excelExport'
import { exportLoadSlices } from '@/src/lib/loadSlicesExport'
import { parseProductMaster } from '@/src/lib/productMaster'
import type { ProductMasterMap } from '@/src/lib/productMaster'

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </div>
  )
}

/** Collapsible left sidebar housing all setup controls and playback UI. */
export function Sidebar() {
  const runPacker        = useStore((s) => s.runPacker)
  const loading          = useStore((s) => s.loading)
  const error            = useStore((s) => s.error)
  const availableTypes   = useStore((s) => s.availableTypes)
  const pallets          = useStore((s) => s.pallets)
  const setPallets       = useStore((s) => s.setPallets)
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

  const fileInputRef          = useRef<HTMLInputElement>(null)
  const masterFileInputRef    = useRef<HTMLInputElement>(null)
  const [importError, setImportError]   = useState<string | null>(null)
  const [importing, setImporting]       = useState(false)
  const [view, setView]                 = useState<'setup' | 'tests'>('setup')
  const [productMaster, setProductMaster]         = useState<ProductMasterMap | null>(null)
  const [masterLabel, setMasterLabel]             = useState<string | null>(null)
  const [masterError, setMasterError]             = useState<string | null>(null)
  const [masterLoading, setMasterLoading]         = useState(false)

  // Apply master dims to already-loaded pallets so import order doesn't matter.
  // Looks up each carton by label (product code); skips cartons not in the master.
  function applyMasterToPallets(master: ProductMasterMap) {
    if (pallets.length === 0) return
    const updated = pallets.map((pallet) => ({
      ...pallet,
      cartons: pallet.cartons.map((carton) => {
        const dims = master.get(carton.label)
        if (!dims) return carton
        return { ...carton, w: dims.w, h: dims.h, d: dims.d }
      }),
    }))
    setPallets(updated)
  }

  async function handleMasterFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMasterError(null)
    setMasterLoading(true)
    try {
      const master = await parseProductMaster(file)
      setProductMaster(master)
      setMasterLabel(file.name)
      applyMasterToPallets(master)
    } catch (err) {
      setMasterError(err instanceof Error ? err.message : 'Failed to parse product master.')
    } finally {
      setMasterLoading(false)
      e.target.value = ''
    }
  }

  async function handleUseDefaultMaster() {
    setMasterError(null)
    setMasterLoading(true)
    try {
      const res = await fetch('/product-master.xlsx')
      if (!res.ok) throw new Error('Default product master not found in /public.')
      const buffer = await res.arrayBuffer()
      const master = await parseProductMaster(buffer)
      setProductMaster(master)
      setMasterLabel('Default')
      applyMasterToPallets(master)
    } catch (err) {
      setMasterError(err instanceof Error ? err.message : 'Failed to load default master.')
    } finally {
      setMasterLoading(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null)
    setImporting(true)
    try {
      const parsed = await parseExcel(file)
      // If a product master is already loaded, populate dims from it so import
      // order doesn't matter (Use Default → then Import works the same as the
      // reverse). Cartons not in the master keep their sheet/fallback dims.
      if (productMaster) {
        setPallets(parsed.map((pallet) => ({
          ...pallet,
          cartons: pallet.cartons.map((carton) => {
            const dims = productMaster.get(carton.label)
            return dims ? { ...carton, w: dims.w, h: dims.h, d: dims.d } : carton
          }),
        })))
      } else {
        setPallets(parsed)
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to parse file.')
    } finally {
      setImporting(false)
      // Reset so the same file can be re-imported
      e.target.value = ''
    }
  }

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
    <div className="h-full flex flex-col gap-6 overflow-y-auto px-4 py-4">
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

      <Section title="Product Master">
        <input
          ref={masterFileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleMasterFile}
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={masterLoading}
            onClick={() => masterFileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Upload size={12} />
            {masterLoading ? 'Loading…' : 'Import'}
          </button>
          <button
            type="button"
            disabled={masterLoading}
            onClick={handleUseDefaultMaster}
            className="flex-1 flex items-center justify-center rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Use Default
          </button>
        </div>
        {masterError ? (
          <p className="text-[10px] text-destructive leading-snug">{masterError}</p>
        ) : masterLabel ? (
          <p className="text-[10px] text-green-500 leading-snug">Loaded: {masterLabel}</p>
        ) : (
          <p className="text-[10px] text-muted-foreground leading-snug">
            No master loaded — dimensions fall back to sheet columns or 25 cm.
          </p>
        )}
      </Section>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Dimension Buffer
          </h2>
          <span className="text-[10px] font-semibold tabular-nums text-foreground">
            {dimensionBuffer}%
          </span>
        </div>
        <div className="flex gap-1.5">
          {([5, 10, 15] as const).map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => setDimensionBuffer(dimensionBuffer === pct ? 0 : pct)}
              className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                dimensionBuffer === pct
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {pct}%
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground leading-snug">
          {dimensionBuffer === 0
            ? 'No buffer — dimensions sent as-is.'
            : `+${dimensionBuffer}% added to each dim before packing (e.g. 10 cm → ${(10 * (1 + dimensionBuffer / 100)).toFixed(1)} cm).`}
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

      <Section title="Import Data">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFile}
        />
        <button
          type="button"
          disabled={importing}
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Upload size={13} />
          {importing ? 'Importing…' : 'Import from Excel'}
        </button>
        {importError ? (
          <p className="text-[10px] text-destructive leading-snug">{importError}</p>
        ) : (
          <p className="text-[10px] text-muted-foreground leading-snug">
            Columns required: Product Code, Qty to pick. Pallet ID optional.
          </p>
        )}
      </Section>

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
        <PalletList />
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
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Cost</span>
              <span className="text-xs font-medium tabular-nums">{totalCost} units</span>
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

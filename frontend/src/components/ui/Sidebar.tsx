/**
 * Sidebar.tsx — left panel with two views: setup (default) and test cases.
 *
 * Exports: Sidebar.
 * Setup view: container type selector, Excel import, pallet list, pack button,
 * result summary, export button, utilization stats, and playback controls.
 * Test-case view: TestCasePanel + stats/playback. Toggled by the flask icon.
 */
import { useRef, useState } from 'react'
import { Upload, Download, FlaskConical, ArrowLeft } from 'lucide-react'
import { useStore } from '@/src/store'
import { ContainerTypeSelector } from './ContainerTypeSelector'
import { PalletList } from './PalletList'
import { UtilizationStats } from './UtilizationStats'
import { PlaybackControls } from './PlaybackControls'
import { TestCasePanel } from './TestCasePanel'
import { parseExcel } from '@/src/lib/excelImport'
import { exportLoadPlan } from '@/src/lib/excelExport'

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

  const fileInputRef            = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting]     = useState(false)
  const [view, setView]               = useState<'setup' | 'tests'>('setup')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null)
    setImporting(true)
    try {
      const parsed = await parseExcel(file)
      setPallets(parsed)
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
      <div className="flex justify-end -mb-4">
        <button
          type="button"
          title="Test cases"
          onClick={() => setView('tests')}
          className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        >
          <FlaskConical size={14} />
        </button>
      </div>

      <Section title="Container Types">
        <ContainerTypeSelector />
      </Section>

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
            Columns required: Pallet ID, Product Code, Qty to pick.
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

        <UtilizationStats />
        <PlaybackControls />
      </div>
    </div>
  )
}

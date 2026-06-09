import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { useStore } from '@/src/store'
import { ContainerTypeSelector } from './ContainerTypeSelector'
import { PalletList } from './PalletList'
import { UtilizationStats } from './UtilizationStats'
import { PlaybackControls } from './PlaybackControls'
import { parseExcel } from '@/src/lib/excelImport'

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
  const pallets          = useStore((s) => s.pallets)
  const setPallets       = useStore((s) => s.setPallets)
  const totalCost        = useStore((s) => s.totalCost)
  const containerSummary = useStore((s) => s.containerSummary)
  const allPacked        = useStore((s) => s.allPacked)
  const packingResult    = useStore((s) => s.packingResult)

  const fileInputRef            = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting]     = useState(false)

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

  return (
    <div className="h-full flex flex-col gap-6 overflow-y-auto px-4 py-4">
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


      {/* Pallet section displaying each pallet and respective cartons */}
      <Section title="Pallets">
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

        <UtilizationStats />
        <PlaybackControls />
      </div>
    </div>
  )
}

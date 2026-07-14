/**
 * ImportDataButton.tsx — the "Import Data" sidebar section.
 *
 * Exports: ImportDataButton.
 * Parses a pallet/carton manifest (.xlsx/.xls/.csv) via parseExcel and replaces
 * the pallets in the store. If a product master is loaded, its dims and
 * rotation/stacking flags are applied to the freshly-parsed cartons (looked up
 * by product code), so results are the same regardless of whether the master
 * or the data was imported first. Owns only its own transient UI state
 * (importing/error/drag).
 */
import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { useStore } from '@/src/store'
import { Section } from './Section'
import { parseExcel } from '@/src/lib/excelImport'

export function ImportDataButton() {
  const setPallets        = useStore((s) => s.setPallets)
  const setImportFileName = useStore((s) => s.setImportFileName)
  const productMaster     = useStore((s) => s.productMaster)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError]       = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [dragging, setDragging] = useState(false)

  async function processFile(file: File) {
    setError(null)
    setImporting(true)
    try {
      const parsed = await parseExcel(file)
      if (productMaster) {
        setPallets(parsed.map((pallet) => ({
          ...pallet,
          cartons: pallet.cartons.map((carton) => {
            const dims = productMaster.get(carton.label)
            return dims
              ? {
                  ...carton,
                  w: dims.w,
                  h: dims.h,
                  d: dims.d,
                  rotationAllowed: dims.rotationAllowed,
                  stacking: dims.stacking,
                }
              : carton
          }),
        })))
      } else {
        setPallets(parsed)
      }
      // Remember the source name (without extension) for the export filename.
      setImportFileName(file.name.replace(/\.[^.]+$/, ''))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file.')
    } finally {
      setImporting(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) await processFile(file)
    e.target.value = ''
  }

  return (
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
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) processFile(file)
        }}
        className={`w-full flex items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          dragging
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
        }`}
      >
        <Upload size={13} />
        {dragging ? 'Drop to import' : importing ? 'Importing…' : 'Import from Excel'}
      </button>
      {error ? (
        <p className="text-[10px] text-destructive leading-snug">{error}</p>
      ) : (
        <p className="text-[10px] text-muted-foreground leading-snug">
          Columns required: Product Code, Qty to pick. Pallet ID optional.
        </p>
      )}
    </Section>
  )
}

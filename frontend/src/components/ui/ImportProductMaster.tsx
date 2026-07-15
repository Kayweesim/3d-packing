/**
 * ImportProductMaster.tsx — the "Product Master" sidebar section.
 *
 * Exports: ImportProductMaster.
 * Lets the user upload a product master sheet (or load the bundled default),
 * parses it, and hands it to the store (`setProductMaster`), which applies the
 * dims to any already-loaded pallets. Owns only its own transient UI state
 * (loading/error/drag); the parsed master itself lives in the store so the
 * Import Data control can read it without prop-drilling.
 */
import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { useStore } from '@/src/store'
import { Section } from './Section'
import { parseProductMaster } from '@/src/lib/productMaster'

export function ImportProductMaster() {
  const setProductMaster = useStore((s) => s.setProductMaster)
  const masterLabel      = useStore((s) => s.masterLabel)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const [dragging, setDragging] = useState(false)

  // Auto-load the bundled default master on first mount, as if "Use Default"
  // was clicked — dims are right without any setup clicks. Skipped when a
  // master is already in the store (e.g. re-mounting after a user upload);
  // the ref guards StrictMode's double-invoke from fetching twice.
  const autoLoadRan = useRef(false)
  useEffect(() => {
    if (autoLoadRan.current || masterLabel) return
    autoLoadRan.current = true
    void handleUseDefault()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function processFile(file: File) {
    setError(null)
    setLoading(true)
    try {
      const master = await parseProductMaster(file)
      setProductMaster(master, file.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse product master.')
    } finally {
      setLoading(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) await processFile(file)
    e.target.value = ''
  }

  async function handleUseDefault() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/product-master.xlsx')
      if (!res.ok) throw new Error('Default product master not found in /public.')
      const buffer = await res.arrayBuffer()
      const master = await parseProductMaster(buffer)
      setProductMaster(master, 'Default')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load default master.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Section title="Product Master">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFile}
      />
      <div
        className={`flex gap-1.5 rounded-md transition-colors ${dragging ? 'ring-1 ring-primary bg-primary/5' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) processFile(file)
        }}
      >
        <button
          type="button"
          disabled={loading}
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Upload size={12} />
          {dragging ? 'Drop to import' : loading ? 'Loading…' : 'Import'}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={handleUseDefault}
          className="flex-1 flex items-center justify-center rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Use Default
        </button>
      </div>
      {error ? (
        <p className="text-[10px] text-destructive leading-snug">{error}</p>
      ) : masterLabel ? (
        <p className="text-[10px] text-green-500 leading-snug">Loaded: {masterLabel}</p>
      ) : (
        <p className="text-[10px] text-muted-foreground leading-snug">
          No master loaded — dimensions fall back to sheet columns or 25 cm.
        </p>
      )}
    </Section>
  )
}

/**
 * RightSidebar.tsx — right-hand panel for Pallet Packing (single-SKU).
 *
 * Exports: RightSidebar.
 * Pallet-mode counterpart to the left Sidebar. Lets the user pick a carton
 * (from the loaded manifest or manual dims), choose a pallet type + max height +
 * quantity, run the pallet packer, and read the resulting layer/pallet stats.
 * Opened by the PackingModeToggle's "Pallet" button; drives the pallet 3D scene.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Boxes, RotateCw, Layers, ChevronDown, Search } from 'lucide-react'
import { useStore } from '@/src/store'
import { Section } from './Section'
import { PalletTypeSelector } from './PalletTypeSelector'
import { ImportProductMaster } from './ImportProductMaster'
import { PlaybackControls } from './PlaybackControls'
import type { ManualBox } from '@/src/store/palletPackSlice'

type SourceMode = 'product' | 'manual'

const DEFAULT_MANUAL: ManualBox = {
  label: 'Manual carton', w: 40, h: 30, d: 30, rotationAllowed: true, stacking: true,
}

/** Full pallet-packing control panel + results. */
export function RightSidebar() {
  const productMaster      = useStore((s) => s.productMaster)
  const selectedCartonId   = useStore((s) => s.selectedCartonId)
  const setSelectedCartonId = useStore((s) => s.setSelectedCartonId)
  const setManualBox       = useStore((s) => s.setManualBox)
  const palletMaxHeight    = useStore((s) => s.palletMaxHeight)
  const setPalletMaxHeight = useStore((s) => s.setPalletMaxHeight)
  const palletQuantity     = useStore((s) => s.palletQuantity)
  const setPalletQuantity  = useStore((s) => s.setPalletQuantity)
  const runPalletPacker    = useStore((s) => s.runPalletPacker)
  const palletLoading      = useStore((s) => s.palletLoading)
  const palletError        = useStore((s) => s.palletError)
  const result             = useStore((s) => s.palletPackResult)

  const [sourceMode, setSourceMode] = useState<SourceMode>('product')
  const [manual, setManual]         = useState<ManualBox>(DEFAULT_MANUAL)

  // Selectable products come from the shared product master (code → dims). Search
  // filters by code only; dimensions are shown but not searched (see CartonSelect).
  const cartonOptions = useMemo(
    () => productMaster
      ? Array.from(productMaster.entries()).map(([code, d]) => ({
          id: code,
          label: code,
          dims: `${d.w}×${d.h}×${d.d}`,
        }))
      : [],
    [productMaster],
  )

  // Push the active carton source into the store. Manual mode syncs the form;
  // manifest mode clears any manual box so the selection is used.
  useEffect(() => {
    if (sourceMode === 'manual') setManualBox(manual)
    else setManualBox(null)
  }, [sourceMode, manual, setManualBox])

  const canPack = !palletLoading && (
    sourceMode === 'product'
      ? selectedCartonId != null
      : manual.w > 0 && manual.h > 0 && manual.d > 0
  )

  const setManualField = (patch: Partial<ManualBox>) => setManual((m) => ({ ...m, ...patch }))

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center px-4 py-3 border-b border-border">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Pallet Packing
        </h2>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-6">
        {/* ── Product master (shared app-wide; auto-loads its default) ────── */}
        <ImportProductMaster />

        {/* ── Carton source ─────────────────────────────────────────────── */}
        <Section title="Carton">
          <div className="grid grid-cols-2 gap-1.5">
            {(['product', 'manual'] as SourceMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSourceMode(mode)}
                className={[
                  'rounded-md border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-all',
                  sourceMode === mode
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                ].join(' ')}
              >
                {mode === 'product' ? 'Product' : 'Manual'}
              </button>
            ))}
          </div>

          {sourceMode === 'product' ? (
            <CartonSelect
              options={cartonOptions}
              value={selectedCartonId}
              onChange={setSelectedCartonId}
            />
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                {(['w', 'h', 'd'] as const).map((dim) => (
                  <label key={dim} className="flex flex-col gap-0.5">
                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{dim} (cm)</span>
                    <NumberField
                      value={manual[dim]}
                      min={1}
                      onChange={(n) => setManualField({ [dim]: n })}
                      className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-[11px] text-foreground focus:outline-none focus:border-primary/40"
                    />
                  </label>
                ))}
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setManualField({ rotationAllowed: !manual.rotationAllowed })}
                  className={[
                    'flex-1 flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[10px] transition-colors',
                    manual.rotationAllowed
                      ? 'border-primary/60 text-foreground' : 'border-border text-muted-foreground',
                  ].join(' ')}
                >
                  <RotateCw size={11} /> Rotate {manual.rotationAllowed ? 'On' : 'Off'}
                </button>
                <button
                  type="button"
                  onClick={() => setManualField({ stacking: !manual.stacking })}
                  className={[
                    'flex-1 flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[10px] transition-colors',
                    manual.stacking
                      ? 'border-primary/60 text-foreground' : 'border-border text-muted-foreground',
                  ].join(' ')}
                >
                  <Layers size={11} /> Stack {manual.stacking ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          )}
        </Section>

        {/* ── Pallet type ───────────────────────────────────────────────── */}
        <Section title="Pallet Type">
          <PalletTypeSelector />
        </Section>

        {/* ── Max height + quantity ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Max Height</span>
            <div className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5">
              <NumberField
                value={palletMaxHeight}
                min={1}
                onChange={setPalletMaxHeight}
                className="w-full bg-transparent text-[11px] text-foreground focus:outline-none"
              />
              <span className="text-[10px] text-muted-foreground">cm</span>
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Quantity</span>
            <NumberField
              value={palletQuantity}
              min={1}
              integer
              onChange={setPalletQuantity}
              className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-[11px] text-foreground focus:outline-none focus:border-primary/40"
            />
          </label>
        </div>

        {/* ── Pack button ───────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={runPalletPacker}
          disabled={!canPack}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {palletLoading ? 'Packing…' : 'Pack Pallet'}
        </button>

        {palletError && (
          <p className="text-xs text-destructive leading-snug">{palletError}</p>
        )}

        {/* ── Results ───────────────────────────────────────────────────── */}
        {result && !palletLoading && (
          result.perPallet > 0 ? (
            <Section title="Result">
              <div className="rounded-md border border-border divide-y divide-border text-[11px]">
                <Row label="Cartons / layer" value={`${result.perLayer}`} />
                <Row label="Layers" value={`${result.layers}`} />
                <Row label="Cartons / pallet" value={`${result.perPallet}`} />
                <Row
                  label="Pallets needed"
                  value={
                    result.palletsNeeded === 1
                      ? '1'
                      : `${result.palletsNeeded} (last ${result.lastPalletCount})`
                  }
                />
              </div>
            </Section>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-destructive leading-snug">
              <Boxes size={13} /> This carton doesn’t fit on the pallet within the height cap.
            </p>
          )
        )}

        {/* ── Pallet focus list ─────────────────────────────────────────── */}
        {result && !palletLoading && <PalletFocusList />}

        {/* Timeline playback — drives the shared GSAP timeline (self-guards on a
            pallet result, so it only appears after a successful pack). */}
        <PlaybackControls />
      </div>
    </div>
  )
}

interface CartonOption { id: string; label: string; dims: string }

/**
 * Custom product dropdown — replaces the native <select> so the popup can be
 * rounded, connected to the trigger, and searchable. The search box filters by
 * product code only (dimensions are shown in each row but not searched). Closes
 * on outside click / select.
 */
function CartonSelect({
  options, value, onChange,
}: {
  options: CartonOption[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const ref       = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Close when clicking anywhere outside the control.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Focus the search box on open; clear the query on close.
  useEffect(() => {
    if (open) searchRef.current?.focus()
    else setQuery('')
  }, [open])

  const selected = options.find((o) => o.id === value)
  const needle   = query.trim().toLowerCase()
  // Match the product code only — dimensions are displayed but not searched.
  const filtered = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 border border-border bg-background px-2 py-1.5 text-[11px] transition-colors hover:border-primary/40 ${
          open ? 'rounded-t-md border-b-0' : 'rounded-md'
        }`}
      >
        <span className={`truncate ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>
          {selected ? `${selected.label} · ${selected.dims} cm` : 'Select a product…'}
        </span>
        <ChevronDown size={13} className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 rounded-b-md border border-t-0 border-border bg-background shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
            <Search size={11} className="shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search product…"
              className="w-full bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                {options.length === 0 ? 'No products loaded.' : 'No matches.'}
              </p>
            )}
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false) }}
                className={`w-full text-left px-2 py-1.5 text-[11px] transition-colors hover:bg-accent ${
                  o.id === value ? 'text-foreground bg-accent/50' : 'text-muted-foreground'
                }`}
              >
                {o.label} · {o.dims} cm
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * NumberField — a numeric input the user can freely clear and edit. It holds a
 * string draft (so intermediate states like "" or "1." are allowed) instead of
 * binding straight to a clamped store number, which would snap back to the min on
 * every keystroke. Rejects non-numeric input; normalizes (clamp to min, floor if
 * integer) on blur, and reflects external value changes when not being edited.
 */
function NumberField({
  value, onChange, min = 0, integer = false, className,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  integer?: boolean
  className?: string
}) {
  const [draft, setDraft]     = useState(String(value))
  const [focused, setFocused] = useState(false)

  // Reflect external changes (e.g. a pallet-preset switch) only when idle.
  useEffect(() => {
    if (!focused) setDraft(String(value))
  }, [value, focused])

  const pattern = integer ? /^\d*$/ : /^\d*\.?\d*$/

  const handleChange = (raw: string) => {
    if (raw !== '' && !pattern.test(raw)) return   // reject letters / bad chars
    setDraft(raw)
    const n = integer ? parseInt(raw, 10) : parseFloat(raw)
    if (Number.isFinite(n)) onChange(n)            // push valid numbers live
  }

  const handleBlur = () => {
    setFocused(false)
    let n = integer ? parseInt(draft, 10) : parseFloat(draft)
    if (!Number.isFinite(n)) n = min               // empty/invalid → fall back to min
    n = Math.max(min, n)
    onChange(n)
    setDraft(String(n))
  }

  return (
    <input
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
      className={className}
    />
  )
}

/**
 * PalletFocusList — clickable list of the packed pallets. Clicking one zooms the
 * camera onto it and dims the others; clicking it again (or another) toggles the
 * focus off / moves it. Selection lives in the store (selectedPalletIndex) so the
 * 3D scene and camera react to it.
 */
function PalletFocusList() {
  const result      = useStore((s) => s.palletPackResult)
  const selected    = useStore((s) => s.selectedPalletIndex)
  const setSelected = useStore((s) => s.setSelectedPalletIndex)

  if (!result || result.palletsNeeded <= 0 || result.perPallet <= 0) return null
  const { palletsNeeded, perPallet, lastPalletCount } = result

  return (
    <Section title="Pallets">
      <ul className="space-y-1.5">
        {Array.from({ length: palletsNeeded }, (_, i) => {
          const count = i === palletsNeeded - 1 ? lastPalletCount : perPallet
          const isSel = selected === i
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => setSelected(isSel ? null : i)}
                className={[
                  'w-full flex items-center justify-between rounded-md border px-2.5 py-2 text-[11px] transition-all',
                  isSel
                    ? 'border-primary bg-primary/10 text-foreground shadow-[0_0_12px_hsl(var(--primary)/0.3)]'
                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                ].join(' ')}
              >
                <span className="font-medium">Pallet {i + 1}</span>
                <span>{count} cartons</span>
              </button>
            </li>
          )
        })}
      </ul>
      {selected != null && (
        <p className="text-[10px] text-muted-foreground leading-snug">
          Focused on Pallet {selected + 1}. Click it again to show all pallets.
        </p>
      )}
    </Section>
  )
}

/** Label/value row in the results table. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-2.5 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

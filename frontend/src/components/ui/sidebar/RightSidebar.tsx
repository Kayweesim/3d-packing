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
import { Boxes, RotateCw, Layers, ChevronDown } from 'lucide-react'
import { useStore } from '@/src/store'
import { Section } from './Section'
import { PalletTypeSelector } from './PalletTypeSelector'
import { PlaybackControls } from './PlaybackControls'
import type { ManualBox } from '@/src/store/palletPackSlice'

type SourceMode = 'manifest' | 'manual'

const DEFAULT_MANUAL: ManualBox = {
  label: 'Manual carton', w: 40, h: 30, d: 30, rotationAllowed: true, stacking: true,
}

/** Full pallet-packing control panel + results. */
export function RightSidebar() {
  const palletCartons      = useStore((s) => s.palletCartons)
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

  const [sourceMode, setSourceMode] = useState<SourceMode>('manifest')
  const [manual, setManual]         = useState<ManualBox>(DEFAULT_MANUAL)

  // Selectable cartons come solely from the pallet feature's own catalog —
  // independent of the container manifest (palletSlice).
  const cartonOptions = useMemo(
    () => palletCartons.map((c) => ({
      id: c.id,
      label: c.productCode ?? c.label,
      dims: `${c.w}×${c.h}×${c.d}`,
    })),
    [palletCartons],
  )

  // Push the active carton source into the store. Manual mode syncs the form;
  // manifest mode clears any manual box so the selection is used.
  useEffect(() => {
    if (sourceMode === 'manual') setManualBox(manual)
    else setManualBox(null)
  }, [sourceMode, manual, setManualBox])

  const canPack = !palletLoading && (
    sourceMode === 'manifest'
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
        {/* ── Carton source ─────────────────────────────────────────────── */}
        <Section title="Carton">
          <div className="grid grid-cols-2 gap-1.5">
            {(['manifest', 'manual'] as SourceMode[]).map((mode) => (
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
                {mode === 'manifest' ? 'From Manifest' : 'Manual'}
              </button>
            ))}
          </div>

          {sourceMode === 'manifest' ? (
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
                    <input
                      type="number"
                      min={1}
                      value={manual[dim]}
                      onChange={(e) => setManualField({ [dim]: Number(e.target.value) })}
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
              <input
                type="number"
                min={1}
                value={palletMaxHeight}
                onChange={(e) => setPalletMaxHeight(Number(e.target.value))}
                className="w-full bg-transparent text-[11px] text-foreground focus:outline-none"
              />
              <span className="text-[10px] text-muted-foreground">cm</span>
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Quantity</span>
            <input
              type="number"
              min={1}
              value={palletQuantity}
              onChange={(e) => setPalletQuantity(Number(e.target.value))}
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

        {/* Timeline playback — drives the shared GSAP timeline (self-guards on a
            pallet result, so it only appears after a successful pack). */}
        <PlaybackControls />
      </div>
    </div>
  )
}

interface CartonOption { id: string; label: string; dims: string }

/**
 * Custom carton dropdown — replaces the native <select> so the popup can be
 * rounded and visually connected to the trigger (native option lists are
 * square and OS-styled, uneditable via CSS). Closes on outside click / select.
 */
function CartonSelect({
  options, value, onChange,
}: {
  options: CartonOption[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close when clicking anywhere outside the control.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const selected = options.find((o) => o.id === value)

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
          {selected ? `${selected.label} · ${selected.dims} cm` : 'Select a carton…'}
        </span>
        <ChevronDown size={13} className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 max-h-56 overflow-y-auto rounded-b-md border border-t-0 border-border bg-background shadow-lg">
          {options.length === 0 && (
            <p className="px-2 py-1.5 text-[11px] text-muted-foreground">No cartons loaded.</p>
          )}
          {options.map((o) => (
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
      )}
    </div>
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

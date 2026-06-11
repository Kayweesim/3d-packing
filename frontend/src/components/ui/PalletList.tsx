/**
 * PalletList.tsx — renders the ordered list of pallets in the sidebar.
 *
 * Exports: PalletList.
 * The array index `i` passed as `palletIndex` to PalletRow is the canonical
 * pallet color index — it must match the colorIndex stamped onto boxes in
 * runPacker and used by getCartonColor throughout the app.
 */
import { useStore } from '@/src/store'
import { PalletRow } from './PalletRow'

/** Ordered list of PalletRows, or an empty-state hint when no pallets are loaded. */
export function PalletList() {
  const pallets = useStore((s) => s.pallets)

  if (pallets.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground leading-snug">
        No pallets loaded. Import an Excel sheet above to get started.
      </p>
    )
  }

  return (
    <ul className="space-y-1.5">
      {pallets.map((pallet, i) => (
        <PalletRow key={pallet.id} pallet={pallet} palletIndex={i} />
      ))}
    </ul>
  )
}

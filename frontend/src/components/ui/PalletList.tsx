import { useStore } from '@/src/store'
import { PalletRow } from './PalletRow'

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
      {pallets.map((pallet) => (
        <PalletRow key={pallet.id} pallet={pallet} />
      ))}
    </ul>
  )
}

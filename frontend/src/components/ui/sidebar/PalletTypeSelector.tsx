/**
 * PalletTypeSelector.tsx — glow-toggle buttons for choosing a pallet type.
 *
 * Exports: PalletTypeSelector.
 * Pallet-mode mirror of ContainerTypeSelector. Reads/writes palletType in the
 * pallet-pack store slice; selecting a preset also seeds its default max height.
 */
import { useStore } from '@/src/store'
import { PALLET_TYPES } from '@/src/lib/palletTypes'

/** Single-select glow-toggle list of pallet presets. */
export function PalletTypeSelector() {
  const palletType         = useStore((s) => s.palletType)
  const setPalletType      = useStore((s) => s.setPalletType)
  const setPalletMaxHeight = useStore((s) => s.setPalletMaxHeight)

  return (
    <div className="space-y-2">
      {PALLET_TYPES.map((pt) => {
        const active = palletType === pt.key
        return (
          <button
            key={pt.key}
            type="button"
            onClick={() => { setPalletType(pt.key); setPalletMaxHeight(pt.maxHeight) }}
            className={[
              'w-full text-left rounded-md border px-3 py-2.5 transition-all duration-200',
              active
                ? 'border-primary bg-primary/10 shadow-[0_0_14px_hsl(var(--primary)/0.35)] text-foreground'
                : 'border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground',
            ].join(' ')}
          >
            <p className="text-xs font-semibold">{pt.label}</p>
            <p className="text-[10px] mt-0.5 opacity-70">
              {pt.key === 'CUSTOM' ? 'Default footprint — set max height below' : `${pt.Wp} × ${pt.Dp} cm footprint`}
            </p>
          </button>
        )
      })}
      {/* TODO: let CUSTOM edit its Wp/Dp footprint (v1 uses the default 120×100). */}
    </div>
  )
}

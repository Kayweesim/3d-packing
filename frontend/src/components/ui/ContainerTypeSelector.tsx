import { useStore } from '@/src/store'
import type { ContainerType } from '@/src/store'

const OPTIONS: { type: ContainerType; label: string; dims: string; cost: string }[] = [
  { type: '20ft', label: '20ft TEU', dims: '589 × 235 × 239 cm', cost: '1 unit' },
  { type: '40ft', label: '40ft FEU', dims: '1203 × 235 × 239 cm', cost: '1.5 units' },
]

export function ContainerTypeSelector() {
  const availableTypes    = useStore((s) => s.availableTypes)
  const setAvailableTypes = useStore((s) => s.setAvailableTypes)

  const toggle = (type: ContainerType) => {
    if (availableTypes.includes(type)) {
      if (availableTypes.length === 1) {
        // Deselect — results in nothing selected, Pack will be disabled
        setAvailableTypes([])
      } else {
        setAvailableTypes(availableTypes.filter((t) => t !== type))
      }
    } else {
      setAvailableTypes([...availableTypes, type])
    }
  }

  return (
    <div className="space-y-2">
      {OPTIONS.map(({ type, label, dims, cost }) => {
        const active = availableTypes.includes(type)
        return (
          <button
            key={type}
            type="button"
            onClick={() => toggle(type)}
            className={[
              'w-full text-left rounded-md border px-3 py-2.5 transition-all duration-200',
              active
                ? 'border-primary bg-primary/10 shadow-[0_0_14px_hsl(var(--primary)/0.35)] text-foreground'
                : 'border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground',
            ].join(' ')}
          >
            <p className="text-xs font-semibold">{label}</p>
            <p className="text-[10px] mt-0.5 opacity-70">{dims}</p>
            <p className="text-[10px] opacity-70">{cost}</p>
          </button>
        )
      })}
      <p className="text-[10px] text-muted-foreground leading-snug">
        The optimizer picks the cheapest combination that fits all boxes.
      </p>
    </div>
  )
}

import { useStore } from '@/src/store'
import { ContainerForm } from './ContainerForm'
import { BoxForm } from './BoxForm'
import { UtilizationStats } from './UtilizationStats'

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
  const pack = useStore((s) => s.pack)
  const containers = useStore((s) => s.containers)
  const boxes = useStore((s) => s.boxes)

  // Pack is only meaningful when there's at least one container and one box type.
  const canPack = containers.length > 0 && boxes.length > 0

  return (
    <div className="h-full flex flex-col gap-6 overflow-y-auto px-4 py-4">
      <Section title="Containers">
        <ContainerForm />
      </Section>

      <div className="border-t border-border" />

      <Section title="Boxes">
        <BoxForm />
      </Section>

      <div className="border-t border-border" />

      {/* Pack action — triggers the Guillotine algorithm and stores the result */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={pack}
          disabled={!canPack}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Pack
        </button>

        {/* Shows per-container utilisation % after packing */}
        <UtilizationStats />
      </div>
    </div>
  )
}

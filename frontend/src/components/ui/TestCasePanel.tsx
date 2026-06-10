import { Play } from 'lucide-react'
import { useStore } from '@/src/store'
import { TEST_CASES } from '@/src/lib/testCases'
import type { TestCase } from '@/src/lib/testCases'

export function TestCasePanel() {
  const setPallets = useStore((s) => s.setPallets)
  const runPacker  = useStore((s) => s.runPacker)
  const loading    = useStore((s) => s.loading)

  const runTest = (tc: TestCase) => {
    setPallets(tc.pallets)
    runPacker()
  }

  return (
    <div className="space-y-2">
      {TEST_CASES.map((tc) => {
        const cartonCount = tc.pallets.reduce(
          (sum, p) => sum + p.cartons.reduce((s, c) => s + c.quantity, 0),
          0,
        )
        return (
          <div key={tc.id} className="rounded-md border border-border px-2.5 py-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium leading-tight">{tc.name}</p>
              <button
                type="button"
                disabled={loading}
                onClick={() => runTest(tc)}
                title="Load pallets and pack"
                className="shrink-0 flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Play size={10} />
                Pack
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">
              {tc.description}
            </p>
            <p className="text-[10px] text-muted-foreground/70 tabular-nums">
              {tc.pallets.length} pallet{tc.pallets.length !== 1 ? 's' : ''} · {cartonCount} cartons
            </p>
          </div>
        )
      })}
    </div>
  )
}

/**
 * PackingModeToggle.tsx — floating bottom-center switch between packing targets.
 *
 * Exports: PackingModeToggle.
 * "Container" is the current, fully-implemented mode and opens the left Sidebar
 * (its setup/controls panel). "Pallet" (optimizing a load onto a single pallet
 * rather than a container) has no packing logic yet and opens the right sidebar
 * placeholder — selecting it only flips uiSlice.packingMode; nothing downstream
 * reacts to it.
 * TODO: wire packingMode into runPacker / the backend once pallet packing exists.
 */
import { Box, LayoutGrid } from 'lucide-react'
import { useStore } from '@/src/store'
import type { PackingMode } from '@/src/store/uiSlice'

const MODES: { id: PackingMode; icon: typeof Box; label: [string, string]; neon: string }[] = [
  { id: 'container', icon: Box,        label: ['Container', 'Packing'], neon: '34,197,94' },
  { id: 'pallet',     icon: LayoutGrid, label: ['Pallet', 'Packing'],    neon: '59,130,246' },
]

/** Fixed pill, bottom-center of whatever positioning context it's placed in. */
export function PackingModeToggle() {
  const packingMode         = useStore((s) => s.packingMode)
  const setPackingMode      = useStore((s) => s.setPackingMode)
  const setSidebarOpen      = useStore((s) => s.setSidebarOpen)
  const setRightSidebarOpen = useStore((s) => s.setRightSidebarOpen)

  // Container packing lives in the left Sidebar; pallet packing in the right one.
  // Selecting a mode opens its panel and closes the other's so they don't overlap.
  function selectMode(id: PackingMode) {
    setPackingMode(id)
    setSidebarOpen(id === 'container')
    setRightSidebarOpen(id === 'pallet')
  }

  return (
    <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-4 p-1.5 shadow-lg backdrop-blur-sm">
      {MODES.map(({ id, icon: Icon, label, neon }) => (
        <button
          key={id}
          type="button"
          title={label.join(' ')}
          onClick={() => selectMode(id)}
          className="flex w-24 flex-col items-center justify-center gap-1 rounded-md border border-border py-3 text-muted-foreground transition-all duration-200"
          style={packingMode === id ? {
            borderColor: `rgb(${neon})`,
            color: `rgb(${neon})`,
            boxShadow: `0 0 8px 1px rgba(${neon},0.6)`,
          } : undefined}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = `rgb(${neon})`
            e.currentTarget.style.color = `rgb(${neon})`
            e.currentTarget.style.boxShadow = `0 0 8px 1px rgba(${neon},0.6)`
          }}
          onMouseLeave={(e) => {
            if (packingMode !== id) {
              e.currentTarget.style.borderColor = ''
              e.currentTarget.style.color = ''
              e.currentTarget.style.boxShadow = ''
            }
          }}
        >
          <Icon size={40} />
          <span className="flex flex-col items-center text-[10px] font-semibold uppercase leading-tight tracking-wide">
            <span>{label[0]}</span>
            <span>{label[1]}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

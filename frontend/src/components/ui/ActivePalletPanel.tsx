/**
 * ActivePalletPanel.tsx — canvas overlay listing pallet segments in load order.
 *
 * Exports: ActivePalletPanel.
 * The segment containing the current globalIndex glows in its pallet color.
 * Clicking a segment jumps the GSAP timeline to its first carton.
 * The search input filters by label and scrolls to the closest match on every
 * keystroke without touching the animation timeline.
 * Segments are identified by `firstGI` (not `palletIndex`) so a pallet split
 * across two containers highlights only the active segment, not both.
 */
import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useStore } from '@/src/store'
import { timelineRef } from '@/src/lib/animationState'

/** Right-side canvas overlay showing live pallet tracking with click-to-jump. */
export function ActivePalletPanel() {
  const packingResult    = useStore((s) => s.packingResult)
  const pallets          = useStore((s) => s.pallets)
  const palletBoundaries = useStore((s) => s.palletBoundaries)
  const totalPackedCount = useStore((s) => s.totalPackedCount)
  const progress         = useStore((s) => s.progress)

  const [query, setQuery] = useState('')
  // Stable map from firstGI → button element, populated via callback refs.
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map())

  const needle = query.trim().toLowerCase()

  // On every keystroke, find the first matching boundary and scroll to it.
  useEffect(() => {
    if (!needle || !palletBoundaries) return
    const firstMatch = palletBoundaries.find((b) => {
      const label = (pallets[b.palletIndex]?.label ?? b.label).toLowerCase()
      return label.includes(needle)
    })
    if (!firstMatch) return
    const btn = itemRefs.current.get(firstMatch.firstGI)
    if (btn) btn.scrollIntoView({ behavior: 'instant', block: 'nearest' })
  }, [needle, palletBoundaries, pallets])

  if (!packingResult || !palletBoundaries || !totalPackedCount) return null

  const currentGI = Math.min(
    Math.floor(progress * totalPackedCount),
    totalPackedCount - 1,
  )

  const activeBoundaryFirstGI = palletBoundaries.find(
    (b) => currentGI >= b.firstGI && currentGI <= b.lastGI,
  )?.firstGI ?? -1

  // Compute the first match's key once so we can style it without a mutable flag.
  const firstMatchGI = needle
    ? palletBoundaries.find((b) => {
        const label = (pallets[b.palletIndex]?.label ?? b.label).toLowerCase()
        return label.includes(needle)
      })?.firstGI ?? -1
    : -1

  return (
    <div className="absolute z-10 flex flex-col rounded-lg border border-border bg-background/80 backdrop-blur-sm top-14 inset-x-2 md:inset-x-auto md:right-4 md:top-1/2 md:-translate-y-1/2 md:min-w-[152px] md:max-h-[70vh]">

      {/* Search — desktop only, sits above the scroll area so it never interferes */}
      <div className="hidden md:flex items-center gap-1.5 px-3 py-2 border-b border-border shrink-0">
        <Search size={11} className="shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pallet…"
          className="w-full bg-transparent text-[10px] text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>

      {/* Scrollable list */}
      <div className="flex gap-1 flex-row overflow-x-auto px-2 py-1.5 md:flex-col md:overflow-x-hidden md:overflow-y-auto md:px-3 md:py-3 md:flex-1">
        <p className="hidden md:block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground pb-1">
          Loading
        </p>

      {palletBoundaries.map((b) => {
        const isActive  = b.firstGI === activeBoundaryFirstGI
        const label     = pallets[b.palletIndex]?.label ?? b.label
        const count     = b.lastGI - b.firstGI + 1
        const fraction  = totalPackedCount ? b.firstGI / totalPackedCount : 0
        const matches   = needle ? label.toLowerCase().includes(needle) : true
        const isFirst   = b.firstGI === firstMatchGI

        return (
          <button
            key={b.firstGI}
            ref={(el) => {
              if (el) itemRefs.current.set(b.firstGI, el)
              else itemRefs.current.delete(b.firstGI)
            }}
            type="button"
            onClick={() => {
              const tl = timelineRef.current
              if (tl) tl.progress(fraction)
            }}
            className="shrink-0 md:w-full flex items-center gap-2 rounded-md pl-2 pr-2.5 py-1.5 transition-all duration-300 cursor-pointer text-left"
            style={isActive ? {
              boxShadow: `0 0 10px 2px ${b.color}55, inset 0 0 10px 1px ${b.color}22`,
              border: `1px solid ${b.color}88`,
              opacity: 1,
            } : isFirst ? {
              background: `${b.color}18`,
              border: `1px solid ${b.color}aa`,
              boxShadow: `0 0 8px 1px ${b.color}44`,
              opacity: 1,
            } : {
              border: '1px solid transparent',
              opacity: needle && !matches ? 0.1 : 0.35,
            }}
          >
            <div className="min-w-0 max-w-[120px] md:max-w-none">
              <p
                className="text-xs font-medium truncate leading-tight transition-colors duration-300"
                style={{ color: isActive ? b.color : isFirst ? b.color : undefined }}
              >
                {label}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                {count} carton{count !== 1 ? 's' : ''}
              </p>
            </div>
          </button>
        )
      })}
      </div>
    </div>
  )
}

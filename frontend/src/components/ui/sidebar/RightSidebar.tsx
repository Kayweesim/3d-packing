/**
 * RightSidebar.tsx — right-hand panel for Pallet Packing.
 *
 * Exports: RightSidebar.
 * Mirrors the left Sidebar's layout but on the right edge. Container packing
 * lives in the left Sidebar; this panel is the pallet-packing counterpart,
 * opened by the PackingModeToggle's "Pallet" button. Pallet packing has no
 * packing logic yet, so the body is a placeholder.
 * TODO: fill in pallet-packing controls once pallet packing exists.
 */

/** Right-hand pallet-packing controls panel (placeholder). */
export function RightSidebar() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center px-4 py-3 border-b border-border">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Pallet Packing
        </h2>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        <p className="text-[11px] leading-snug text-muted-foreground">
          Pallet packing controls will appear here. This mode has no packing logic yet.
        </p>
      </div>
    </div>
  )
}

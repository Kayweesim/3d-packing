/**
 * Section.tsx — labelled sidebar section wrapper.
 *
 * Exports: Section.
 * A small uppercase heading (with an optional right-aligned slot) above its
 * children. Shared by the Sidebar and the controls extracted out of it.
 */
import type { ReactNode } from 'react'

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </div>
  )
}

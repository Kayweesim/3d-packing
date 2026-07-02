/**
 * excelExport.ts — builds the load-plan workbook client-side (SheetJS) and
 * triggers the browser download (load-plan-YYYY-MM-DD.xlsx).
 *
 * Exports: exportLoadPlan.
 * All data comes from the store — no backend involved.
 * ⚠ Pallet labels and rotation flags are read from the CURRENT pallets store;
 * exporting after importing a different sheet without re-packing produces
 * stale labels (known issue — see CLAUDE.md "What needs to be fixed").
 */
import * as XLSX from 'xlsx'
import type { Pallet } from '../store/palletSlice'
import type { Container } from '../store/containerSlice'
import type { PackingResult } from '../store/packingSlice'

/** Excel sheet-name rules: max 31 chars, none of \ / ? * [ ] : */
function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31)
}

/**
 * Builds and downloads a load-plan workbook:
 *  - Sheet 1 "Summary": one row per container + totals
 *  - Sheet 2..N: one sheet per container, one row per placed carton in
 *    load-sequence order. Seq # is global (continues across containers) so it
 *    matches the numbers shown on the boxes in the 3D scene.
 */
export function exportLoadPlan(
  packingResult: PackingResult[],
  pallets: Pallet[],
  containers: Container[],
  totalCost: number | null,
  allPacked: boolean,
): void {
  // cartonId → pallet label / original (pre-rotation) dims
  const palletLabel  = new Map<string, string>()
  const originalDims = new Map<string, { w: number; h: number; d: number }>()
  pallets.forEach((pallet) =>
    pallet.cartons.forEach((c) => {
      palletLabel.set(c.id, pallet.label)
      originalDims.set(c.id, { w: c.w, h: c.h, d: c.d })
    }),
  )

  const containerById = new Map(containers.map((c) => [c.id, c]))
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Summary ─────────────────────────────────────────────────────────
  const summaryRows: (string | number)[][] = [
    ['Container', 'Cartons', 'Utilization (%)'],
  ]
  let totalCartons = 0
  for (const result of packingResult) {
    const container = containerById.get(result.containerId)
    summaryRows.push([
      container?.label ?? result.containerId,
      result.placements.length,
      Math.round(result.utilization * 1000) / 10,  // 0–1 → percent, 1 decimal
    ])
    totalCartons += result.placements.length
  }
  summaryRows.push([])
  summaryRows.push(['Total cartons', totalCartons])
  if (totalCost != null) summaryRows.push(['Total cost', totalCost])
  summaryRows.push(['All packed', allPacked ? 'Yes' : 'No'])

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows)
  summaryWs['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

  // ── Sheets 2..N: one per container ───────────────────────────────────────────
  let seq = 1
  packingResult.forEach((result, idx) => {
    const rows = result.placements.map((p) => {
      const orig = originalDims.get(p.cartonId)
      const rotated =
        orig != null && (p.w !== orig.w || p.h !== orig.h || p.d !== orig.d)
      return {
        'Seq #':                   seq++,
        'Pallet':                  palletLabel.get(p.cartonId) ?? '',
        'Product Code':            p.cartonId,
        'X (cm, from left wall)':  p.x,
        'Y (cm, from floor)':      p.y,
        'Z (cm, from back wall)':  p.z,
        'W (cm)':                  p.w,
        'H (cm)':                  p.h,
        'D (cm)':                  p.d,
        'Rotated':                 rotated ? 'Yes' : 'No',
      }
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      { wch: 6 },  // Seq #
      { wch: 14 }, // Pallet
      { wch: 16 }, // Product Code
      { wch: 20 }, // X
      { wch: 18 }, // Y
      { wch: 22 }, // Z
      { wch: 8 },  // W
      { wch: 8 },  // H
      { wch: 8 },  // D
      { wch: 8 },  // Rotated
    ]

    const label = containerById.get(result.containerId)?.label ?? result.containerId
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(`${idx + 1} - ${label}`))
  })

  const date = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD
  XLSX.writeFile(wb, `load-plan-${date}.xlsx`)
}

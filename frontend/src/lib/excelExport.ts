/**
 * excelExport.ts — builds the load-plan workbook client-side (SheetJS) and
 * triggers the browser download.
 *
 * Exports: exportLoadPlan.
 * All data comes from the store — no backend involved.
 * Filename: <imported-manifest-name>-YYYY-MM-DD.xlsx (falls back to
 * "load-plan" when no Excel import has happened this session).
 *  - Sheet 1 "Summary": containers used, per-container utilization, totals.
 *  - Sheet 2 "COPY EXCEL PICK LIST HERE": one row per pallet × carton type —
 *    Pallet ID, Product Code, dims, quantity, packed count, container
 *    assignment. Sheet name + column headers deliberately match what
 *    excelImport.ts::parseExcel looks for, so an exported load plan can be
 *    re-imported as a manifest (round-trip).
 * When an export folder has been picked (lib/exportFolder.ts — e.g. a
 * OneDrive-synced directory), the workbook is written straight into it via
 * the File System Access API instead of a browser download.
 */
import * as XLSX from 'xlsx'
import { writeToFolder } from './exportFolder'
import type { Pallet } from '../store/palletSlice'
import type { Container } from '../store/containerSlice'
import type { PackingResult } from '../store/packingSlice'

/** Strip characters that are invalid in filenames. */
function sanitizeFileName(name: string): string {
  return name.replace(/[\\/?%*:|"<>]/g, '-').trim()
}

/**
 * Builds the load-plan workbook, then either writes it into the picked
 * `folder` (File System Access API — the caller must have confirmed write
 * permission first) or falls back to a browser download when no folder has
 * been chosen.
 * @param packingResult  Per-container placements from the optimizer.
 * @param pallets        Current pallets store (source of labels/dims/qty).
 * @param containers     Containers chosen by the optimizer.
 * @param totalCost      Optimizer cost of the chosen combo (null before pack).
 * @param allPacked      Whether every carton was placed.
 * @param importFileName Base name of the imported manifest (null → "load-plan").
 * @param folder         Picked directory handle (null → browser download).
 * @returns "<folder>/<file>" when written to the folder, or null for a download.
 * @throws DOMException when the folder write fails (permission revoked, disk).
 */
export async function exportLoadPlan(
  packingResult: PackingResult[],
  pallets: Pallet[],
  containers: Container[],
  totalCost: number | null,
  allPacked: boolean,
  importFileName: string | null,
  folder: FileSystemDirectoryHandle | null,
): Promise<string | null> {
  const containerById = new Map(containers.map((c) => [c.id, c]))

  // cartonId → packed count per container label (a carton type can overflow
  // across containers, so track the split rather than a single total).
  const packedByCarton = new Map<string, Map<string, number>>()
  for (const result of packingResult) {
    const containerLabel = containerById.get(result.containerId)?.label ?? result.containerId
    for (const p of result.placements) {
      const perContainer = packedByCarton.get(p.cartonId) ?? new Map<string, number>()
      perContainer.set(containerLabel, (perContainer.get(containerLabel) ?? 0) + 1)
      packedByCarton.set(p.cartonId, perContainer)
    }
  }

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
  summaryRows.push(['Containers used', packingResult.length])
  summaryRows.push(['Total cartons packed', totalCartons])
  if (totalCost != null) summaryRows.push(['Total cost', totalCost])
  summaryRows.push(['All packed', allPacked ? 'Yes' : 'No'])
  summaryRows.push(['Exported', new Date().toISOString().slice(0, 10)])

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows)
  summaryWs['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

  // ── Sheet 2: pick list (one row per pallet × carton type) ────────────────────
  // Headers must satisfy parseExcel's column regexes (dims are cm; "Width" not
  // "Width (cm)" because the import matches /^width$/i) so the export can be
  // re-imported as a manifest.
  const planRows = pallets.flatMap((pallet) =>
    pallet.cartons.map((c) => {
      const perContainer = packedByCarton.get(c.id)
      const packedQty = perContainer
        ? [...perContainer.values()].reduce((sum, n) => sum + n, 0)
        : 0
      const containerList = perContainer
        ? [...perContainer.entries()].map(([label, n]) => `${label} (${n})`).join(', ')
        : ''
      return {
        'Pallet ID':      pallet.label,
        'Product Code':   c.productCode ?? c.label,
        'Width':          c.w,
        'Height':         c.h,
        'Depth':          c.d,
        'Qty to Pick':    c.quantity,
        'Packed Qty':     packedQty,
        'Container':      containerList,
        'Rotation':       c.rotationAllowed ? 'Yes' : 'No',
        'Stacking':       c.stacking ? 'Yes' : 'No',
      }
    }),
  )

  const planWs = XLSX.utils.json_to_sheet(planRows)
  planWs['!cols'] = [
    { wch: 14 }, // Pallet ID
    { wch: 16 }, // Product Code
    { wch: 10 }, // Width
    { wch: 10 }, // Height
    { wch: 10 }, // Depth
    { wch: 11 }, // Qty to Pick
    { wch: 10 }, // Packed Qty
    { wch: 24 }, // Container
    { wch: 9 },  // Rotation
    { wch: 9 },  // Stacking
  ]
  // Sheet name = parseExcel's TARGET_SHEET so re-import picks this sheet, not Summary.
  XLSX.utils.book_append_sheet(wb, planWs, 'COPY EXCEL PICK LIST HERE')

  // Local-time stamp: YYYY-MM-DD-HHmm (e.g. 2026-07-14-1530).
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  // Strip a leading timestamp (and the older trailing-date format) so
  // re-exporting an imported load plan doesn't stack stamps.
  const base = (sanitizeFileName(importFileName ?? 'load-plan') || 'load-plan')
    .replace(/^\d{4}-\d{2}-\d{2}-\d{4}-/, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
  const filename = `${stamp}-${base}.xlsx`

  if (folder) {
    // Write straight into the picked folder (e.g. OneDrive-synced → auto-uploaded).
    const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    await writeToFolder(folder, filename, data)
    return `${folder.name}\\${filename}`
  }

  XLSX.writeFile(wb, filename)  // no folder picked → normal browser download
  return null
}

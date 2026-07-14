/**
 * excelImport.ts — parses a pallet/carton manifest from .xlsx, .xls or .csv.
 *
 * Exports: parseExcel.
 * Reads the first sheet only (SheetJS). Required columns (case-insensitive):
 * Product Code, Qty To Pick. Pallet ID and Width/Height/Depth are optional and
 * fall back to DEFAULT_DIM_CM when absent or invalid. Rows with a blank product
 * or non-positive qty are silently skipped; a row with a blank Pallet ID is
 * assigned its own placeholder pallet (PALLET-A, PALLET-B, …). The same product
 * appearing on multiple rows under one pallet accumulates quantity.
 */
import * as XLSX from 'xlsx'
import type { Pallet } from '@/src/store/palletSlice'
import type { Carton } from '@/src/store/cartonSlice'

// Fallback carton dimension (cm) when a W/H/D column is missing or invalid.
const DEFAULT_DIM_CM = 25

// Target Excel Sheet Specific Name
const TARGET_SHEET = 'COPY EXCEL PICK LIST HERE'

// Column headers we look for (case-insensitive, trims whitespace).
// "to pick" is required in the qty pattern so it never matches "Total Remain Qty".
const COL_PALLET  = /pallet\s*id/i
const COL_PRODUCT = /product\s*(code|name)?/i
const COL_QTY     = /qty\s+to\s+pick/i
const COL_WIDTH   = /^width$/i
const COL_HEIGHT  = /^height$/i
const COL_DEPTH   = /^depth$/i
// Optional Yes/No columns — present in our own exported load plans, so a
// re-imported plan keeps the flags. Absent or unrecognized values → true.
const COL_ROTATION = /^rotation$/i
const COL_STACKING = /^stacking$/i

/** Parse a Yes/No cell permissively: only an explicit "no"/"n" disables. */
function parseYesNo(value: string): boolean {
  const v = value.trim().toLowerCase()
  return v !== 'no' && v !== 'n'
}


/** Index of the first header matching `pattern`, or -1 if none matches. */
function findCol(headers: string[], pattern: RegExp): number {
  return headers.findIndex((h) => pattern.test(h.trim()))
}

/** Convert a 0-based index to a spreadsheet-style letter sequence: 0→A, 25→Z, 26→AA. */
function letterLabel(index: number): string {
  let label = ''
  let n = index
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

/**
 * Parse an Excel/CSV manifest into pallets.
 * @param file The file picked by the user (.xlsx, .xls or .csv).
 * @returns Pallets in first-seen order, each with its accumulated cartons.
 * @throws Rejects with an Error whose message is rendered inline in the
 *         Sidebar: missing required column(s), empty sheet, unreadable file,
 *         or no valid data rows.
 */
export function parseExcel(file: File): Promise<Pallet[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const matchedSheet = workbook.SheetNames.find((n) =>
          n.toUpperCase().includes(TARGET_SHEET.toUpperCase()),
        )
        const sheetName = matchedSheet ?? workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,    // array-of-arrays (row tuples) instead of keyed objects
          defval: '',
          raw: false,   // format every cell to a string so parsing is uniform
        })

        if (rows.length < 2) {
          reject(new Error('Sheet is empty or has no data rows.'))
          return
        }

        const headers = rows[0].map(String)
        const colPallet  = findCol(headers, COL_PALLET)
        const colProduct = findCol(headers, COL_PRODUCT)
        const colQty     = findCol(headers, COL_QTY)
        const colWidth    = findCol(headers, COL_WIDTH)
        const colHeight   = findCol(headers, COL_HEIGHT)
        const colDepth    = findCol(headers, COL_DEPTH)
        const colRotation = findCol(headers, COL_ROTATION)
        const colStacking = findCol(headers, COL_STACKING)

        // Pallet ID is optional: if the column is missing (or a cell is blank)
        // each affected row falls back to its own placeholder pallet below.
        if (colProduct === -1 || colQty === -1) {
          const missing = [
            colProduct === -1 && 'Product Code',
            colQty     === -1 && 'Qty to pick',
          ].filter(Boolean).join(', ')
          reject(new Error(`Missing required column(s): ${missing}`))
          return
        }

        // palletId → Map<productCode, Carton>
        const palletMap = new Map<string, Map<string, Carton>>()

        // Counts rows with no Pallet ID so each gets a unique placeholder name.
        let placeholderCount = 0

        for (let r = 1; r < rows.length; r++) {
          const row = rows[r]
          const rawPalletId = colPallet === -1 ? '' : String(row[colPallet] ?? '').trim()
          const product     = String(row[colProduct] ?? '').trim()
          const qtyRaw      = String(row[colQty]     ?? '').trim()

          if (!product) continue

          const qty = parseInt(qtyRaw, 10)
          if (!Number.isFinite(qty) || qty <= 0) continue

          // A row with no Pallet ID gets its own placeholder pallet (PALLET-A, …).
          const palletId = rawPalletId || `PALLET-${letterLabel(placeholderCount++)}`

          if (!palletMap.has(palletId)) {
            palletMap.set(palletId, new Map())
          }

          const parseDim = (col: number) => {
            if (col === -1) return DEFAULT_DIM_CM
            const v = parseFloat(String(row[col] ?? ''))
            return Number.isFinite(v) && v > 0 ? v : DEFAULT_DIM_CM
          }

          const cartonMap = palletMap.get(palletId)!
          if (cartonMap.has(product)) {
            // Accumulate quantity if same product appears on multiple rows
            const existing = cartonMap.get(product)!
            cartonMap.set(product, { ...existing, quantity: existing.quantity + qty })
          } else {
            const carton: Carton = {
              // id must stay unique across pallets (it keys the cartonId→pallet
              // maps downstream); productCode carries the clean code for display.
              id: `${palletId}-${product}`.replace(/\s+/g, '-'),
              label: product,
              productCode: product,
              w: parseDim(colWidth),
              h: parseDim(colHeight),
              d: parseDim(colDepth),
              quantity: qty,
              rotationAllowed: colRotation === -1 ? true : parseYesNo(String(row[colRotation] ?? '')),
              stacking:        colStacking === -1 ? true : parseYesNo(String(row[colStacking] ?? '')),
            }
            cartonMap.set(product, carton)
          }
        }

        const pallets: Pallet[] = []
        for (const [palletId, cartonMap] of palletMap) {
          pallets.push({
            id: palletId,
            label: palletId,
            cartons: Array.from(cartonMap.values()),
          })
        }

        if (pallets.length === 0) {
          reject(new Error('No valid rows found in the sheet.'))
          return
        }

        resolve(pallets)
      } catch (err) {
        reject(err)
      }
    }

    reader.onerror = () => reject(new Error('Failed to read file.'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * excelImport.ts — parses a pallet/carton manifest from .xlsx, .xls or .csv.
 *
 * Exports: parseExcel.
 * Reads the first sheet only (SheetJS). Required columns (case-insensitive):
 * Pallet ID, Product Code, Qty To Pick. Width/Height/Depth are optional and
 * fall back to DEFAULT_DIM_CM when absent or invalid. Rows with a blank
 * pallet/product or non-positive qty are silently skipped; the same product
 * appearing on multiple rows under one pallet accumulates quantity.
 */
import * as XLSX from 'xlsx'
import type { Pallet } from '@/src/store/palletSlice'
import type { Carton } from '@/src/store/cartonSlice'

// Fallback carton dimension (cm) when a W/H/D column is missing or invalid.
const DEFAULT_DIM_CM = 25

// Column headers we look for (case-insensitive, trims whitespace).
// "to pick" is required in the qty pattern so it never matches "Total Remain Qty".
const COL_PALLET  = /pallet\s*id/i
const COL_PRODUCT = /product\s*(code|name)?/i
const COL_QTY     = /qty\s+to\s+pick/i
const COL_WIDTH   = /^width$/i
const COL_HEIGHT  = /^height$/i
const COL_DEPTH   = /^depth$/i

/** Index of the first header matching `pattern`, or -1 if none matches. */
function findCol(headers: string[], pattern: RegExp): number {
  return headers.findIndex((h) => pattern.test(h.trim()))
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
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
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
        const colWidth   = findCol(headers, COL_WIDTH)
        const colHeight  = findCol(headers, COL_HEIGHT)
        const colDepth   = findCol(headers, COL_DEPTH)

        if (colPallet === -1 || colProduct === -1 || colQty === -1) {
          const missing = [
            colPallet  === -1 && 'Pallet ID',
            colProduct === -1 && 'Product Code',
            colQty     === -1 && 'Qty to pick',
          ].filter(Boolean).join(', ')
          reject(new Error(`Missing required column(s): ${missing}`))
          return
        }

        // palletId → Map<productCode, Carton>
        const palletMap = new Map<string, Map<string, Carton>>()

        for (let r = 1; r < rows.length; r++) {
          const row = rows[r]
          const palletId  = String(row[colPallet]  ?? '').trim()
          const product   = String(row[colProduct] ?? '').trim()
          const qtyRaw    = String(row[colQty]     ?? '').trim()

          if (!palletId || !product) continue

          const qty = parseInt(qtyRaw, 10)
          if (!Number.isFinite(qty) || qty <= 0) continue

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
              id: `${palletId}-${product}`.replace(/\s+/g, '-'),
              label: product,
              w: parseDim(colWidth),
              h: parseDim(colHeight),
              d: parseDim(colDepth),
              quantity: qty,
              rotationAllowed: true,
              stacking: true,
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

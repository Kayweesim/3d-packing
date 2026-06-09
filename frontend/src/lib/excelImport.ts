import * as XLSX from 'xlsx'
import type { Pallet } from '@/src/store/palletSlice'
import type { Carton } from '@/src/store/cartonSlice'

// Column headers we look for (case-insensitive, trims whitespace)
const COL_PALLET  = /pallet\s*id/i
const COL_PRODUCT = /product\s*(code|name)?/i
const COL_QTY     = /qty\s+to\s+pick/i

function findCol(headers: string[], pattern: RegExp): number {
  return headers.findIndex((h) => pattern.test(h.trim()))
}

let _colorCounter = 0

export function parseExcel(file: File): Promise<Pallet[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: '',
          raw: false,
        })

        if (rows.length < 2) {
          reject(new Error('Sheet is empty or has no data rows.'))
          return
        }

        const headers = rows[0].map(String)
        const colPallet  = findCol(headers, COL_PALLET)
        const colProduct = findCol(headers, COL_PRODUCT)
        const colQty     = findCol(headers, COL_QTY)

        if (colPallet === -1 || colProduct === -1 || colQty === -1) {
          const missing = [
            colPallet  === -1 && 'Pallet ID',
            colProduct === -1 && 'Product Code',
            colQty     === -1 && 'Qty to pick',
          ].filter(Boolean).join(', ')
          reject(new Error(`Missing required column(s): ${missing}`))
          return
        }

        // palletId → colorIndex (stable, assigned in first-seen order)
        const palletColorMap = new Map<string, number>()
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

          if (!palletColorMap.has(palletId)) {
            palletColorMap.set(palletId, _colorCounter++)
          }
          if (!palletMap.has(palletId)) {
            palletMap.set(palletId, new Map())
          }

          const cartonMap = palletMap.get(palletId)!
          if (cartonMap.has(product)) {
            // Accumulate quantity if same product appears on multiple rows
            const existing = cartonMap.get(product)!
            cartonMap.set(product, { ...existing, quantity: existing.quantity + qty })
          } else {
            const colorIndex = palletColorMap.get(palletId)!
            const carton: Carton = {
              id: `${palletId}-${product}`.replace(/\s+/g, '-'),
              label: product,

              // IMPT
              // TODO: replace placeholder dims with real carton master data
              w: 25, h: 25, d: 25,
              quantity: qty,
              colorIndex,
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

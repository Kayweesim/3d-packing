/**
 * productMaster.ts — parses a product master Excel into a dimensions lookup map.
 *
 * Exports: ProductMasterMap, parseProductMaster.
 * Maps item/product code → { w, h, d, rotationAllowed, stacking }. Dims are in cm;
 * used by parseExcel to fill in carton dimensions instead of falling back to the
 * 25 cm default. Rotation/Stacking columns are optional Yes/No columns.
 * Accepts a File (user upload) or an ArrayBuffer (fetched default).
 */
import * as XLSX from 'xlsx'

export type ProductMasterMap = Map<
  string,
  { w: number; h: number; d: number; rotationAllowed: boolean; stacking: boolean }
>

const DEFAULT_DIM_CM = 25

const COL_ITEM     = /item\s*(code)?|product\s*(code|name)?|sku/i
const COL_WIDTH    = /width/i
const COL_HEIGHT   = /height/i
const COL_LENGTH   = /length/i
const COL_ROTATION = /rotation/i
const COL_STACKING = /stacking/i

// Rotation/Stacking columns are optional — absent or unrecognized values default
// to true (permissive) so masters without these columns keep working as before.
function parseYesNo(value: string): boolean {
  const v = value.trim().toLowerCase()
  if (v === 'no' || v === 'n') return false
  return true
}

function findCol(headers: string[], pattern: RegExp): number {
  return headers.findIndex((h) => pattern.test(h.trim()))
}

function parseBuffer(buffer: ArrayBuffer): ProductMasterMap {
  const data = new Uint8Array(buffer)
  const workbook = XLSX.read(data, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  })

  if (rows.length < 2) throw new Error('Product master sheet is empty.')

  const headers = rows[0].map(String)
  const colItem     = findCol(headers, COL_ITEM)
  const colWidth    = findCol(headers, COL_WIDTH)
  const colHeight   = findCol(headers, COL_HEIGHT)
  const colLength   = findCol(headers, COL_LENGTH)
  const colRotation = findCol(headers, COL_ROTATION)
  const colStacking = findCol(headers, COL_STACKING)

  if (colItem === -1) throw new Error('Product master is missing an item code column (Item Code / Product Code / SKU).')
  if (colWidth === -1 || colHeight === -1 || colLength === -1) {
    const missing = [
      colWidth  === -1 && 'Width',
      colHeight === -1 && 'Height',
      colLength === -1 && 'Length',
    ].filter(Boolean).join(', ')
    throw new Error(`Product master is missing column(s): ${missing}`)
  }

  const map: ProductMasterMap = new Map()
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const code = String(row[colItem] ?? '').trim()
    if (!code) continue
    const parseDim = (col: number) => {
      const v = parseFloat(String(row[col] ?? ''))
      return Number.isFinite(v) && v > 0 ? v : DEFAULT_DIM_CM
    }
    map.set(code, {
      w: parseDim(colWidth),   // Width  → X axis
      h: parseDim(colHeight),  // Height → Y axis
      d: parseDim(colLength),  // Length → Z axis (depth into container)
      rotationAllowed: colRotation === -1 ? true : parseYesNo(String(row[colRotation] ?? '')),
      stacking: colStacking === -1 ? true : parseYesNo(String(row[colStacking] ?? '')),
    })
  }

  if (map.size === 0) throw new Error('No valid entries found in product master.')
  return map
}

/**
 * Parse a product master file into a code→dims map.
 * @param source A File from a file picker, or an ArrayBuffer from fetch().
 */
export function parseProductMaster(source: File | ArrayBuffer): Promise<ProductMasterMap> {
  if (source instanceof ArrayBuffer) {
    try {
      return Promise.resolve(parseBuffer(source))
    } catch (err) {
      return Promise.reject(err)
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        resolve(parseBuffer(e.target!.result as ArrayBuffer))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read product master file.'))
    reader.readAsArrayBuffer(source)
  })
}

import * as XLSX from 'xlsx'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '../../..', 'Documents/Excel Sheet/3D Packing')

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

function write(filename, rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, path.join(OUT, filename))
  console.log('wrote', filename)
}

// ── 1. Happy path — all columns present, clean data ───────────────────────────
write('01_happy_path.xlsx', [
  ['Pallet ID', 'Product Code', 'Qty To Pick', 'Width', 'Height', 'Depth'],
  ['PLT-001', 'SKU-A', 50,  30, 20, 15],
  ['PLT-001', 'SKU-B', 30,  40, 25, 20],
  ['PLT-002', 'SKU-C', 60,  25, 25, 25],
  ['PLT-002', 'SKU-D', 20,  50, 30, 30],
  ['PLT-003', 'SKU-E', 80,  20, 15, 10],
])

// ── 2. No dimension columns — should fallback all dims to 25 ──────────────────
write('02_no_dimensions.xlsx', [
  ['Pallet ID', 'Product Code', 'Qty To Pick'],
  ['PLT-001', 'SKU-A', 40],
  ['PLT-001', 'SKU-B', 60],
  ['PLT-002', 'SKU-C', 100],
])

// ── 3. Duplicate product rows on same pallet — qty should accumulate ──────────
write('03_duplicate_product_rows.xlsx', [
  ['Pallet ID', 'Product Code', 'Qty To Pick', 'Width', 'Height', 'Depth'],
  ['PLT-001', 'SKU-A', 25, 30, 20, 15],
  ['PLT-001', 'SKU-A', 25, 30, 20, 15],  // same product — total should be 50
  ['PLT-001', 'SKU-A', 10, 30, 20, 15],  // same product — total should be 60
  ['PLT-002', 'SKU-B', 40, 25, 25, 25],
])

// ── 4. Mixed case headers — parser should be case-insensitive ─────────────────
write('04_mixed_case_headers.xlsx', [
  ['PALLET ID', 'PRODUCT CODE', 'QTY TO PICK', 'WIDTH', 'HEIGHT', 'DEPTH'],
  ['PLT-001', 'SKU-A', 50, 30, 20, 15],
  ['PLT-002', 'SKU-B', 80, 40, 30, 20],
])

// ── 5. Zero and invalid qty rows — should be skipped ─────────────────────────
write('05_invalid_qty_rows.xlsx', [
  ['Pallet ID', 'Product Code', 'Qty To Pick', 'Width', 'Height', 'Depth'],
  ['PLT-001', 'SKU-A', 50,   30, 20, 15],
  ['PLT-001', 'SKU-B', 0,    30, 20, 15],  // zero qty — skip
  ['PLT-002', 'SKU-C', -5,   25, 25, 25],  // negative qty — skip
  ['PLT-002', 'SKU-D', 'N/A',25, 25, 25],  // non-numeric — skip
  ['PLT-002', 'SKU-E', 30,   25, 25, 25],  // valid
])

// ── 6. Empty rows in the middle — should be skipped gracefully ────────────────
write('06_empty_rows.xlsx', [
  ['Pallet ID', 'Product Code', 'Qty To Pick', 'Width', 'Height', 'Depth'],
  ['PLT-001', 'SKU-A', 50, 30, 20, 15],
  ['', '', '', '', '', ''],                 // blank row — skip
  ['PLT-002', 'SKU-B', 40, 25, 25, 25],
  ['', '', '', '', '', ''],
  ['PLT-003', 'SKU-C', 70, 20, 15, 10],
])

// ── 7. Invalid dimension values — fallback to 25 per bad dim ─────────────────
write('07_invalid_dimensions.xlsx', [
  ['Pallet ID', 'Product Code', 'Qty To Pick', 'Width', 'Height', 'Depth'],
  ['PLT-001', 'SKU-A', 50, 'N/A', 20,    15],    // bad width → 25
  ['PLT-001', 'SKU-B', 30, 30,    0,     15],    // zero height → 25
  ['PLT-002', 'SKU-C', 60, 25,    25,    -10],   // negative depth → 25
  ['PLT-002', 'SKU-D', 20, 40,    30,    'TBD'], // string depth → 25
])

// ── 8. Extra irrelevant columns — parser should ignore them ───────────────────
write('08_extra_columns.xlsx', [
  ['Batch No', 'Pallet ID', 'Location', 'Product Code', 'Description', 'Qty To Pick', 'Width', 'Height', 'Depth', 'Expiry Date'],
  ['B001', 'PLT-001', 'A01', 'SKU-A', 'Some product',  50, 30, 20, 15, '2027-01-01'],
  ['B001', 'PLT-001', 'A02', 'SKU-B', 'Another product',30, 40, 25, 20, '2027-06-01'],
  ['B002', 'PLT-002', 'B01', 'SKU-C', 'Third product',  60, 25, 25, 25, '2026-12-31'],
])

// ── 9. Single pallet, single product (minimal) ───────────────────────────────
write('09_single_pallet.xlsx', [
  ['Pallet ID', 'Product Code', 'Qty To Pick'],
  ['PLT-001', 'SKU-A', 1],
])

// ── 10. Large dataset — many pallets to stress the panel scroll ───────────────
const largeRows = [['Pallet ID', 'Product Code', 'Qty To Pick', 'Width', 'Height', 'Depth']]
for (let i = 1; i <= 30; i++) {
  const pid = `PLT-${String(i).padStart(3, '0')}`
  largeRows.push([pid, `SKU-${i}`, 10 + (i % 20), 20 + (i % 15), 15 + (i % 10), 10 + (i % 12)])
}
write('10_large_dataset_30_pallets.xlsx', largeRows)

/**
 * loadSlicesExport.ts — "load slices" export: a self-contained HTML document
 * with inline SVG cross-sections, one per depth slice (akin to a vessel bay
 * plan, but for variable-size cartons rather than a fixed TEU lattice).
 *
 * Exports: exportLoadSlices.
 * The container is sliced along its depth (Z) into slices; each slice is a
 * to-scale front elevation (X across, Y up) of the cartons whose back face sits
 * in that slice. Cartons have arbitrary W/H, so each is drawn as a true-scale
 * rectangle.
 *
 * Slices are derived from the load's natural z-layers (the packer fills depth-
 * first, so cartons cluster at discrete back-face planes). Each carton is
 * assigned to exactly one slice (the one containing its back face), so the plan
 * reconciles 1:1 with the Seq # list; depth is conveyed via the slice's z-range
 * header and a per-carton hover tooltip (a front view can't show depth).
 *
 * All data comes from the store — no backend involved. Like excelExport, pallet
 * labels/colors are read from the CURRENT pallets store.
 */
import type { Pallet } from '../store/palletSlice'
import type { Container } from '../store/containerSlice'
import type { Placement, PackingResult } from '../store/packingSlice'
import { getCartonColor } from './colors'

// Rendering constants.
const SCALE = 1.6          // px per cm
const PAD = 12             // svg padding around the cross-section (px)
const SLICE_Z_TOL = 1.0    // cm — cartons within this back-face gap share a slice
const MIN_LABEL_W = 20     // px — only draw the Seq # if the rect is at least this wide
const MIN_LABEL_H = 14     // px — ...and this tall

interface Slice {
  zStart: number
  zEnd: number
  items: Placement[]
}

/** Minimal HTML/XML entity escaping for text injected into the document. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Cluster a container's placements into slices by back-face Z.
 * Cartons are sorted by z; a new slice starts whenever z exceeds the current
 * slice's start by more than SLICE_Z_TOL (the packer places same-layer cartons
 * at an identical z, while a new layer jumps by at least one carton depth).
 */
function buildSlices(placements: Placement[]): Slice[] {
  const sorted = [...placements].sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y)
  const slices: Slice[] = []
  for (const p of sorted) {
    let slice = slices[slices.length - 1]
    if (!slice || p.z > slice.zStart + SLICE_Z_TOL) {
      slice = { zStart: p.z, zEnd: p.z, items: [] }
      slices.push(slice)
    }
    slice.items.push(p)
    if (p.z + p.d > slice.zEnd) slice.zEnd = p.z + p.d
  }
  return slices
}

/** Render one slice as an inline SVG front elevation (X across, Y up). */
function renderSliceSvg(
  slice: Slice,
  containerW: number,
  containerH: number,
  seqOf: Map<Placement, number>,
  palletOf: Map<string, number>,
  labelOf: Map<string, string>,
): string {
  const w = containerW * SCALE + PAD * 2
  const h = containerH * SCALE + PAD * 2

  const parts: string[] = []
  // Container cross-section outline.
  parts.push(
    `<rect x="${PAD}" y="${PAD}" width="${containerW * SCALE}" height="${containerH * SCALE}" ` +
    `fill="#f8fafc" stroke="#475569" stroke-width="1.5"/>`,
  )

  for (const p of slice.items) {
    const palletIdx = palletOf.get(p.cartonId) ?? 0
    const color = getCartonColor(palletIdx)
    const product = labelOf.get(p.cartonId) ?? p.cartonId
    const seq = seqOf.get(p) ?? 0

    // X grows right from the left wall; Y is flipped (SVG y grows downward).
    const rx = PAD + p.x * SCALE
    const ry = PAD + (containerH - (p.y + p.h)) * SCALE
    const rw = p.w * SCALE
    const rh = p.h * SCALE

    const tip =
      `Seq ${seq} · ${esc(product)} · ${Math.round(p.w)}×${Math.round(p.h)}×${Math.round(p.d)} cm` +
      ` · z ${Math.round(p.z)}–${Math.round(p.z + p.d)}`
    parts.push(
      `<g><title>${tip}</title>` +
      `<rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" ` +
      `fill="${color}" fill-opacity="0.55" stroke="${color}" stroke-width="1"/>` +
      (rw >= MIN_LABEL_W && rh >= MIN_LABEL_H
        ? `<text x="${(rx + rw / 2).toFixed(1)}" y="${(ry + rh / 2).toFixed(1)}" ` +
          `text-anchor="middle" dominant-baseline="central" font-size="11" fill="#0f172a">${seq}</text>`
        : '') +
      `</g>`,
    )
  }

  return `<svg width="${w.toFixed(0)}" height="${h.toFixed(0)}" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" ` +
    `xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
}

/**
 * Build and download a load-slices HTML document (load-slices-YYYY-MM-DD.html).
 * One section per container; within it one captioned SVG per slice, ordered
 * back wall (z=0) → door.
 */
export function exportLoadSlices(
  packingResult: PackingResult[],
  pallets: Pallet[],
  containers: Container[],
): void {
  // cartonId → palletIndex (for colour) and product label.
  const palletOf = new Map<string, number>()
  const labelOf = new Map<string, string>()
  pallets.forEach((pallet, i) =>
    pallet.cartons.forEach((c) => {
      palletOf.set(c.id, i)
      labelOf.set(c.id, c.label)
    }),
  )

  // Global Seq # in load order (matches the 3D scene and the Excel export):
  // walk containers then placements in their stored order, keyed by identity.
  const seqOf = new Map<Placement, number>()
  let seq = 1
  for (const result of packingResult) {
    for (const p of result.placements) seqOf.set(p, seq++)
  }

  const containerById = new Map(containers.map((c) => [c.id, c]))

  // Legend: only pallets that actually appear, in palletIndex order.
  const usedPallets = [...new Set(
    packingResult.flatMap((r) => r.placements.map((p) => palletOf.get(p.cartonId) ?? 0)),
  )].sort((a, b) => a - b)
  const legend = usedPallets
    .map((i) =>
      `<span class="chip"><span class="sw" style="background:${getCartonColor(i)}"></span>` +
      `${esc(pallets[i]?.label ?? `Pallet ${i + 1}`)}</span>`,
    )
    .join('')

  const sections = packingResult.map((result, idx) => {
    const container = containerById.get(result.containerId)
    const cw = container?.w ?? Math.max(...result.placements.map((p) => p.x + p.w), 1)
    const ch = container?.h ?? Math.max(...result.placements.map((p) => p.y + p.h), 1)
    const label = container?.label ?? result.containerId

    if (result.placements.length === 0) {
      return `<section class="container"><h2>${idx + 1} · ${esc(label)} — empty</h2></section>`
    }

    const slices = buildSlices(result.placements)
    const slicesHtml = slices
      .map((slice, si) => {
        const caption =
          `Slice ${si + 1} · z ${Math.round(slice.zStart)}–${Math.round(slice.zEnd)} cm · ` +
          `${slice.items.length} carton${slice.items.length === 1 ? '' : 's'}`
        return `<figure class="slice"><figcaption>${caption}</figcaption>` +
          renderSliceSvg(slice, cw, ch, seqOf, palletOf, labelOf) + `</figure>`
      })
      .join('')

    const util = Math.round(result.utilization * 1000) / 10
    return `<section class="container">` +
      `<h2>${idx + 1} · ${esc(label)} <small>${result.placements.length} cartons · ${util}% util · ` +
      `viewed from door → back wall</small></h2>` +
      `<div class="slices">${slicesHtml}</div></section>`
  }).join('')

  const date = new Date().toISOString().slice(0, 10)
  const html =
`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Load Slices ${date}</title>
<style>
  body { font-family: system-ui, sans-serif; color: #0f172a; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #64748b; font-size: 13px; margin-bottom: 16px; }
  .legend { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
  .sw { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
  .container { margin-bottom: 28px; }
  h2 { font-size: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  h2 small { font-weight: 400; color: #64748b; font-size: 12px; }
  .slices { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
  .slice { margin: 0; }
  figcaption { font-size: 11px; color: #475569; margin-bottom: 4px; }
  @media print { .container { page-break-inside: avoid; } }
</style></head>
<body>
  <h1>Load Slices</h1>
  <div class="meta">${date} · ${packingResult.length} container${packingResult.length === 1 ? '' : 's'} · hover a carton for its dimensions &amp; depth</div>
  <div class="legend">${legend}</div>
  ${sections}
</body></html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `load-slices-${date}.html`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

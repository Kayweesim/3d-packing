/**
 * cartonShapes.ts — shared Three.js geometry and color helpers for carton rendering.
 *
 * Exports: buildArrowGeo, lightenColor.
 * Both helpers are used by CartonPreview (dialog mini-canvas) and InstancedCartons
 * (main scene) — extracted here to avoid duplicating the implementations.
 */
import * as THREE from 'three'

/**
 * Upward-pointing arrow ShapeGeometry scaled to a carton's front face.
 * The shape sits in the XY plane (faces +Z naturally) — callers position it on
 * the front face of the carton. Caller is responsible for disposing the geometry.
 * @param w Carton width (cm) — one axis of the front face.
 * @param h Carton height (cm) — the other axis; arrow scale = min(w,h) × 0.22.
 * @returns ShapeGeometry ready to attach to a mesh.
 */
export function buildArrowGeo(w: number, h: number): THREE.ShapeGeometry {
  const s = Math.min(w, h) * 0.22
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.5)
  shape.lineTo(-0.3, 0.1)
  shape.lineTo(-0.12, 0.1)
  shape.lineTo(-0.12, -0.5)
  shape.lineTo(0.12, -0.5)
  shape.lineTo(0.12, 0.1)
  shape.lineTo(0.3, 0.1)
  shape.closePath()
  const geo = new THREE.ShapeGeometry(shape)
  geo.scale(s, s, 1)
  return geo
}

/**
 * Lerp a hex color toward white by `amount`.
 * Used for the top-face rotation indicator in both the preview and the main scene.
 * @param hex   Base color as a CSS hex string (e.g. '#e74c3c').
 * @param amount Lerp factor: 0 = original, 1 = pure white (default 0.45).
 * @returns Lightened hex string.
 */
export function lightenColor(hex: string, amount = 0.45): string {
  const c = new THREE.Color(hex).lerp(new THREE.Color(1, 1, 1), amount)
  return `#${c.getHexString()}`
}

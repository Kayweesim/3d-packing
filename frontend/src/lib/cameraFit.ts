/**
 * cameraFit.ts — shared perspective-camera framing math.
 *
 * Exports: CAMERA_FOV_DEG, CAM_HEIGHT_FACTOR, fitDistance.
 * Extracted from Canvas.tsx so both the container CameraController and the
 * pallet-mode camera controller frame their scenes with identical math (no
 * behaviour change to the container path). Pure — no Three.js / React imports.
 */

export const CAMERA_FOV_DEG    = 50   // must match the perspective math in fitDistance
export const CAM_HEIGHT_FACTOR = 1.2  // camera height as a multiple of scene height

/**
 * Camera distance that frames a (spanW × spanH) cross-section with breathing
 * room (×1.8), never closer than 0.6× the scene depth.
 * Width is fitted against the HORIZONTAL fov, which shrinks with the viewport
 * aspect ratio — on a portrait phone it is far narrower than the vertical fov,
 * so fitting by vertical fov alone would cut the scene off sideways.
 */
export function fitDistance(spanW: number, spanH: number, depth: number, aspect: number): number {
  const vFovRad = CAMERA_FOV_DEG * (Math.PI / 180)
  const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * Math.max(aspect, 0.1))
  const distForWidth  = (spanW / 2) / Math.tan(hFovRad / 2)
  const distForHeight = (spanH / 2) / Math.tan(vFovRad / 2)
  return Math.max(distForWidth, distForHeight, depth * 0.6) * 1.8
}

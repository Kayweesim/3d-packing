/**
 * PalletCameraController.tsx — fits all pallets in view (pallet mode).
 *
 * Exports: PalletCameraController.
 * Mounted only in pallet mode, so the container CameraController (Canvas.tsx)
 * stays untouched. Instant fit-all whenever the pallet result or canvas size
 * changes — no click-to-focus behaviour (pallets aren't individually selectable).
 */
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useStore } from '@/src/store'
import { fitDistance, CAM_HEIGHT_FACTOR } from '@/src/lib/cameraFit'
import { buildPalletWorldMap, PALLET_GAP_CM } from './PalletManager'

/** Headless component: frames the full row of pallets. */
export function PalletCameraController() {
  const result = useStore((s) => s.palletPackResult)
  const { camera, controls, size } = useThree()
  const aspect = size.width / Math.max(size.height, 1)

  useEffect(() => {
    if (!result || result.palletsNeeded <= 0) return

    const { Wp, Dp, deckH, maxHeight } = result.pallet
    const n = result.palletsNeeded
    const worldXs = buildPalletWorldMap(n, Wp)

    const totalWidth = n * Wp + (n - 1) * PALLET_GAP_CM
    const totalH     = deckH + maxHeight
    const cx = (worldXs[0] + worldXs[n - 1] + Wp) / 2  // centre of the pallet row

    const dist = fitDistance(totalWidth, totalH, Dp, aspect)
    camera.position.set(cx, totalH * CAM_HEIGHT_FACTOR, Dp + dist)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (controls && 'target' in controls && 'update' in controls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(controls as any).target.set(cx, totalH / 3, Dp / 2)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(controls as any).update()
    }
  }, [result, camera, controls, aspect])

  return null
}

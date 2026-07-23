/**
 * PalletCameraController.tsx — frames the pallet scene (pallet mode).
 *
 * Exports: PalletCameraController.
 * Mounted only in pallet mode, so the container CameraController (Canvas.tsx)
 * stays untouched. Fits all pallets by default; when a pallet is selected in the
 * sidebar list it GSAP-zooms onto that one. New packs / resizes reframe instantly;
 * only an explicit selection change animates.
 */
import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { useStore } from '@/src/store'
import { fitDistance, CAM_HEIGHT_FACTOR } from '@/src/lib/cameraFit'
import { buildPalletWorldMap, PALLET_GAP_CM } from './PalletManager'

const FOCUS_TWEEN_S = 0.8

/** Headless component: frames all pallets, or zooms to the selected one. */
export function PalletCameraController() {
  const result              = useStore((s) => s.palletPackResult)
  const selectedPalletIndex = useStore((s) => s.selectedPalletIndex)
  const { camera, controls, size } = useThree()
  const aspect = size.width / Math.max(size.height, 1)

  const prevResult = useRef(result)
  const prevSel    = useRef<number | null | undefined>(undefined)

  useEffect(() => {
    if (!result || result.palletsNeeded <= 0) return

    const { Wp, Dp, deckH, maxHeight } = result.pallet
    const n = result.palletsNeeded
    const worldXs = buildPalletWorldMap(n, Wp)
    const totalH  = deckH + maxHeight

    // Framing region: a single selected pallet, else the whole row.
    let cx: number
    let spanW: number
    if (selectedPalletIndex != null && selectedPalletIndex < n) {
      cx = worldXs[selectedPalletIndex] + Wp / 2
      spanW = Wp
    } else {
      spanW = n * Wp + (n - 1) * PALLET_GAP_CM             
      cx = spanW / 2
    }

    const dist   = fitDistance(spanW, totalH, Dp, aspect)
    const camPos = { x: cx, y: totalH * CAM_HEIGHT_FACTOR, z: Dp + dist }
    const target = { x: cx, y: totalH / 3, z: Dp / 2 }

    // Animate only on an explicit selection change — not on first mount, a new
    // pack (which resets selection), or a resize.
    const firstRun       = prevSel.current === undefined
    const resultChanged  = prevResult.current !== result
    const selectionMoved = prevSel.current !== selectedPalletIndex
    prevResult.current = result
    prevSel.current    = selectedPalletIndex
    const animate = selectionMoved && !resultChanged && !firstRun

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctrl = controls as any

    if (animate) {
      gsap.killTweensOf(camera.position)
      gsap.to(camera.position, {
        ...camPos, duration: FOCUS_TWEEN_S, ease: 'power2.inOut',
        onUpdate: () => { if (ctrl && 'update' in ctrl) ctrl.update() },
      })
      if (ctrl && 'target' in ctrl) {
        gsap.killTweensOf(ctrl.target)
        gsap.to(ctrl.target, { ...target, duration: FOCUS_TWEEN_S, ease: 'power2.inOut' })
      }
    } else {
      camera.position.set(camPos.x, camPos.y, camPos.z)
      if (ctrl && 'target' in ctrl && 'update' in ctrl) {
        ctrl.target.set(target.x, target.y, target.z)
        ctrl.update()
      }
    }
  }, [result, selectedPalletIndex, aspect, camera, controls])

  return null
}

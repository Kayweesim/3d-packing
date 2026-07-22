/**
 * PalletMesh.tsx — a wooden block pallet rendered from individual planks
 * (spaced top deck boards + bottom boards + stringer beams) plus a faint
 * wireframe load-height guide box. Pallet-mode sibling of ContainerMesh.
 *
 * Exports: PalletMesh.
 * Geometry only — cartons render separately in PalletInstancedCartons. Goods rest
 * on top of the deck (y ≥ deckH); the guide box marks the maxHeight cap. The gaps
 * between boards read as the plank lines of a real pallet.
 */
import { useEffect, useMemo } from 'react'
import { BoxGeometry, EdgesGeometry } from 'three'

interface PalletMeshProps {
  worldX: number      // left edge of this pallet in world space (cm)
  Wp: number          // footprint width  — X axis (cm)
  Dp: number          // footprint depth  — Z axis (cm)
  deckH: number       // deck thickness (cm) — goods stack above this
  maxHeight: number   // load-height cap above the deck (cm)
}

const WOOD_TOP    = '#a6743d'  // top deck boards (lit face)
const WOOD_BOARD  = '#966636'  // bottom boards
const WOOD_BEAM   = '#7c5230'  // stringer beams (darker for depth)
const GUIDE_COLOR = '#6b7280'

const TOP_BOARDS    = 7     // deck planks running across the width, spaced along depth
const BOTTOM_BOARDS = 3     // fewer boards underneath
const STRINGERS     = 3     // beams running the full depth (left/centre/right)
const BOARD_FILL    = 0.72  // board depth as a fraction of its pitch → 28% gaps

/** Evenly spaced plank centres along an axis of length `len` for `n` boards. */
function plankCentres(len: number, n: number): { c: number; size: number }[] {
  const pitch = len / n
  const size  = pitch * BOARD_FILL
  return Array.from({ length: n }, (_, i) => ({ c: pitch * (i + 0.5), size }))
}

/** Wooden block pallet built from planks, with a wireframe max-height guide. */
export function PalletMesh({ worldX, Wp, Dp, deckH, maxHeight }: PalletMeshProps) {
  const cx = worldX + Wp / 2
  const cz = Dp / 2

  // Deck split vertically: top boards (top ~28%), stringer beams (middle),
  // bottom boards (bottom ~18%).
  const topH    = deckH * 0.28
  const bottomH = deckH * 0.18
  const midH    = deckH - topH - bottomH
  const beamW   = Wp * 0.1

  const topZ    = useMemo(() => plankCentres(Dp, TOP_BOARDS), [Dp])
  const bottomZ = useMemo(() => plankCentres(Dp, BOTTOM_BOARDS), [Dp])
  // Stringer beam centres across the width (left edge → right edge).
  const beamX   = useMemo(
    () => Array.from({ length: STRINGERS }, (_, i) => {
      const t = i / (STRINGERS - 1)
      return worldX + beamW / 2 + t * (Wp - beamW)
    }),
    [worldX, Wp, beamW],
  )

  const guideEdges = useMemo(() => {
    const box = new BoxGeometry(Wp, maxHeight, Dp)
    const geo = new EdgesGeometry(box)
    box.dispose()
    return geo
  }, [Wp, maxHeight, Dp])

  useEffect(() => () => guideEdges.dispose(), [guideEdges])

  return (
    <>
      {/* Top deck planks — span full width, spaced along depth (the "lines"). */}
      {topZ.map(({ c, size }, i) => (
        <mesh key={`t${i}`} position={[cx, deckH - topH / 2, c]}>
          <boxGeometry args={[Wp, topH, size]} />
          <meshStandardMaterial color={WOOD_TOP} roughness={0.85} />
        </mesh>
      ))}

      {/* Stringer beams — run the full depth, under the top deck. */}
      {beamX.map((bx, i) => (
        <mesh key={`s${i}`} position={[bx, bottomH + midH / 2, cz]}>
          <boxGeometry args={[beamW, midH, Dp]} />
          <meshStandardMaterial color={WOOD_BEAM} roughness={0.9} />
        </mesh>
      ))}

      {/* Bottom deck planks. */}
      {bottomZ.map(({ c, size }, i) => (
        <mesh key={`b${i}`} position={[cx, bottomH / 2, c]}>
          <boxGeometry args={[Wp, bottomH, size]} />
          <meshStandardMaterial color={WOOD_BOARD} roughness={0.9} />
        </mesh>
      ))}

      {/* Load-height guide — sits on top of the deck. */}
      <lineSegments geometry={guideEdges} position={[cx, deckH + maxHeight / 2, cz]}>
        <lineBasicMaterial color={GUIDE_COLOR} opacity={0.4} transparent />
      </lineSegments>
    </>
  )
}

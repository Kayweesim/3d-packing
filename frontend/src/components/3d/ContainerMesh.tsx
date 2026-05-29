import { useEffect, useMemo } from 'react'
import { BoxGeometry, EdgesGeometry } from 'three'
import type { Container } from '@/src/store'

interface ContainerMeshProps {
  container: Container
  worldX: number
}


// Curly braces to destructure so you don't have to call props.container and props.worldX
export function ContainerMesh({ container, worldX }: ContainerMeshProps) {
  const { w, h, d } = container
  // w = container length (589/1203cm) — goes along Z axis (depth into scene, door at +Z)
  // d = container cross-section width (235cm) — goes along X axis
  // h = container height (239cm) — goes along Y axis

  const edges = useMemo(() => {
    const box = new BoxGeometry(d, h, w)  // X=cross-section width, Y=height, Z=length
    const geo = new EdgesGeometry(box)
    box.dispose()
    return geo
  }, [w, h, d])

  useEffect(() => () => edges.dispose(), [edges])

  // Center the mesh so the left face is at worldX in X, floor at Y=0, and length is centered on Z=0
  return (
    <lineSegments geometry={edges} position={[worldX + d / 2, h / 2, 0]}>
      <lineBasicMaterial color="#4b5563" />
    </lineSegments>
  )
}

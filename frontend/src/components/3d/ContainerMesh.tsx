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

  // EdgesGeometry gives 12 clean edges — no triangle diagonals from wireframe material
  const edges = useMemo(() => {
    const box = new BoxGeometry(w, h, d)
    const geo = new EdgesGeometry(box)
    box.dispose()
    return geo
  }, [w, h, d])

  useEffect(() => () => edges.dispose(), [edges])

  // BoxGeometry is centered at origin; offset so bottom-left-front corner is at (worldX, 0, 0)
  return (
    <lineSegments geometry={edges} position={[worldX + w / 2, h / 2, 0]}>
      <lineBasicMaterial color="#4b5563" />
    </lineSegments>
  )
}

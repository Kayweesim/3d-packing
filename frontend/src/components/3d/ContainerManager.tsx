import { useMemo } from 'react'
import { useStore } from '@/src/store'
import { ContainerMesh } from './ContainerMesh'

export const CONTAINER_GAP_CM = 100

export function ContainerManager() {
  const containers = useStore((s) => s.containers)

  // Compute the left-edge X offset for each container, laid out side-by-side
  const worldPositions = useMemo(() => {
    let x = 0
    return containers.map((c) => {
      const pos = x
      // c.w is the X span (cross-section width = 235cm); containers placed side by side in X
      x += c.w + CONTAINER_GAP_CM
      return pos
    })
  }, [containers])

  return (
    <>
      {containers.map((container, i) => (
        <ContainerMesh
          key={container.id}
          container={container}
          worldX={worldPositions[i]}
        />
      ))}
    </>
  )
}

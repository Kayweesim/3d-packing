import { useMemo } from 'react'
import { useStore } from '@/src/store'
import { ContainerMesh } from './ContainerMesh'
import type { Container } from '@/src/store/containerSlice'

export const CONTAINER_GAP_CM = 100

// Returns a map of containerId → left-edge worldX, shared by ContainerManager and InstancedCartons.
export function buildContainerWorldMap(containers: Container[]): Map<string, { worldX: number; containerLength: number }> {
  let x = 0
  const map = new Map<string, { worldX: number; containerLength: number }>()
  for (const c of containers) {
    map.set(c.id, { worldX: x, containerLength: c.d })
    x += c.w + CONTAINER_GAP_CM
  }
  return map
}

export function ContainerManager() {
  const containers = useStore((s) => s.containers)

  const containerMap = useMemo(() => buildContainerWorldMap(containers), [containers])

  return (
    <>
      {containers.map((container) => (
        <ContainerMesh
          key={container.id}
          container={container}
          worldX={containerMap.get(container.id)!.worldX}
        />
      ))}
    </>
  )
}

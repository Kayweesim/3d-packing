/**
 * ContainerManager.tsx — lays containers out side-by-side along world X.
 *
 * Exports: CONTAINER_GAP_CM, buildContainerWorldMap, ContainerManager.
 * buildContainerWorldMap is the layout authority shared with InstancedCartons;
 * CameraController (Canvas.tsx) mirrors the same math for its focus targets.
 */
import { useMemo } from 'react'
import { useStore } from '@/src/store'
import { ContainerMesh } from './ContainerMesh'
import type { Container } from '@/src/store/containerSlice'

// Gap between adjacent containers (cm).
export const CONTAINER_GAP_CM = 100

/**
 * Map of containerId → { worldX, containerLength } with containers packed
 * left-to-right in list order, CONTAINER_GAP_CM apart.
 * @param containers Containers in optimizer order.
 * @returns worldX is each container's left edge; containerLength is its d
 *          (used by the carton entry animation).
 */
export function buildContainerWorldMap(containers: Container[]): Map<string, { worldX: number; containerLength: number }> {
  let x = 0
  const map = new Map<string, { worldX: number; containerLength: number }>()
  for (const c of containers) {
    map.set(c.id, { worldX: x, containerLength: c.d })
    x += c.w + CONTAINER_GAP_CM
  }
  return map
}

/** Renders one ContainerMesh per optimizer-selected container. */
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

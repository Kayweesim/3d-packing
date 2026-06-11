/**
 * ContainerMesh.tsx — wireframe container shell + two open door panels.
 *
 * Exports: ContainerMesh.
 * Pure geometry (EdgesGeometry line segments) — cartons render separately in
 * InstancedCartons. Geometries are disposed on unmount and on dim changes.
 */
import { useEffect, useMemo } from 'react'
import { BoxGeometry, EdgesGeometry, PlaneGeometry } from 'three'
import type { Container } from '@/src/store'

interface ContainerMeshProps {
  container: Container
  worldX: number  // left edge of this container in world space (cm)
}

const DOOR_AJAR = (75 * Math.PI) / 180  // 75 degrees open — clear view into container
const BODY_EDGE_COLOR = '#4b5563'
const DOOR_EDGE_COLOR = '#6b7280'

/** Transparent wireframe box with both door panels swung DOOR_AJAR outward. */
export function ContainerMesh({ container, worldX }: ContainerMeshProps) {
  const { w, h, d } = container
  // w = cross-section width — X axis
  // h = height             — Y axis
  // d = length/depth       — Z axis (back wall = 0, door = d)

  const edges = useMemo(() => {
    const box = new BoxGeometry(w, h, d)
    const geo = new EdgesGeometry(box)
    box.dispose()
    return geo
  }, [w, h, d])

  // Each door panel is half the container width wide and full height.
  // Same geometry for both panels (they're symmetric).
  const doorPanelEdges = useMemo(() => {
    const plane = new PlaneGeometry(w / 2, h)
    const geo = new EdgesGeometry(plane)
    plane.dispose()
    return geo
  }, [w, h])

  useEffect(() => () => { edges.dispose(); doorPanelEdges.dispose() }, [edges, doorPanelEdges])

  return (
    <>
      {/* Container wireframe body */}
      <lineSegments geometry={edges} position={[worldX + w / 2, h / 2, d / 2]}>
        <lineBasicMaterial color={BODY_EDGE_COLOR} />
      </lineSegments>

      {/* Left door panel — hinges on the left edge (worldX), swings outward (+Y rotation) */}
      <group position={[worldX, h / 2, d]} rotation={[0, -DOOR_AJAR, 0]}>
        <lineSegments geometry={doorPanelEdges} position={[w / 4, 0, 0]}>
          <lineBasicMaterial color={DOOR_EDGE_COLOR} />
        </lineSegments>
      </group>

      {/* Right door panel — hinges on the right edge (worldX + w), swings outward (-Y rotation) */}
      <group position={[worldX + w, h / 2, d]} rotation={[0, DOOR_AJAR, 0]}>
        <lineSegments geometry={doorPanelEdges} position={[-w / 4, 0, 0]}>
          <lineBasicMaterial color={DOOR_EDGE_COLOR} />
        </lineSegments>
      </group>
    </>
  )
}

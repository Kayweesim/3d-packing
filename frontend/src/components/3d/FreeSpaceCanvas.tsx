/**
 * FreeSpaceCanvas.tsx — mini R3F canvas for the guillotine step visualizer.
 *
 * Renders one trace step: the active container wireframe, every carton placed
 * in that container up to the current step (pallet-colored, the current one
 * highlighted), the free spaces at that step (faint wireframes), and the
 * Front/Right/Above sub-spaces the latest cut produced (colored + labeled).
 *
 * When the trace spans multiple containers, only the container that owns the
 * current step is shown. Backend coords (x,y,z from back-bottom-left corner)
 * are centered on the origin for viewing.
 */
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Edges, Text } from '@react-three/drei'
import { getCartonColor } from '@/src/lib/colors'
import type { TraceStep, TraceCuboid, TraceContainerDims } from '@/src/lib/api'

interface Props {
  containers: TraceContainerDims[]
  steps: TraceStep[]
  step: number
}

const SPACE_COLOR: Record<string, string> = {
  Front: '#3b82f6', // blue
  Right: '#22c55e', // green
  Above: '#f59e0b', // amber
}

/** World-space center of a backend cuboid, with the container centered on origin. */
function center(c: TraceCuboid, C: TraceContainerDims): [number, number, number] {
  return [c.x + c.w / 2 - C.w / 2, c.y + c.h / 2 - C.h / 2, c.z + c.d / 2 - C.d / 2]
}

function Box({
  c, C, color, fill, edgeColor, label,
}: {
  c: TraceCuboid; C: TraceContainerDims; color: string; fill: number; edgeColor: string; label?: string
}) {
  const labelSize = Math.max(c.w, c.h, c.d) * 0.22
  return (
    <group position={center(c, C)}>
      <mesh>
        <boxGeometry args={[c.w, c.h, c.d]} />
        <meshStandardMaterial color={color} transparent opacity={fill} depthWrite={fill > 0.5} />
        <Edges color={edgeColor} />
      </mesh>
      {label && (
        <Text
          fontSize={labelSize}
          color={edgeColor}
          anchorX="center"
          anchorY="middle"
          outlineWidth={labelSize * 0.06}
          outlineColor="#000000"
        >
          {label}
        </Text>
      )}
    </group>
  )
}

function Scene({ containers, steps, step }: Props) {
  const current = steps[step]
  const activeId = current?.containerId ?? containers[0]?.id
  const activeContainer = containers.find((c) => c.id === activeId) ?? containers[0]

  if (!activeContainer) return null

  // Only show steps that belong to the active container.
  const containerSteps = steps.filter((s) => s.containerId === activeId)
  const localIdx = containerSteps.findIndex((s) => s.step === current?.step)
  const placed = localIdx >= 0 ? containerSteps.slice(0, localIdx + 1) : []

  return (
    <>
      {/* Camera Orbit Controls and Lighting */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[500, 800, 500]} intensity={0.8} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.35}
        rotateSpeed={0.6}
        zoomSpeed={0.7}
        maxPolarAngle={Math.PI / 2}
        minPolarAngle={Math.PI / 8}
      />


      {/* container wireframe */}
      <Box
        c={{ x: 0, y: 0, z: 0, ...activeContainer }}
        C={activeContainer}
        color="#000"
        fill={0}
        edgeColor="#ffffff"
      />

      {/* placed cartons (current one highlighted with white edges) */}
      {placed.map((s, i) => (
        <Box
          key={`p${s.step}`}
          c={s.placed}
          C={activeContainer}
          color={getCartonColor(s.colorIndex)}
          fill={0.9}
          edgeColor={i === placed.length - 1 ? '#ffffff' : '#00000055'}
        />
      ))}

      {/* free spaces at this step (faint) */}
      {current?.spaces.map((sp, i) => (
        <Box key={`s${i}`} c={sp} C={activeContainer} color="#cccccc" fill={0.05} edgeColor="#888888" />
      ))}

      {/* the latest cut's sub-spaces, colored + labeled */}
      {current?.newSpaces.map((ns, i) => (
        <Box
          key={`n${i}`}
          c={ns}
          C={activeContainer}
          color={SPACE_COLOR[ns.kind]}
          fill={0.18}
          edgeColor={SPACE_COLOR[ns.kind]}
          label={ns.kind}
        />
      ))}
    </>
  )
}

export function FreeSpaceCanvas({ containers, steps, step }: Props) {
  const activeId = steps[step]?.containerId ?? containers[0]?.id
  const activeContainer = containers.find((c) => c.id === activeId) ?? containers[0]
  const dist = (activeContainer?.d ?? 589) * 1.15
  return (
    <Canvas
      style={{ width: '100%', height: '100%' }}
      camera={{ fov: 50, near: 1, far: 100000, position: [dist * 0.8, dist * 0.55, dist] }}
      gl={{ antialias: true }}
    >
      <Scene containers={containers} steps={steps} step={step} />
    </Canvas>
  )
}

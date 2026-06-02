import type { Container } from '@/src/store'

// Standard shipping container presets. Dimensions in cm.
// w = cross-section width (X axis, 235cm), h = height (Y axis, 239cm), d = length/depth (Z axis)
export const CONTAINER_PRESETS: Omit<Container, 'id'>[] = [
  { label: '20ft TEU', w: 235, h: 239, d: 589 },
  { label: '40ft FEU', w: 235, h: 239, d: 1203 },
]

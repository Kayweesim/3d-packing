import type { Container } from '@/src/store'

// Standard shipping container presets. Dimensions in cm, L×W×H per TEU/FEU spec.
// w = length (L), d = width/depth (W), h = height (H)
export const CONTAINER_PRESETS: Omit<Container, 'id'>[] = [
  { label: '20ft TEU', w: 589, h: 239, d: 235 },
  { label: '40ft FEU', w: 1203, h: 239, d: 235 },
]

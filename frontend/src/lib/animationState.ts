import gsap from 'gsap'

// Module-level ref so both InstancedCartons (inside the R3F canvas) and
// PlaybackControls (sidebar, outside the canvas) can access the same timeline
// without threading it through props or Zustand.
export const timelineRef: { current: ReturnType<typeof gsap.timeline> | null } = {
  current: null,
}

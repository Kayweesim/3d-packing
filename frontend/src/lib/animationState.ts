/**
 * animationState.ts — shared handle to the active GSAP load-animation timeline.
 *
 * Exports: timelineRef.
 * Module-level (not React state) so InstancedCartons (inside the R3F canvas)
 * and PlaybackControls / ActivePalletPanel (regular DOM) can drive the same
 * timeline without threading it through props or Zustand.
 */
import gsap from 'gsap'

export const timelineRef: { current: ReturnType<typeof gsap.timeline> | null } = {
  current: null,
}

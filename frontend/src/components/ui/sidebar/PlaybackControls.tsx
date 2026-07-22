/**
 * PlaybackControls.tsx — scrub bar, speed buttons, replay, and play/pause.
 *
 * Exports: PlaybackControls.
 * Renders nothing when there is no packing result.
 * Communicates with the GSAP timeline via timelineRef (animationState.ts) rather
 * than through React state, so seeks and speed changes are instantaneous.
 */
import { useRef } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useStore } from '@/src/store'
import { timelineRef } from '@/src/lib/animationState'

/** Playback controls: scrub bar with per-pallet checkpoint markers, speed selector, and play/pause. */
export function PlaybackControls() {
  const playing          = useStore((s) => s.playing)
  const setPlaying       = useStore((s) => s.setPlaying)
  const speed            = useStore((s) => s.speed)
  const setSpeed         = useStore((s) => s.setSpeed)
  const progress         = useStore((s) => s.progress)
  const setProgress      = useStore((s) => s.setProgress)
  const packingResult    = useStore((s) => s.packingResult)
  const palletPackResult = useStore((s) => s.palletPackResult)
  const packingMode      = useStore((s) => s.packingMode)

  // Whether playback was running when a scrub gesture began, so we can resume it.
  const wasPlayingRef = useRef(false)

  // The controls drive one shared GSAP timeline (timelineRef), which Canvas mounts
  // per mode — so gate visibility on whichever mode's result is active.
  const active = packingMode === 'pallet' ? palletPackResult : packingResult
  if (!active) return null

  const togglePlay = () => {
    const tl = timelineRef.current
    if (!tl) return
    if (playing) {
      setPlaying(false)
    } else {
      // Restart from beginning if already at end
      if (progress >= 1) tl.progress(0)
      setPlaying(true)
    }
  }

  const handleReplay = () => {
    const tl = timelineRef.current
    if (!tl) return
    tl.progress(0)
    setPlaying(true)
  }

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    const tl = timelineRef.current
    if (tl) tl.progress(val)
    setProgress(val)  // keep the controlled slider in lock-step with the thumb
  }

  // Pause auto-advance while the user holds the thumb so the playing timeline
  // doesn't overwrite `progress` each frame and fight the drag; resume after.
  const handleScrubStart = () => {
    wasPlayingRef.current = playing
    timelineRef.current?.pause()
  }

  const handleScrubEnd = () => {
    if (wasPlayingRef.current) timelineRef.current?.play()
    wasPlayingRef.current = false
  }

  return (
    <div className="space-y-2">
      {/* Scrub bar + pallet checkpoint ticks */}
      <div className="relative">
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={handleScrub}
          onPointerDown={handleScrubStart}
          onPointerUp={handleScrubEnd}
          onPointerCancel={handleScrubEnd}
          className="w-full cursor-pointer accent-primary"
        />
      </div>

      <div className="flex items-center justify-between">
        {/* Speed buttons */}
        <div className="flex gap-1">
          {([0.5, 1, 2] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                speed === s
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>

        {/* Replay + Play/Pause */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReplay}
            title="Replay"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw size={13} />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            {playing ? <Pause size={11} /> : <Play size={11} />}
            {playing ? 'Pause' : 'Play'}
          </button>
        </div>
      </div>
    </div>
  )
}

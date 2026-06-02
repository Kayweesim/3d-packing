/**
 * LESSON 05 — Timeline Playback: play, pause, reverse, scrub, speed
 *
 * Once you have a gsap.timeline(), you can control it like a video player.
 * This is the pattern the main app uses in PlaybackControls.tsx + InstancedBoxes.tsx.
 *
 * KEY METHODS:
 *   tl.play()          — play forward from current position
 *   tl.pause()         — pause at current position
 *   tl.reverse()       — play backwards from current position
 *   tl.restart()       — jump to start and play forward
 *   tl.progress(0–1)   — jump to a specific point (0 = start, 1 = end)
 *   tl.timeScale(n)    — speed multiplier (2 = 2× speed, 0.5 = half speed)
 *   tl.kill()          — destroy the timeline (use in cleanup)
 *
 * KEY CALLBACKS (set in timeline options):
 *   onUpdate:   () => void   — fires every frame while playing
 *   onComplete: () => void   — fires when timeline reaches the end
 *   onStart:    () => void   — fires when timeline starts playing
 *
 * STORING THE TIMELINE:
 *   Store it in useRef, NOT useState.
 *   - useRef: doesn't cause re-renders when updated. The timeline object is
 *     mutable — its internal state changes every frame. Storing it in useState
 *     would trigger a re-render on every frame change.
 *   - useState: would cause re-renders every time you set it, and the setter
 *     is async — you can't call tl.play() on a state value reliably.
 *
 * SYNCING PROGRESS TO UI:
 *   Store progress in useState for the scrubber slider.
 *   Update it from onUpdate (called by GSAP, not React):
 *     onUpdate: () => setProgress(tl.progress())
 *   The slider reads from state; dragging the slider calls tl.progress(val).
 *   This matches exactly how PlaybackControls.tsx + InstancedBoxes.tsx work.
 */

import React, { useRef, useEffect, useState } from 'react'
import gsap from 'gsap'
import { Play, Pause, RotateCcw, Rewind } from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════════════════
// WORKED EXAMPLE — Full playback controls on a box animation
// ═══════════════════════════════════════════════════════════════════════════════

const BOXES = [
  { color: 'bg-blue-500',    label: '1' },
  { color: 'bg-emerald-500', label: '2' },
  { color: 'bg-violet-500',  label: '3' },
  { color: 'bg-amber-500',   label: '4' },
  { color: 'bg-rose-500',    label: '5' },
]

function WorkedPlayback() {
  const containerRef = useRef<HTMLDivElement>(null)
  const tlRef        = useRef<gsap.core.Timeline | null>(null)

  // React state for UI — only what the UI needs to display
  const [playing,  setPlaying]  = useState(false)
  const [progress, setProgress] = useState(0)
  const [speed,    setSpeed]    = useState(1)

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        paused:     true,
        defaults:   { duration: 0.5, ease: 'back.out(1.4)' },
        onUpdate:   () => setProgress(tl.progress()),   // sync slider to GSAP position
        onComplete: () => setPlaying(false),             // update play button when done
      })

      // Animate each box entering from the left, staggered
      tl.from('.playback-box', {
        x:       -160,
        opacity: 0,
        stagger: 0.15,
      })

      tlRef.current = tl
    }, containerRef)

    return () => {
      ctx.revert()
      tlRef.current = null
    }
  }, [])

  // Sync speed to timeline whenever it changes
  useEffect(() => {
    tlRef.current?.timeScale(speed)
  }, [speed])

  const handlePlay = () => {
    const tl = tlRef.current
    if (!tl) return
    if (progress >= 1) tl.progress(0)  // restart if at end
    tl.play()
    setPlaying(true)
  }

  const handlePause = () => {
    tlRef.current?.pause()
    setPlaying(false)
  }

  const handleReverse = () => {
    tlRef.current?.reverse()
    setPlaying(true)
  }

  const handleRestart = () => {
    const tl = tlRef.current
    if (!tl) return
    tl.restart()
    setPlaying(true)
  }

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    tlRef.current?.progress(val).pause()
    setPlaying(false)
    setProgress(val)
  }

  return (
    <div className="space-y-4 p-5 rounded-lg border border-zinc-800 bg-zinc-900">
      {/* Stage */}
      <div
        ref={containerRef}
        className="h-16 bg-zinc-800 rounded overflow-hidden flex items-center gap-2 px-3"
      >
        {BOXES.map(({ color, label }) => (
          <div
            key={label}
            className={`playback-box w-10 h-10 ${color} rounded flex items-center justify-center text-white text-xs font-bold shrink-0`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Scrub slider */}
      <input
        type="range"
        min={0} max={1} step={0.001}
        value={progress}
        onChange={handleScrub}
        className="w-full h-1 cursor-pointer accent-blue-500"
      />

      {/* Controls row */}
      <div className="flex items-center justify-between">
        {/* Speed buttons */}
        <div className="flex gap-1">
          {([0.25, 0.5, 1, 2] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                speed === s
                  ? 'bg-blue-600 text-white'
                  : 'border border-zinc-700 text-zinc-400 hover:text-white'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>

        {/* Playback buttons */}
        <div className="flex items-center gap-2">
          <IconBtn onClick={handleRestart} title="Restart">
            <Rewind size={12} />
          </IconBtn>
          <IconBtn onClick={handleReverse} title="Reverse">
            ↩
          </IconBtn>
          {playing ? (
            <PrimaryBtn onClick={handlePause}>
              <Pause size={12} /> Pause
            </PrimaryBtn>
          ) : (
            <PrimaryBtn onClick={handlePlay}>
              <Play size={12} /> Play
            </PrimaryBtn>
          )}
        </div>
      </div>

      {/* Progress readout */}
      <p className="text-zinc-600 text-[10px] text-right">
        progress: {(progress * 100).toFixed(1)}% · speed: {speed}×
      </p>
    </div>
  )
}

function WorkedExample() {
  return (
    <Section title="Worked Example — Full Playback Controls">
      <p className="text-zinc-400 text-xs mb-4 leading-relaxed">
        Timeline stored in <Code>useRef</Code>. Progress synced to React state via <Code>onUpdate</Code>.
        Scrubber drags timeline position. Speed changes via <Code>timeScale()</Code>.
      </p>
      <WorkedPlayback />
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// YOUR TURN — Build a simpler version from scratch
// ═══════════════════════════════════════════════════════════════════════════════
//
// Complete the component below.
// The timeline animates a box from left to right and scales it up.
// Wire up:
//   1. useEffect: create the timeline (paused), store in tlRef, sync progress via onUpdate
//   2. handlePlay: play the timeline (restart if at end)
//   3. handlePause: pause the timeline
//   4. handleScrub: seek to slider value
//   5. Speed buttons: call tl.timeScale(s)

function YourTurnPlayback() {
  const boxRef   = useRef<HTMLDivElement>(null)
  const tlRef    = useRef<gsap.core.Timeline | null>(null)
  const [playing,  setPlaying]  = useState(false)
  const [progress, setProgress] = useState(0)
  const [speed,    setSpeed]    = useState(1)

  // ??? Step 1: create the timeline in useEffect
  // - animate boxRef.current: x: 0 → 220, scale: 1 → 1.5, duration: 2, ease: 'power2.inOut'
  // - paused: true
  // - onUpdate: () => setProgress(tl.progress())
  // - onComplete: () => setPlaying(false)
  // - store in tlRef.current
  // - return cleanup: () => { tlRef.current?.kill(); tlRef.current = null }
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        paused:     true,
        onUpdate:   () => setProgress(tl.progress()),   // sync slider to GSAP position
        onComplete: () => setPlaying(false),             // update play button when done
      })

      // Animate each box entering from the left, staggered
      tl.from(boxRef.current, {
        x: 220,
        opacity: 0,
        duration: 2,
        stagger: 0.15,
        scale: 1.5,
        ease: 'power2.inOut'
      })

      tlRef.current = tl
    })

    return () => {
      ctx.revert()
      tlRef.current?.kill()
      tlRef.current = null
    }
  }, [])
  // handlePlay: () => {
  //   const tl = tlRef.current; if (!tl) return
  //   if (progress >= 1) tl.progress(0)
  //   tl.play(); setPlaying(true)
  // }
  //
  // handlePause: () => { tlRef.current?.pause(); setPlaying(false) }
  //
  // handleScrub: (e) => {
  //   const val = parseFloat(e.target.value)
  //   tlRef.current?.progress(val).pause()
  //   setProgress(val); setPlaying(false)
  // }
  //
  // useEffect(() => { tlRef.current?.timeScale(speed) }, [speed])

  // ??? Step 2: play (if at end, restart from 0)
  const handlePlay = () => {
    const tl = tlRef.current
    if (!tl) return
    if (progress >= 1) tl.progress(0)  // restart if at end
    tl.play()
    setPlaying(true)
  }

  // ??? Step 3: pause
  const handlePause = () => {
    // ??? fill in
    tlRef.current?.pause()
    setPlaying(false)
  }

  // ??? Step 4: scrub to slider position
  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    tlRef.current?.progress(val).pause()
    setProgress(val); setPlaying(false)
  }

  // ??? Step 5: speed — use useEffect([speed]) to call tl.timeScale(speed)
  useEffect(() => {
      tlRef.current?.timeScale(speed) 
  }, [speed])

  return (
    <div className="space-y-4 p-5 rounded-lg border border-zinc-700 bg-zinc-900">
      {/* Stage */}
      <div className="h-16 bg-zinc-800 rounded overflow-hidden flex items-center px-3">
        <div
          ref={boxRef}
          className="w-10 h-10 bg-blue-500 rounded flex items-center justify-center text-white text-xs font-bold shrink-0"
        >
          box
        </div>
      </div>

      {/* Scrub slider */}
      <input
        type="range"
        min={0} max={1} step={0.001}
        value={progress}
        onChange={handleScrub}
        className="w-full h-1 cursor-pointer accent-red-500"
      />

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {([0.5, 1, 2] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                speed === s
                  ? 'bg-blue-600 text-white'
                  : 'border border-zinc-700 text-zinc-400 hover:text-white'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {playing ? (
            <PrimaryBtn onClick={handlePause}><Pause size={12} /> Pause</PrimaryBtn>
          ) : (
            <PrimaryBtn onClick={handlePlay}><Play size={12} /> Play</PrimaryBtn>
          )}
        </div>
      </div>
      <p className="text-zinc-600 text-[10px] text-right">progress: {(progress * 100).toFixed(1)}%</p>
    </div>
  )
}

function YourTurn() {
  return (
    <Section title="Your Turn — Wire up playback from scratch">
      <p className="text-zinc-400 text-xs mb-4 leading-relaxed">
        Five <Code>???</Code> sections to fill in. The box and UI are provided —
        you only need to connect GSAP to the controls.
      </p>
      <YourTurnPlayback />
    </Section>
  )
}

export default function Lesson05Playback() {
  return (
    <div className="max-w-2xl mx-auto space-y-10">
      <h1 className="text-lg font-semibold text-white">Lesson 05 — Timeline Playback Controls</h1>
      <WorkedExample />
      <YourTurn />
    </div>
  )
}

// ─── QUESTIONS ───────────────────────────────────────────────────────────────
// Q1: Why is tlRef typed as useRef<gsap.core.Timeline | null>(null) and not
//     useState<gsap.core.Timeline | null>(null)?
//
// Q2: In handleScrub, we call tl.pause() after tl.progress(val). Why?
//     What would happen if you didn't pause when scrubbing?
//
// Q3: In the main app, timelineRef is defined in animationState.ts (a module-level
//     singleton) instead of useRef inside a component. What problem does this solve
//     that useRef cannot?
//
// ANSWERS: (hidden — try yourself first)
// A1: The timeline object mutates internally every frame (its currentTime,
//     progress, etc. change constantly while playing). Storing it in useState
//     would require calling setState on every frame change to keep React in sync —
//     causing hundreds of re-renders per second. useRef holds a mutable value
//     that can change without triggering re-renders. The UI only needs progress
//     (synced via onUpdate → setState) — the timeline object itself doesn't need
//     to be reactive state.
//
// A2: Without pause(), tl.progress(val) seeks to that position but the timeline
//     immediately resumes playing forward from there. The scrubber would snap to
//     a position and then the animation would continue from that point while the
//     user is still dragging — the slider position would fight with the playing
//     animation. Pausing ensures the timeline stays at exactly where you scrubbed.
//
// A3: useRef is per-component-instance. If PlaybackControls and InstancedBoxes
//     are separate components, each would have its own tlRef — they can't share it
//     via useRef. A module-level ref (animationState.ts) is a single object in
//     memory shared across all importers. InstancedBoxes writes the timeline to
//     timelineRef.current; PlaybackControls reads from the same object. This is
//     impossible with useRef alone — you'd need to lift the ref up via context or
//     prop drilling, which is more complex.
// ─────────────────────────────────────────────────────────────────────────────

// ─── ANSWERS FOR YOUR TURN ────────────────────────────────────────────────────
// useEffect(() => {
//   const tl = gsap.timeline({
//     paused: true,
//     onUpdate:   () => setProgress(tl.progress()),
//     onComplete: () => setPlaying(false),
//   })
//   tl.to(boxRef.current, { x: 220, scale: 1.5, duration: 2, ease: 'power2.inOut' })
//   tlRef.current = tl
//   return () => { tl.kill(); tlRef.current = null }
// }, [])
//
// handlePlay: () => {
//   const tl = tlRef.current; if (!tl) return
//   if (progress >= 1) tl.progress(0)
//   tl.play(); setPlaying(true)
// }
//
// handlePause: () => { tlRef.current?.pause(); setPlaying(false) }
//
// handleScrub: (e) => {
//   const val = parseFloat(e.target.value)
//   tlRef.current?.progress(val).pause()
//   setProgress(val); setPlaying(false)
// }
//
// useEffect(() => { tlRef.current?.timeScale(speed) }, [speed])
// ─────────────────────────────────────────────────────────────────────────────

// ─── SHARED UI HELPERS ────────────────────────────────────────────────────────

function PrimaryBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
    >
      {children}
    </button>
  )
}

function IconBtn({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors text-xs"
    >
      {children}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-zinc-300 font-semibold mb-4 border-b border-zinc-800 pb-2">{title}</h2>
      {children}
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="text-amber-400 bg-zinc-800 px-1 rounded text-xs">{children}</code>
}

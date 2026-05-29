# Phase 6 Plan — Animation, In-Out Packing & Box Constraints

## Overview

Phase 6 is broken into 5 sequential sub-phases. Each must be completed and verified before starting the next.

---

## Current State Audit

### What's Correct
- `Placement` type already stores `{boxId, x, y, z, w, h, d}` — placed dimensions, not original. Rotation won't break the type.
- `UiSlice` already has `playing`, `speed`, `progress` state — ready for animation wiring.
- `InstancedBoxes.tsx` already does the CPU-side position math correctly.

### What Needs to Change
| Area | Issue |
|---|---|
| `Box` type + `BoxSlice` | Missing `rotationAllowed`, `stackingOnTop`, `stackingUnder` flags |
| `BoxForm.tsx` + `BoxEditDialog.tsx` | No UI for the 3 new flags |
| `mockPacker.ts` — `findBestFit` | Scores purely by volume; no depth (z) preference → produces layer-by-layer packing |
| `mockPacker.ts` — `tryPlace` | No rotation attempt; no stacking constraint enforcement |
| `mockPacker.ts` — `packContainer` | Placements not sorted by depth; animation order is arbitrary |
| `InstancedBoxes.tsx` — grouping | Groups by `boxId` only; assumes all instances have the same w/h/d — breaks with rotation |
| `InstancedBoxes.tsx` — animation | No GSAP wiring; boxes appear all at once |
| `PlaybackControls.tsx` | Doesn't exist yet |

---

## Sub-Phase 6a — Box Constraint Properties

**Goal:** Add the 3 per-box flags to the data model and expose them in the UI. No packing logic changes yet.

### Data Model (`src/store/boxSlice.ts`)
Add to `Box` interface:
```ts
rotationAllowed: boolean   // packer may rotate this box to any of 6 orientations
stackingOnTop:  boolean    // other boxes may be placed on top of this one
stackingUnder:  boolean    // this box may be placed on top of other boxes
```
All three default to `true` in `addBox`. `updateBox` already accepts partial updates — no signature change needed.

### `BoxForm.tsx` — Add Box form
Below the Qty row, add a row of 3 small checkboxes with labels:
```
[✓] Rotation   [✓] Stack on top   [✓] Stack under
```
Wire to form state; pass into `addBox`.

### `BoxEditDialog.tsx`
Same 3 checkboxes, pre-filled from `box` props, saved via `updateBox`.

### Verification
Add a box → verify all 3 flags are stored in Zustand (check devtools). Toggle checkboxes → box in store updates. Pack → behavior unchanged (flags not yet used by packer).

---

## Sub-Phase 6b — Packing Algorithm Refactor

**Goal:** Enforce in-out packing order, rotation, and stacking constraints in `mockPacker.ts`. Sort placements by depth for the animation sequence.

### 1. Door Definition
The door is at `z = container.d` (the high-Z face). The back wall is `z = 0`. Packers load from z=container.d inward, so boxes must be placed deepest (low z) first.

### 2. `findBestFit` — Add Depth Preference
Current: score = `space.volume` (smallest fitting volume wins).

New: primary sort key = `space.z` ascending (lower z = further from door = preferred). Secondary = volume ascending (best fit as tiebreaker within same depth level).

```
// Prefer lowest z; break ties by smallest volume
score: z first, then volume
```

This naturally fills the back of the container before moving toward the door, preventing layer-by-layer horizontal packing.

### 3. `BoxInstance` — Carry Constraint Flags
Add `rotationAllowed`, `stackingOnTop`, `stackingUnder` to `BoxInstance`. Populate from `Box` when expanding instances in `runMockPacker`.

### 4. `tryPlace` — Rotation Support
If `rotationAllowed`:
- Generate all unique orientations of `(w, h, d)` — up to 6, deduplicated when any two dimensions are equal.
- For each orientation, call `findBestFit` and record `{idx, vol, orientation}`.
- Pick the orientation whose best-fit space has the lowest z (depth preference), then smallest volume as tiebreaker.
- Use the winning orientation's dimensions for placement and guillotine split.

If `!rotationAllowed`: current single-orientation behavior unchanged.

### 5. `tryPlace` — Stacking Constraints

**`stackingUnder` (can this box be placed above the floor?):**
- If `!stackingUnder`: skip any free space where `space.y > 0`. The box must sit on the container floor.

**`stackingOnTop` (can boxes be placed above this box?):**
- After placing, only push R2 (the "above" guillotine sub-space) if `stackingOnTop = true`.
- If `false`: the volume above the placed box is permanently lost to the packer.

### 6. Placement Sort — Animation Order
After `packContainer` returns, sort `placements` by `(z + d/2)` ascending — i.e., by the centre z of each placed box. Deepest box (lowest centre-z) animates first; box nearest the door animates last.

This sort is the ONLY change to `packContainer`.

### Verification
Add boxes with rotation disabled → confirm they appear at original orientation in 3D. Add a "no stack under" box → confirm it always sits on the floor. Add a "no stack on top" box → confirm no box is placed above it. Observe placements array is ordered back-to-front.

---

## Sub-Phase 6c — Rendering Fix for Rotation

**Goal:** Fix `InstancedBoxes.tsx` so different rotations of the same box type render with the correct geometry.

### Problem
`BoxTypeInstances` uses `first.w, first.h, first.d` from the first placement in a group as the geometry for ALL instances of that `boxId`. With rotation, `boxId="abc"` can appear as 50×30×20 in one placement and 30×20×50 in another — one `BoxGeometry` can't serve both.

### Fix
Change the grouping key from `boxId` to `${boxId}_${w}x${h}x${d}` (placed dimensions appended).

- Color lookup still uses `boxId` → `box.colorIndex` → `getBoxColor()`. Color is per box type, not per orientation. Same color across all rotations of the same box type.
- Each orientation sub-group gets its own `InstancedMesh` with the correct `BoxGeometry`.
- Merged edge geometry in `BoxTypeInstances` already uses per-placement `w/h/d` — no change needed there.

### Verification
Add one box type with rotation enabled, pack → verify all placements render with their actual placed dimensions. All instances of the same box type share the same color regardless of orientation.

---

## Sub-Phase 6d — GSAP Animation Engine

**Goal:** Animate boxes one-by-one in deepest-first order. Each box "slides in" from the door side toward its final position.

### Architecture

The animation lives entirely in `InstancedBoxes.tsx`. No new files needed.

`UiSlice.progress` (0–1) is the single source of truth for animation position. GSAP drives this value via `setProgress`. `InstancedBoxes` uses `useFrame` to read `progress` and update instance matrices every frame.

### GSAP Timeline Setup
- Create one GSAP timeline per render of `InstancedBoxes` (when `packingResult` changes).
- Map timeline progress (0 → 1) to box count (0 → N): box `i` starts animating at `t = i/N` and finishes at `t = (i+1)/N`.
- Each box tween: move Z from `finalZ + entryOffset` (just outside the door, toward z=container.d) → `finalZ` over its stagger window. X and Y are fixed at final values.
- `entryOffset = container.d * 0.15` — boxes enter from just outside the door, not from infinity.
- On timeline update, call `setProgress(timeline.progress())`.

### `useFrame` Matrix Update
Replace the current static `useEffect` matrix write with a `useFrame` callback:
```
for each group:
  for each placement i:
    if animProgress[i] <= 0 → scale matrix to 0 (invisible)
    else → compute lerped z position, set matrix
  instanceMatrix.needsUpdate = true
```

The `animProgress[i]` array is written by GSAP each frame.

### Play/Pause/Scrub
- `playing = true` → GSAP timeline plays at `speed` multiplier.
- `playing = false` → GSAP timeline pauses.
- `progress` slider change → `timeline.progress(newValue)` (scrub).
- On `packingResult` change (new Pack) → timeline resets to 0, `setProgress(0)`, `setPlaying(false)`.

### Verification
Click Pack → boxes animate one-by-one from the back to the front of the container. Visually: each box slides in from the door side and snaps to position. Boxes already placed stay visible while new ones animate in.

---

## Sub-Phase 6e — PlaybackControls UI

**Goal:** Build `PlaybackControls.tsx` and add it to the sidebar below the Pack button.

### Component (`src/components/ui/PlaybackControls.tsx`)
- Reads `playing`, `speed`, `progress` from `UiSlice`.
- Renders only when `packingResult !== null` (hidden before first pack).

Layout:
```
[▶/⏸]  [──────●──────────]  [0.5×] [1×] [2×]
         scrub slider          speed buttons
```

- Play/Pause: toggle `setPlaying`.
- Scrub slider: `input type="range"` 0–1 step 0.001, `value={progress}`, `onChange → setProgress`.
- Speed buttons: `0.5×`, `1×`, `2×` — active button highlighted.

### `Sidebar.tsx`
Import `PlaybackControls` and render it below `UtilizationStats`.

### Verification
After Pack: controls appear. Play → animation runs. Pause → freezes mid-animation. Scrub → jumps to any point. Speed changes take effect on next Play. Re-packing → controls reset, animation restarts from beginning.

---

## Implementation Order

```
6a → 6b → 6c → 6d → 6e
```

Each sub-phase is independently verifiable. Do not start 6b until 6a is confirmed working (so constraint flags are available to pass into the packer).

---

## Files Touched

| File | Sub-phase | Change |
|---|---|---|
| `src/store/boxSlice.ts` | 6a | Add 3 boolean fields + defaults |
| `src/components/ui/BoxForm.tsx` | 6a | 3 constraint checkboxes |
| `src/components/ui/BoxEditDialog.tsx` | 6a | 3 constraint checkboxes |
| `src/lib/mockPacker.ts` | 6b | findBestFit depth scoring, rotation, stacking, placement sort |
| `src/components/3d/InstancedBoxes.tsx` | 6c + 6d | Grouping key fix + GSAP animation |
| `src/components/ui/PlaybackControls.tsx` | 6e | New component |
| `src/components/ui/Sidebar.tsx` | 6e | Mount PlaybackControls |

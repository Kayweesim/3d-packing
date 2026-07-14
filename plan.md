 Here's the plan. First, a quick diagnosis of why flat-pack behaves the way you describe, then the staircase design that fits the existing engine.

  Why flat-pack jumps by a whole box height

  _flat_repack_search finds the shortest uniform height cap, quantized to layer = the tallest carton's flattest height (_flat_height_cap). So if the load needs even 1 cm more than N      
  layers, the entire slab jumps to N+1 layers — and the front face of the load is now a vertical wall N+1 boxes tall with nothing bracing it toward the door.

  Staircase design

  Replace the uniform ceiling with a height envelope ceiling(z): full height H at the back wall, dropping one layer every step_depth toward the door, floored at one layer. Every step is
  braced by the taller stack behind it, and the load front is always low:

  ceiling(z) = H                                  for z ≤ z_p   (plateau)
             = max(layer, H - layer·⌈(z-z_p)/S⌉)  for z > z_p   (stairs)

  Implementation steps

  1. helper.py — add an envelope type (list of (z_start, max_h) steps or a callable). New feasibility check: a candidate is rejected if py + bh > ceiling(pz + bd) — evaluated at the
  carton's front edge, which is conservative since the envelope is non-increasing in z.
  2. engine.py — thread an optional envelope parameter through _pack_container → _pack_group → _find_best_placement/_place_instance. Default None = exactly today's behavior (full
  container everywhere, lashing path untouched).
  3. New _staircase_repack_search (replaces the body of _apply_flat_repack's search, keeping its interface):
    - Phase 1: run the existing _flat_repack_search to get the minimal uniform cap H* and observed load front z_front. This stays the anchor — the staircase never exceeds H*.
    - Phase 2: fix H = H*, S = step_depth (default: the depth of the layer-defining carton in its flattest orientation), and search the minimal plateau end z_p with the same gallop +     
  binary-search machinery. Monotonicity holds (larger z_p = looser envelope = never fewer cartons), and z_p = container.d degenerates to the uniform H* cap — a guaranteed-success
  fallback, so the search always terminates with a result no worse than today's flat pack.
    - Seed z_p at z_front − (H*/layer)·S (i.e. "stairs just fit before the current load front"), so a good load converges in ~2–3 probes.
  4. Wire-up — _apply_flat_repack calls the staircase search when apply_flat=True; flatApplied flag and everything downstream (UI badge, utilization, topo sort) unchanged. lashing=True   
  still skips it all.
  5. Verification — extend backend/algorithms/guillotine/test_characterize.py: (a) existing baseline test must stay green (full containers and lashing paths are byte-identical); (b) new  
  staircase case asserting all cartons placed, no placement top exceeds the envelope, max height ≤ flat's H*, and column heights are non-increasing toward the door in the stair region.   

  What doesn't change

  Gravity settling, the  support check, reachability, pallet ordering, animation order, and the frontend — placements just come out staircase-shaped. Worst case (stairs can't fit the  
  load) it silently lands on today's flat result.

  One design choice worth flagging: I'd keep the stairs dropping one layer per step. Half-layer steps aren't possible anyway — a step's height is set by the cartons standing on it, so the
  envelope can only cut in whole-carton increments.

  Want me to implement this?

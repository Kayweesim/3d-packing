
## What a Pallet Group Is
A pallet group is NOT a physical object. It is simply a named 
collection of boxes that belong together. The boxes are still 
packed loose into the container — the pallet is just an 
organisational concept.

Example:
  Pallet A → 100 boxes of SKU X
  Pallet B → 50 boxes of SKU Y
  Pallet C → 50 boxes of SKU Z

## The Core Problem
When packing pallet groups into a container, the order in which 
groups are packed determines how efficiently space is used. 
Groups packed first go deepest into the container. Groups packed 
last sit at the door end.

The optimal packing order should be determined automatically 
using a large-volume-first heuristic:
- Calculate total box volume per pallet group
- Pack largest volume group first (deepest)
- Pack smallest volume group last (door end)
- This produces cleaner Z-depth boundaries and better utilization

## What Needs to Be Built (High Level)

2. Pallet sorting logic — pure function that determines which pallets can go in first, maybe
using a heuristic like largest volume first or largest boxes.

3. Algorithm changes — Change it to guillotine algorithm for now.

4. UI — a new Pallet Groups mode in the sidebar where users 
   create groups, assign boxes to them, and see a preview of 
   the auto-determined packing order

5. Visualization — in pallet mode, color boxes by pallet group 
   rather than box type, and animate groups sequentially

## Constraints
- Existing loose cargo mode must remain completely unchanged
- This is purely additive — no existing behaviour should break
- No new dependencies

## What I Need From You
Before writing any code, give me:
1. A high level architecture plan — what layers are affected 
   and how they interact
2. Key design decisions and tradeoffs you foresee
3. Any questions or ambiguities that need clarification 
   before implementation begins

Do not write any code yet.
Write your plan out in claude.MD.
"""
test_characterize.py — plain-assert characterization tests for the packing engine.

Pins the CURRENT behaviour of `run_algo1` (exact placements, order, and
utilization) across a handful of representative scenarios, so refactors
(extraction only, no logic change) can be verified step-by-step: run this
script before and after each change and confirm byte-identical output.

Not a general-purpose test suite — just a snapshot harness for refactoring.
Run from the `backend/` directory:  python -m packing_algos.algo_v1.test_characterize
Re-pin after an intentional behaviour change with:  ... test_characterize --freeze
"""

from __future__ import annotations

from schema import BoxIn, ContainerIn
from packing_algos.algo_v1 import run_algo1


def _box(id_, w, h, d, qty, color, rotation=True, stacking=True) -> BoxIn:
    return BoxIn(id=id_, label=id_, w=w, h=h, d=d, quantity=qty,
                 colorIndex=color, rotationAllowed=rotation, stacking=stacking)


def _container(w=235, h=239, d=589, id_="c1") -> ContainerIn:
    return ContainerIn(id=id_, w=w, h=h, d=d)


def _dump(results) -> list[dict]:
    """Flatten ContainerResult list into plain comparable dicts."""
    out = []
    for r in results:
        out.append({
            "containerId": "<id>",  # uuid/id values are not stable across runs
            "utilization": round(r.utilization, 6),
            "flatApplied": r.flatApplied,
            "placements": [
                {"boxId": p.boxId, "x": p.x, "y": p.y, "z": p.z,
                 "w": p.w, "h": p.h, "d": p.d}
                for p in r.placements
            ],
        })
    return out


def _assert_scenario(name, containers, boxes, lashing, expected):
    result = run_algo1(containers, boxes, lashing=lashing)
    actual = _dump(result)
    assert actual == expected, (
        f"[{name}] mismatch:\n  expected={expected}\n  actual={actual}"
    )
    print(f"PASS  {name}  ({sum(len(r['placements']) for r in actual)} placed)")


# ── Scenario 1: basic multi-box, single pallet, single container ──────────────

def scenario_basic():
    boxes = [_box("A", 50, 40, 60, 6, color=0)]
    containers = [_container()]
    result = run_algo1(containers, boxes, lashing=False)
    return containers, boxes, False, _dump(result)


# ── Scenario 2: stacking disabled (flat-first preference) ─────────────────────

def scenario_no_stacking():
    boxes = [_box("A", 100, 60, 80, 4, color=0, stacking=False)]
    containers = [_container()]
    result = run_algo1(containers, boxes, lashing=False)
    return containers, boxes, False, _dump(result)


# ── Scenario 3: rotation disabled ──────────────────────────────────────────────

def scenario_no_rotation():
    boxes = [_box("A", 60, 50, 40, 5, color=0, rotation=False)]
    containers = [_container()]
    result = run_algo1(containers, boxes, lashing=False)
    return containers, boxes, False, _dump(result)


# ── Scenario 4: multi-pallet, overflow to a second container ──────────────────

def scenario_overflow():
    boxes = [
        _box("A", 100, 100, 100, 20, color=0),
        _box("B", 80, 60, 70, 15, color=1),
    ]
    containers = [_container(id_="c1"), _container(id_="c2")]
    result = run_algo1(containers, boxes, lashing=False)
    return containers, boxes, False, _dump(result)


# ── Scenario 5: lashing=True (no flat re-pack) ─────────────────────────────────

def scenario_lashing():
    boxes = [_box("A", 90, 70, 110, 8, color=0)]
    containers = [_container()]
    result = run_algo1(containers, boxes, lashing=True)
    return containers, boxes, True, _dump(result)


# ── Scenario 6: mixed stacking + rotation constraints across two pallets ───────

def scenario_mixed():
    boxes = [
        _box("A", 120, 50, 90, 6, color=0, stacking=False),
        _box("B", 60, 60, 60, 10, color=1, rotation=False),
    ]
    containers = [_container()]
    result = run_algo1(containers, boxes, lashing=False)
    return containers, boxes, False, _dump(result)


# ── Scenario 7: staircase re-pack (uniform load taller than one layer) ─────────
# 80 boxes need 3 layers under the flat cap; the staircase phase then tapers
# the front down to a single layer instead of a 3-layer cliff.

def scenario_staircase():
    boxes = [_box("A", 50, 40, 60, 80, color=0)]
    containers = [_container()]
    result = run_algo1(containers, boxes, lashing=False)
    return containers, boxes, False, _dump(result)


SCENARIOS = {
    "basic": scenario_basic,
    "no_stacking": scenario_no_stacking,
    "no_rotation": scenario_no_rotation,
    "overflow": scenario_overflow,
    "lashing": scenario_lashing,
    "mixed": scenario_mixed,
    "staircase": scenario_staircase,
}


def capture_baseline() -> dict:
    """Run every scenario and return {name: expected_dump} — used to freeze
    behaviour before refactoring starts."""
    baseline = {}
    for name, fn in SCENARIOS.items():
        _containers, _boxes, _lashing, dump = fn()
        baseline[name] = dump
    return baseline


def run_against_baseline(baseline: dict) -> None:
    for name, fn in SCENARIOS.items():
        containers, boxes, lashing, _ = fn()
        _assert_scenario(name, containers, boxes, lashing, baseline[name])


if __name__ == "__main__":
    import json
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--freeze":
        baseline = capture_baseline()
        with open("packing_algos/algo_v1/_baseline.json", "w") as f:
            json.dump(baseline, f, indent=2)
        print(f"Froze baseline for {len(baseline)} scenarios.")
    else:
        with open("packing_algos/algo_v1/_baseline.json") as f:
            baseline = json.load(f)
        run_against_baseline(baseline)
        print("All scenarios match baseline.")

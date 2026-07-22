"""
test_pattern.py — plain-assert snapshot harness for the pallet pattern packer.

Pins per_layer / n_layers / per_pallet / pallets_needed / last_pallet_count and
the exact placement count for a handful of hand-checked scenarios. Not a
general-purpose suite — a characterization harness in the style of
packing_algos/algo_v1/test_characterize.py.

Run from the backend/ directory:  python -m pallet_packing.test_pattern
"""

from __future__ import annotations

from pallet_packing.pattern import BoxSpec, run_pallet_pack
from pallet_packing.presets import resolve_pallet


def _check(name: str, box: BoxSpec, pallet_key: str, quantity: int, expected: dict) -> None:
    pallet = resolve_pallet(pallet_key)
    r = run_pallet_pack(box, pallet, quantity)
    actual = {
        "per_layer": r.per_layer,
        "layers": r.layers,
        "per_pallet": r.per_pallet,
        "pallets_needed": r.pallets_needed,
        "last_pallet_count": r.last_pallet_count,
        "placements": len(r.placements),
    }
    assert actual == expected, f"[{name}] mismatch:\n  expected={expected}\n  actual={actual}"
    # Placements must equal one full pallet (per_layer × layers) and never float.
    assert len(r.placements) == r.per_layer * r.layers, f"[{name}] placement count != per_pallet layout"
    for p in r.placements:
        assert p.y >= pallet.deck_h - 1e-6, f"[{name}] placement below deck"
        assert p.x >= -1e-6 and p.z >= -1e-6, f"[{name}] placement outside footprint (neg)"
        assert p.x + p.w <= pallet.Wp + 1e-6 and p.z + p.d <= pallet.Dp + 1e-6, \
            f"[{name}] placement exceeds footprint"
    print(f"PASS  {name}  (per_pallet={r.per_pallet}, pallets={r.pallets_needed})")


# ── Scenarios ─────────────────────────────────────────────────────────────────

def main() -> None:
    # 1. EUR1, 40×30×30, stack+rotate, qty 100.
    #    Layer: 30×40 footprint → 4×2 = 8/layer. 180/30 = 6 layers → 48/pallet.
    #    ceil(100/48) = 3 pallets; last = 100 - 96 = 4.
    _check("eur1_basic", BoxSpec("A", 40, 30, 30), "EUR1", 100, {
        "per_layer": 8, "layers": 6, "per_pallet": 48,
        "pallets_needed": 3, "last_pallet_count": 4, "placements": 48,
    })

    # 2. Same carton, non-stackable → single layer of 8. qty 20 → 3 pallets, last 4.
    _check("eur1_no_stack", BoxSpec("A", 40, 30, 30, stacking=False), "EUR1", 20, {
        "per_layer": 8, "layers": 1, "per_pallet": 8,
        "pallets_needed": 3, "last_pallet_count": 4, "placements": 8,
    })

    # 3. Rotation disabled — only natural h-up, but in-plane yaw still fills 8/layer.
    #    qty 50 → ceil(50/48) = 2 pallets, last = 2.
    _check("eur1_no_rotate", BoxSpec("A", 40, 30, 30, rotationAllowed=False), "EUR1", 50, {
        "per_layer": 8, "layers": 6, "per_pallet": 48,
        "pallets_needed": 2, "last_pallet_count": 2, "placements": 48,
    })

    # 4. EUR2 (120×100), 50×40×35, stack+rotate, qty 30 → exact single pallet.
    #    Layer: 40×50 footprint → 3×2 = 6/layer. 180/35 = 5 layers → 30/pallet.
    _check("eur2_exact", BoxSpec("B", 50, 40, 35), "EUR2", 30, {
        "per_layer": 6, "layers": 5, "per_pallet": 30,
        "pallets_needed": 1, "last_pallet_count": 30, "placements": 30,
    })

    # 5. Oversized carton — doesn't fit on EUR1 in any orientation within the cap.
    _check("eur1_too_big", BoxSpec("C", 200, 200, 200), "EUR1", 10, {
        "per_layer": 0, "layers": 0, "per_pallet": 0,
        "pallets_needed": 0, "last_pallet_count": 0, "placements": 0,
    })

    print("\nAll pallet-pattern scenarios passed.")


if __name__ == "__main__":
    main()

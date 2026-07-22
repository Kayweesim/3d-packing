"""
presets.py — pallet type definitions for single-SKU pallet packing.

The single source of truth for pallet footprints/heights; the frontend mirrors
these values in lib/palletTypes.ts (keep the two in sync). Dimensions in cm.

Axis convention (matches the container packer): X = width (Wp), Z = depth (Dp),
Y = height (up). Goods stack ABOVE the deck (deck_h), capped at max_height.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PalletType:
    """One pallet preset (cm). `max_height` is the load-height cap ABOVE the deck."""
    key: str
    label: str
    Wp: float          # footprint width  — X axis (cm)
    Dp: float          # footprint depth  — Z axis (cm)
    deck_h: float      # deck thickness (cm) — goods rest on top of this
    max_height: float  # default max goods height above the deck (cm)


# EUR1/EPAL and EUR2 are the two standard European pallets. CUSTOM is a
# placeholder the caller fully parametrizes (Wp/Dp/max_height from the request).
PALLET_TYPES: dict[str, PalletType] = {
    "EUR1":   PalletType(key="EUR1",   label="EUR1 (EPAL)", Wp=120, Dp=80,  deck_h=14.4, max_height=180),
    "EUR2":   PalletType(key="EUR2",   label="EUR2",        Wp=120, Dp=100, deck_h=14.4, max_height=180),
    "CUSTOM": PalletType(key="CUSTOM", label="Custom",      Wp=120, Dp=100, deck_h=14.4, max_height=180),
}

DEFAULT_PALLET_KEY = "EUR1"


def resolve_pallet(
    key: str,
    Wp: float | None = None,
    Dp: float | None = None,
    max_height: float | None = None,
) -> PalletType:
    """
    Return a PalletType for `key`, overriding dims/height where provided.
    Overrides are required for CUSTOM (which has placeholder dims) and optional
    for the presets (e.g. a user-tuned max_height). Unknown keys fall back to the
    default preset so a bad request degrades gracefully rather than erroring.
    """
    base = PALLET_TYPES.get(key) or PALLET_TYPES[DEFAULT_PALLET_KEY]
    return PalletType(
        key=base.key,
        label=base.label,
        Wp=Wp if Wp is not None else base.Wp,
        Dp=Dp if Dp is not None else base.Dp,
        deck_h=base.deck_h,
        max_height=max_height if max_height is not None else base.max_height,
    )

"""
schema.py — Pydantic models for the Container Packing API request/response contract.

Inbound:  OptimizeRequest (boxes + available container types).
Outbound: OptimizeResponse (per-container placements + selection metadata).
"""

from pydantic import BaseModel


# ── Inbound ────────────────────────────────────────────────────────────────────

class ContainerIn(BaseModel):
    """A container the optimizer may pack into (dimensions in cm)."""
    id: str
    w: float   # cross-section width  (X axis, cm)
    h: float   # height               (Y axis, cm)
    d: float   # depth / length       (Z axis, cm) — z=0 is back wall, z=d is door


class BoxIn(BaseModel):
    """A carton type with quantity and per-instance packing constraints."""
    id: str
    label: str
    w: float
    h: float
    d: float
    quantity: int
    colorIndex: int
    rotationAllowed: bool = True
    stacking: bool = True


# ── Outbound ───────────────────────────────────────────────────────────────────

class PlacementOut(BaseModel):
    """Final resting position and dimensions of one placed carton instance."""
    boxId: str
    x: float
    y: float   # resting floor — always gravity-settled, never floating
    z: float   # z=0 is back wall; placements increase toward door (z=d)
    w: float
    h: float
    d: float


class ContainerResult(BaseModel):
    """Packing outcome for one container."""
    containerId: str
    placements: list[PlacementOut]   # sorted by centre-z asc (back → door)
    utilization: float               # 0.0–1.0
    flatApplied: bool = False        # True if re-packed flat (last-container stability rule)


# ── Optimizer ──────────────────────────────────────────────────────────────────

class ContainerUsed(BaseModel):
    """A container selected by the optimizer, returned so the frontend can render it
    in 3D without needing to know the preset dimensions itself."""
    id: str
    label: str
    w: float
    h: float
    d: float


class OptimizeRequest(BaseModel):
    """Request body for POST /api/optimize."""
    boxes: list[BoxIn]
    available_types: list[str]   # subset of ['20ft', '40ft']
    algorithm: str = "algo1"     # packer key (see packing_algos/registry.py); optional for back-compat
    lashing: bool = False        # True → load is lashed/secured, so skip the flat
                                 # last-container re-pack and stack tall (depth-first)


class OptimizeResponse(BaseModel):
    """Response from POST /api/optimize."""
    containers: list[ContainerResult]    # per-container packing results
    containers_used: list[ContainerUsed] # which containers were chosen (for 3D rendering)
    total_cost: float
    container_summary: str               # e.g. "1× 40ft FEU" or "2× 20ft TEU"
    all_packed: bool                     # False if some boxes exceeded the cost cap


# ── Visualizer trace ───────────────────────────────────────────────────────────

class TraceRequest(BaseModel):
    """Request body for POST /api/trace — boxes to step-trace into one or more containers."""
    boxes: list[BoxIn]
    containers: list[ContainerIn] | None = None  # None → single 20ft TEU default
    algorithm: str = "algo1"     # ordering to trace (see packing_algos/registry.py)
    lashing: bool = False          # False → apply the flat constraint (last container)

# SECOND FEATURE
# ── Pallet packing (single-SKU layer-pattern optimizer) ─────────────────────────
# Independent of the container packing contract above — see backend/pallet_packing/.

class PalletBoxIn(BaseModel):
    """The single carton type to pack onto a pallet (dimensions in cm)."""
    id: str
    label: str
    w: float
    h: float
    d: float
    quantity: int
    rotationAllowed: bool = True  # controls which dim may point up (see pattern.py)
    stacking: bool = True         # False → a single layer only


class PalletSpecIn(BaseModel):
    """Which pallet to pack onto. Wp/Dp/max_height override the preset (required
    for CUSTOM, optional otherwise); cm throughout."""
    key: str
    Wp: float | None = None
    Dp: float | None = None
    max_height: float | None = None


class PalletPlacementOut(BaseModel):
    """Resting position + dims of one carton on a single pallet (cm)."""
    boxId: str
    x: float
    y: float   # carton floor (deck top for the bottom layer), never floating
    z: float
    w: float
    h: float
    d: float


class PalletUsed(BaseModel):
    """The resolved pallet dimensions, returned so the frontend can render the
    deck and load-height guide without duplicating the presets."""
    label: str
    Wp: float
    Dp: float
    deck_h: float
    max_height: float


class PalletPackRequest(BaseModel):
    """Request body for POST /api/pallet/optimize."""
    box: PalletBoxIn
    pallet: PalletSpecIn
    quantity: int


class PalletPackResponse(BaseModel):
    """Response from POST /api/pallet/optimize. `placements` describes ONE full
    pallet; the frontend replicates it across `pallets_needed` and truncates the
    last to `last_pallet_count`."""
    placements: list[PalletPlacementOut]
    per_layer: int
    layers: int
    per_pallet: int
    pallets_needed: int
    last_pallet_count: int
    footprint_util: float
    height_util: float
    volume_util: float
    pallet: PalletUsed

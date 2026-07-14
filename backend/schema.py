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
    algorithm: str = "guillotine"  # packer key (see algorithms/registry.py); optional for back-compat
    lashing: bool = False        # True → load is lashed/secured, so skip the flat
                                 # last-container re-pack and stack tall (depth-first)


class OptimizeResponse(BaseModel):
    """Response from POST /api/optimize."""
    containers: list[ContainerResult]    # per-container packing results
    containers_used: list[ContainerUsed] # which containers were chosen (for 3D rendering)
    total_cost: float
    container_summary: str               # e.g. "1× 40ft FEU" or "2× 20ft TEU"
    all_packed: bool                     # False if some boxes exceeded the cost cap


# ── Save plan ──────────────────────────────────────────────────────────────────

class SavePlanRequest(BaseModel):
    """Request body for POST /api/save-plan — write an exported workbook to a
    local folder (e.g. a OneDrive-synced directory; the sync client uploads it)."""
    folder: str        # absolute path of the target folder (must already exist)
    filename: str      # workbook name, e.g. "picklist-2026-07-14.xlsx" (basename only)
    data_base64: str   # xlsx bytes, base64-encoded


class SavePlanResponse(BaseModel):
    """Response from POST /api/save-plan."""
    saved_path: str    # absolute path of the file that was written


# ── Visualizer trace ───────────────────────────────────────────────────────────

class TraceRequest(BaseModel):
    """Request body for POST /api/trace — boxes to step-trace into one or more containers."""
    boxes: list[BoxIn]
    containers: list[ContainerIn] | None = None  # None → single 20ft TEU default
    algorithm: str = "guillotine"  # "guillotine" | "algo2" — ordering to trace
    lashing: bool = False          # False → apply the flat constraint (last container)

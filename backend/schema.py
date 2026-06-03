from pydantic import BaseModel


# ── Inbound ────────────────────────────────────────────────────────────────────

class ContainerIn(BaseModel):
    id: str
    w: float   # cross-section width  (X axis, cm)
    h: float   # height               (Y axis, cm)
    d: float   # depth / length       (Z axis, cm) — z=0 is back wall, z=d is door


class BoxIn(BaseModel):
    id: str
    label: str
    w: float
    h: float
    d: float
    quantity: int
    colorIndex: int


class PackRequest(BaseModel):
    containers: list[ContainerIn]
    boxes: list[BoxIn]


# ── Outbound ───────────────────────────────────────────────────────────────────

class PlacementOut(BaseModel):
    boxId: str
    x: float
    y: float   # resting floor — always gravity-settled, never floating
    z: float   # z=0 is back wall; placements increase toward door (z=d)
    w: float
    h: float
    d: float


class ContainerResult(BaseModel):
    containerId: str
    placements: list[PlacementOut]   # sorted by centre-z asc (back → door)
    utilization: float               # 0.0–1.0


class PackResponse(BaseModel):
    containers: list[ContainerResult]


# ── Optimizer ──────────────────────────────────────────────────────────────────

class ContainerUsed(BaseModel):
    """A container that the optimizer selected, returned so the frontend can
    render it in 3D without needing to know the preset dimensions itself."""
    id: str
    label: str
    w: float
    h: float
    d: float


class OptimizeRequest(BaseModel):
    boxes: list[BoxIn]
    available_types: list[str]   # subset of ['20ft', '40ft']


class OptimizeResponse(BaseModel):
    containers: list[ContainerResult]    # per-container packing results
    containers_used: list[ContainerUsed] # which containers were chosen (for 3D rendering)
    total_cost: float
    container_summary: str               # e.g. "1× 40ft FEU" or "2× 20ft TEU"
    all_packed: bool                     # False if some boxes exceeded the cost cap

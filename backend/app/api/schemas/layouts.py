from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from app.api.schemas.base import ApiModel
from app.domain.layout.models import EdgeKind, LayoutTemplate, NodeKind, RackOrientation, RouteKey, ZoneKind
from app.service.layouts.service import LayoutView

API_PREFIX = "/api/v1"

Point = tuple[float, float]


class Zone(ApiModel):
    id: str
    kind: ZoneKind
    name: str
    polygon: list[Point] = Field(min_length=3)
    capacity: int | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


class Rack(ApiModel):
    id: str
    polygon: list[Point]
    levels: int = 1
    orientation: RackOrientation = RackOrientation.VERTICAL
    slots: int | None = None


class LayoutNode(ApiModel):
    id: str
    x: float
    y: float
    kind: NodeKind
    zone_id: str | None = None
    capacity: int | None = None
    label: str | None = None


class LayoutEdge(ApiModel):
    id: str
    from_: str = Field(alias="from")
    to: str
    length_m: float
    width_m: float
    capacity: int
    one_way: bool = False
    kind: EdgeKind = EdgeKind.RACK_AISLE
    speed_limit_mps: float | None = None

    model_config = ApiModel.model_config | {"populate_by_name": True}


class LayoutRoute(ApiModel):
    key: RouteKey
    name: str
    value_m: float
    pairs: int


class LayoutStats(ApiModel):
    avg_route_m: dict[str, float] = Field(default_factory=dict)
    routes: list[LayoutRoute] = Field(default_factory=list)
    min_aisle_width_m: float | None = None
    rack_slots_total: int = 0
    chargers: int = 0
    pick_stations: int = 0
    docks_in: int = 0
    docks_out: int = 0
    pods: int = 0
    nodes: int = 0
    edges: int = 0


class DerivationInput(ApiModel):
    key: str
    name: str
    value: float
    unit: str | None = None
    kind: str


class LayoutDerivationStep(ApiModel):
    key: str
    name: str
    value: float
    unit: str | None = None
    formula: str
    formula_rendered: str
    inputs: list[DerivationInput]


class LayoutGenerator(ApiModel):
    template: str | None = None
    seed: int | None = None
    overrides: dict[str, float] = Field(default_factory=dict)
    params: dict[str, float] = Field(default_factory=dict)
    project_version: int | None = None


class FileRef(ApiModel):
    url: str
    filename: str
    content_type: str
    size_bytes: int
    expires_at: datetime | None = None


class Layout(ApiModel):
    id: UUID
    project_id: UUID
    version: int
    template: LayoutTemplate | None
    width_m: float
    height_m: float
    background_image: FileRef | None
    background_scale_m_per_px: float | None
    zones: list[Zone]
    racks: list[Rack]
    nodes: list[LayoutNode]
    edges: list[LayoutEdge]
    generated: bool
    generator: LayoutGenerator
    stats: LayoutStats
    derivation: list[LayoutDerivationStep]
    warnings: list[str]
    params_changed: bool
    updated_at: datetime

    @classmethod
    def from_view(cls, view: LayoutView) -> "Layout":
        layout, background = view.layout, view.background
        return cls(
            id=layout.id,
            project_id=layout.project_id,
            version=layout.version,
            template=LayoutTemplate(layout.template) if layout.template else None,
            width_m=layout.width_m,
            height_m=layout.height_m,
            background_image=FileRef(
                url=f"{API_PREFIX}/projects/{layout.project_id}/layout/background",
                filename=background.filename,
                content_type=background.content_type,
                size_bytes=background.size_bytes,
            )
            if background is not None
            else None,
            background_scale_m_per_px=layout.background_scale_m_per_px,
            zones=[Zone.model_validate(z) for z in layout.zones],
            racks=[Rack.model_validate(r) for r in layout.racks],
            nodes=[LayoutNode.model_validate(n) for n in layout.nodes],
            edges=[LayoutEdge.model_validate(e) for e in layout.edges],
            generated=layout.generated,
            generator=LayoutGenerator.model_validate(layout.generator),
            stats=LayoutStats.model_validate(layout.stats),
            derivation=[LayoutDerivationStep.model_validate(d) for d in layout.derivation],
            warnings=layout.warnings,
            params_changed=view.params_changed,
            updated_at=layout.updated_at,
        )


class LayoutGenerateRequest(ApiModel):
    template: LayoutTemplate | None = None
    seed: int | None = None
    overrides: dict[str, float] = Field(default_factory=dict)


class LayoutUpdate(ApiModel):
    zones: list[Zone] | None = None
    racks: list[Rack] | None = None
    nodes: list[LayoutNode] | None = None
    edges: list[LayoutEdge] | None = None
    background_scale_m_per_px: float | None = Field(default=None, gt=0)

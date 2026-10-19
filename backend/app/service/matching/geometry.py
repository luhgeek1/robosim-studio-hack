from app.domain.layout.models import NodeKind, ZoneKind
from app.domain.reference import ProcessDef, SizingModel
from app.engine.layout import Plan
from app.engine.layout.clearance import required_passage_m
from app.engine.layout.graph import in_zones, pallet_edges
from app.engine.matching import CandidateResult, CandidateStatus, Reason, Severity
from app.engine.simulation.models import SimulationError
from app.engine.simulation.network import Network
from app.engine.trace import Book
from app.service.matching.candidates import CandidateData

TRANSPORT_MODELS = {SizingModel.TRANSPORT_CYCLE, SizingModel.TOW_TRAIN, SizingModel.ELEVATOR_CYCLE}


def check_geometry(
    result: CandidateResult,
    data: CandidateData,
    process: ProcessDef,
    plan: Plan | None,
    norms: Book,
    cargo_width_mm: float = 0.0,
) -> None:
    """Transport candidates must reach their service points on the actual edited graph."""
    if plan is None or data.sizing_model not in TRANSPORT_MODELS or result.status == CandidateStatus.EXCLUDED:
        return
    required = required_passage_m(data.specs, norms, cargo_width_mm)
    if required <= 0:
        return  # Missing catalogue dimensions are already reported by the hard checks.
    points = {n.id for n in plan.nodes if n.kind == NodeKind.CHARGER}
    spec = process.simulation or {}
    if spec.get("sources"):
        zones = frozenset(ZoneKind(k) for k in f"{spec['sources']},{spec['destinations']}".split(","))
        points.update(
            n.id for kind in (NodeKind.PICKUP, NodeKind.DROPOFF) for n in in_zones(plan, zones, kind)
        )
    else:
        points.update(
            n.id for n in plan.nodes if n.kind in {NodeKind.RACK_FACE, NodeKind.DOCK_IN, NodeKind.DOCK_OUT}
        )
    try:
        Network(plan, [], pallet_edges(plan)).for_width(required).require_connected(
            points, process.name, required
        )
    except SimulationError as exc:
        result.status = CandidateStatus.EXCLUDED
        result.reasons.insert(0, Reason("LAYOUT_ROUTE_BLOCKED", str(exc), Severity.BLOCKING))

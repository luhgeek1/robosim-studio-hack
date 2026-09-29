import math

from app.domain.layout.models import EdgeKind, NodeKind, ZoneKind
from app.engine.layout.builder import Aisle, PlanBuilder
from app.engine.layout.dimensions import MM_PER_M, Inputs
from app.engine.layout.models import Plan
from app.engine.trace import Quantity, Section, Tracer

HALF = 0.5
QUARTER = 0.25


class Sketch:
    """Common part of the schematic generators: traced steps, the builder and the robot headway rule."""

    def __init__(self, inputs: Inputs, tracer: Tracer) -> None:
        self.inp = inputs
        self.tr = tracer
        self.warnings: list[str] = []

    def draw(self) -> Plan:
        raise NotImplementedError

    def rec(
        self, key: str, name: str, value: float, unit: str | None, formula: str, inputs: list[Quantity]
    ) -> Quantity:
        return self.tr.record(key, name, value, unit, formula, inputs, Section.LAYOUT).as_quantity()

    def builder(self, width: float, height: float) -> PlanBuilder:
        vehicle = self.inp.norm("layout_loaded_vehicle_width_m")
        clearance = self.inp.norm("aisle_safety_clearance_mm")
        two_way = 2 * vehicle.value + clearance.value / MM_PER_M
        return PlanBuilder(width, height, self.inp.norm("layout_robot_headway_m").value, two_way)

    def chargers(self) -> int:
        places = self.inp.override("chargers") or self.inp.norm("layout_default_charger_slots")
        return max(1, int(places.value))

    @staticmethod
    def charging_room(
        b: PlanBuilder, aisle: Aisle, box: tuple[float, float, float, float], count: int, door_y: float
    ) -> None:
        zone = b.zone(ZoneKind.CHARGING, "Зарядка роботов", box, capacity=count)
        pitch = (box[2] - box[0]) / count
        for k in range(count):
            x = box[0] + (k + HALF) * pitch
            node = b.node(x, door_y, NodeKind.CHARGER, zone=zone, capacity=1, label=f"Зарядка {k + 1}")
            b.edge(node, aisle.stop(x), aisle.width, EdgeKind.CORRIDOR)


def ceil_div(a: float, b: float) -> int:
    return max(1, math.ceil(a / b))

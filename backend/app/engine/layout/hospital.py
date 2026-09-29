import math

from app.domain.layout.models import EdgeKind, NodeKind, ZoneKind
from app.engine.layout.builder import Aisle
from app.engine.layout.models import LayoutError, Plan
from app.engine.layout.sketch import HALF, QUARTER, Sketch

REQUIRED_PARAMS = ("floors", "elevators", "corridor_width_m", "kitchen_to_ward_distance_m", "meal_points")
ROOMS_PER_SIDE = 3
# Service rooms along the service corridor, far end first; the charging room is the last bottom slot.
TOP_ROOMS = ((ZoneKind.KITCHEN, "Пищеблок"), (ZoneKind.PHARMACY, "Аптека"), (ZoneKind.LAB, "Лаборатория"))
BOTTOM_ROOMS = ((ZoneKind.LAUNDRY, "Прачечная"), (ZoneKind.WASTE, "Накопитель отходов"))


class HospitalSketch(Sketch):
    """The service floor, the lift hall and one typical ward floor, drawn in a row along one corridor.

    Ward floors repeat each other, so one stands for all of them: the floors are in the lift ride (the same
    formula as the cycle model), and the service corridor is as long as the measured kitchen-to-ward route.
    """

    def draw(self) -> Plan:
        """Derives the corridor lengths, then draws."""
        missing = [key for key in REQUIRED_PARAMS if self.inp.params.optional(key) is None]
        if missing:
            raise LayoutError(
                "Для планировки не хватает параметров объекта",
                [{"field": f"params.{key}", "message": "Не задан"} for key in missing],
            )
        inp = self.inp
        corridor = inp.param("corridor_width_m").value
        depth = inp.norm("layout_hospital_room_depth_m")
        frontage = inp.norm("layout_hospital_room_frontage_m")
        floors, points = inp.param("floors"), inp.param("meal_points")
        ward_floors = self.rec(
            "ward_floors",
            "Этажей с отделениями",
            max(1.0, floors.value - 1),
            "эт",
            "max(1, floors − 1)",
            [floors],
        )
        wards = self.rec(
            "wards_per_floor",
            "Отделений (точек выдачи) на типовом этаже",
            float(math.ceil(points.value / ward_floors.value)),
            "шт",
            "⌈meal_points / ward_floors⌉",
            [points, ward_floors],
        )
        count = int(wards.value)
        f, d = frontage.value, depth.value
        ward_leg = self.rec(
            "ward_leg_m",
            "Средний путь от лифта до точки выдачи на этаже отделений",
            d * QUARTER + sum((j // 2 + HALF) * f for j in range(count)) / count + corridor * HALF,
            "м",
            "¼ × layout_hospital_room_depth_m + среднее по отделениям (номер пары + ½) × "
            "layout_hospital_room_frontage_m + ½ × corridor_width_m",
            [depth, frontage, wards],
        )
        route = inp.param("kitchen_to_ward_distance_m")
        slots = [*range(len(TOP_ROOMS)), *range(len(BOTTOM_ROOMS))]
        doors = sum((k + HALF) * f for k in slots) / len(slots)
        wanted = route.value - ward_leg.value - corridor * HALF - d * QUARTER + doors
        rooms = ROOMS_PER_SIDE * f
        if wanted < rooms:
            self.warnings.append(
                f"Маршрут «пищеблок → отделение» {route.value:g} м короче, чем помещается на схеме: "
                f"коридор служебного этажа взят по длине помещений, {rooms:g} м"
            )
        hall_x = self.rec(
            "service_corridor_m",
            "Коридор служебного этажа от дальних помещений до лифтового холла",
            max(rooms, wanted),
            "м",
            "max(3 × layout_hospital_room_frontage_m, kitchen_to_ward_distance_m − ward_leg_m − "
            "½ × corridor_width_m − ¼ × layout_hospital_room_depth_m + среднее положение дверей служб)",
            [route, ward_leg, frontage, depth],
        ).value
        return self._draw(hall_x, count, corridor, f, d)

    def _draw(self, hall_x: float, count: int, corridor: float, f: float, d: float) -> Plan:
        floors = self.inp.param("floors")
        lifts = max(1, int(self.inp.param("elevators").value))
        ward_x = hall_x + d
        width = ward_x + math.ceil(count / 2) * f
        height = 2 * d + corridor
        cy = d + corridor * HALF
        b = self.builder(width, height)
        service = Aisle(
            b,
            cy,
            corridor,
            EdgeKind.CORRIDOR,
            b.zone(ZoneKind.CORRIDOR, "Коридор служебного этажа (1-й этаж)", (0, d, hall_x, d + corridor)),
        )
        for k, (kind, name) in enumerate(TOP_ROOMS):
            self._room(service, kind, name, (k * f, 0, (k + 1) * f, d), d, NodeKind.PICKUP)
        for k, (kind, name) in enumerate(BOTTOM_ROOMS):
            self._room(
                service, kind, name, (k * f, d + corridor, (k + 1) * f, height), d + corridor, NodeKind.PICKUP
            )
        k = len(BOTTOM_ROOMS)
        self.charging_room(
            b, service, (k * f, d + corridor, (k + 1) * f, height), self.chargers(), d + corridor
        )
        hall = b.zone(
            ZoneKind.ELEVATOR,
            f"Лифтовой холл · лифтов {lifts}, этажей {int(floors.value)}",
            (hall_x, 0, ward_x, height),
            capacity=lifts,
        )
        low = b.node(
            hall_x + d * QUARTER, cy, NodeKind.ELEVATOR, zone=hall, capacity=lifts, label="Лифт, 1-й этаж"
        )
        high = b.node(
            ward_x - d * QUARTER,
            cy,
            NodeKind.ELEVATOR,
            zone=hall,
            capacity=lifts,
            label="Лифт, этажи отделений",
        )
        b.edge(service.stop(hall_x), low, corridor, EdgeKind.CORRIDOR)
        b.edge(low, high, corridor, EdgeKind.ELEVATOR_LINK)
        ward = Aisle(
            b,
            cy,
            corridor,
            EdgeKind.CORRIDOR,
            b.zone(
                ZoneKind.CORRIDOR,
                f"Коридор типового этажа отделений (этажи 2–{int(floors.value)})",
                (ward_x, d, width, d + corridor),
            ),
        )
        b.edge(high, ward.stop(ward_x), corridor, EdgeKind.CORRIDOR)
        for j in range(count):
            x0 = ward_x + (j // 2) * f
            top = j % 2 == 0
            box = (x0, 0.0, x0 + f, d) if top else (x0, d + corridor, x0 + f, height)
            self._room(
                ward, ZoneKind.WARD, f"Отделение {j + 1}", box, d if top else d + corridor, NodeKind.DROPOFF
            )
        service.close()
        ward.close()
        return b.plan()

    def _room(
        self,
        aisle: Aisle,
        kind: ZoneKind,
        name: str,
        box: tuple[float, float, float, float],
        door_y: float,
        node_kind: NodeKind,
    ) -> None:
        b = aisle.builder
        zone = b.zone(kind, name, box)
        x = (box[0] + box[2]) * HALF
        node = b.node(x, door_y, node_kind, zone=zone, capacity=1, label=name)
        b.edge(node, aisle.stop(x), aisle.width, EdgeKind.CORRIDOR)

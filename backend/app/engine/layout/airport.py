import math

from app.domain.layout.models import EdgeKind, NodeKind, ZoneKind
from app.engine.layout.builder import Aisle, PlanBuilder
from app.engine.layout.models import LayoutError, Plan
from app.engine.layout.sketch import HALF, QUARTER, Sketch

REQUIRED_PARAMS = ("gates", "terminals", "baggage_carousels", "baggage_route_length_m")


class AirportSketch(Sketch):
    """A pier: the terminal with its gates, contact stands along the apron service road, the baggage sorting
    hall above the terminal joined to the road by a tunnel, the cart and waste hub by the terminal corridor.

    The tunnel is as long as the measured sorting-to-stand route needs; the plan never shortens a route
    below what its stands and gates take, and says so.
    """

    def draw(self) -> Plan:
        """Derives the pier and the tunnel, then draws from the terminal band down to the stands."""
        missing = [key for key in REQUIRED_PARAMS if self.inp.params.optional(key) is None]
        if missing:
            raise LayoutError(
                "Для планировки не хватает параметров объекта",
                [{"field": f"params.{key}", "message": "Не задан"} for key in missing],
            )
        inp = self.inp
        gates, carousels = inp.param("gates"), inp.param("baggage_carousels")
        frontage, depth = (
            inp.norm("layout_airport_stand_frontage_m"),
            inp.norm("layout_airport_stand_depth_m"),
        )
        road, terminal = inp.norm("layout_airport_road_width_m"), inp.norm("layout_airport_terminal_depth_m")
        pitch = inp.norm("layout_airport_makeup_pitch_m")
        count, positions = max(1, int(gates.value)), max(1, int(carousels.value))
        pier = self.rec(
            "pier_length_m",
            "Длина пирса: контактные стоянки по числу выходов",
            count * frontage.value,
            "м",
            "gates × layout_airport_stand_frontage_m",
            [gates, frontage],
        )
        f = frontage.value
        mid = pier.value * HALF
        hall = positions * pitch.value
        ramp_x = mid - hall * HALF
        stand_leg = self.rec(
            "stand_leg_m",
            "Средний путь по служебной дороге от тоннеля до стоянки",
            sum(abs((k + HALF) * f - ramp_x) for k in range(count)) / count + road.value * HALF,
            "м",
            "среднее |положение стоянки − положение тоннеля| + ½ × layout_airport_road_width_m",
            [frontage, gates, road],
        )
        sort_leg = self.rec(
            "sorting_leg_m",
            "Средний путь от позиции комплектации до тоннеля",
            sum(abs((i - (positions - 1) * HALF) * pitch.value) for i in range(positions)) / positions
            + pitch.value * HALF,
            "м",
            "среднее |смещение позиции| + ½ × layout_airport_makeup_pitch_m",
            [pitch, carousels],
        )
        route = inp.param("baggage_route_length_m")
        crossing = terminal.value + road.value * HALF
        wanted = route.value - stand_leg.value - sort_leg.value
        if wanted < crossing:
            self.warnings.append(
                f"Маршрут «сортировка → стоянка» {route.value:g} м короче, чем дают стоянки и терминал: "
                f"тоннель взят по ширине терминала, средний маршрут на схеме длиннее"
            )
        tunnel = self.rec(
            "tunnel_m",
            "Тоннель багажа от сортировки до служебной дороги",
            max(crossing, wanted),
            "м",
            "max(layout_airport_terminal_depth_m + ½ × layout_airport_road_width_m, "
            "baggage_route_length_m − stand_leg_m − sorting_leg_m)",
            [route, stand_leg, sort_leg, terminal, road],
        ).value
        yt = max(tunnel - crossing + pitch.value, terminal.value * HALF)
        width = pier.value + f
        height = yt + terminal.value + road.value + depth.value
        b = self.builder(width, height)
        road_y = yt + terminal.value + road.value * HALF
        corridor = self._terminal(b, count, yt, road.value)
        apron = Aisle(
            b,
            road_y,
            road.value,
            EdgeKind.MAIN_AISLE,
            b.zone(
                ZoneKind.CORRIDOR,
                "Служебная дорога перрона",
                (0, yt + terminal.value, width, yt + terminal.value + road.value),
            ),
        )
        stand_top = yt + terminal.value + road.value
        for k in range(count):
            x0 = k * f
            zone = b.zone(ZoneKind.APRON, f"Стоянка ВС {k + 1}", (x0, stand_top, x0 + f, height))
            node = b.node(
                x0 + f * HALF, stand_top, NodeKind.DROPOFF, zone=zone, capacity=1, label=f"МС {k + 1}"
            )
            b.edge(node, apron.stop(x0 + f * HALF), road.value, EdgeKind.CORRIDOR)
        self.charging_room(b, apron, (pier.value, stand_top, width, height), self.chargers(), stand_top)
        self._sorting(b, apron, corridor, (ramp_x, hall, yt + crossing - tunnel, pitch.value, positions))
        self._hub(b, corridor, (mid, f, yt, terminal.value, count))
        corridor.close()
        apron.close()
        return b.plan()

    def _terminal(self, b: PlanBuilder, count: int, yt: float, width: float) -> Aisle:
        """Terminal buildings split the pier evenly; one service corridor runs behind all the gates."""
        inp = self.inp
        f = inp.norm("layout_airport_stand_frontage_m").value
        depth = inp.norm("layout_airport_terminal_depth_m").value
        terminals = max(1, int(inp.param("terminals").value))
        per = math.ceil(count / terminals)
        for t in range(terminals):
            x0, x1 = t * per * f, min(count, (t + 1) * per) * f
            if x1 > x0:
                b.zone(ZoneKind.TERMINAL, f"Терминал {t + 1}", (x0, yt, x1, yt + depth * HALF))
        y = yt + depth * QUARTER
        strip = b.zone(
            ZoneKind.CORRIDOR,
            "Служебный коридор терминала",
            (0, y - width * HALF, count * f, y + width * HALF),
        )
        corridor = Aisle(b, y, width, EdgeKind.CORRIDOR, strip)
        for k in range(count):
            x0 = k * f
            zone = b.zone(ZoneKind.GATE, f"Выход {k + 1}", (x0, yt + depth * HALF, x0 + f, yt + depth))
            node = b.node(
                x0 + f * HALF,
                yt + depth * HALF,
                NodeKind.PICKUP,
                zone=zone,
                capacity=1,
                label=f"Выход {k + 1}",
            )
            b.edge(node, corridor.stop(x0 + f * HALF), width, EdgeKind.CORRIDOR)
        return corridor

    @staticmethod
    def _sorting(
        b: PlanBuilder, apron: Aisle, corridor: Aisle, spec: tuple[float, float, float, float, int]
    ) -> None:
        ramp_x, hall, aisle_y, pitch, positions = spec
        zone = b.zone(
            ZoneKind.BUFFER,
            "Сортировка багажа",
            (ramp_x - hall * HALF, aisle_y - pitch * HALF, ramp_x + hall * HALF, aisle_y + pitch * HALF),
            capacity=positions,
        )
        aisle = Aisle(b, aisle_y, pitch, EdgeKind.CORRIDOR, zone)
        for i in range(positions):
            x = ramp_x + (i - (positions - 1) * HALF) * pitch
            node = b.node(
                x,
                aisle_y - pitch * HALF,
                NodeKind.PICKUP,
                zone=zone,
                capacity=1,
                label=f"Комплектация {i + 1}",
            )
            b.edge(node, aisle.stop(x), pitch, EdgeKind.CORRIDOR)
        # The tunnel passes under the terminal: it meets the service corridor so every point stays reachable.
        top, under, foot = aisle.stop(ramp_x), corridor.stop(ramp_x), apron.stop(ramp_x)
        b.edge(top, under, apron.width, EdgeKind.RAMP)
        b.edge(under, foot, apron.width, EdgeKind.RAMP)
        aisle.close()

    def _hub(self, b: PlanBuilder, corridor: Aisle, spec: tuple[float, float, float, float, int]) -> None:
        """One hub in the middle of the pier; a measured terminal route shorter than half the gates is
        not reachable on this plan, and the plan says so instead of bending it."""
        mid, f, yt, depth, count = spec
        measured = self.inp.optional("terminal_route_length_m")
        drawn = sum(abs((k + HALF) * f - mid - f * HALF) for k in range(count)) / count + depth * HALF
        if measured is not None and drawn > measured.value:
            self.warnings.append(
                f"Маршрут «выход → накопитель» на схеме {drawn:.0f} м длиннее оценки {measured.value:g} м: "
                "выходы стоят в один ряд вдоль пирса"
            )
        zone = b.zone(ZoneKind.WASTE, "Накопитель тележек и отходов", (mid, yt - depth * HALF, mid + f, yt))
        x = mid + f * HALF
        node = b.node(x, yt, NodeKind.DROPOFF, zone=zone, capacity=1, label="Накопитель")
        b.edge(node, corridor.stop(x), corridor.width, EdgeKind.CORRIDOR)

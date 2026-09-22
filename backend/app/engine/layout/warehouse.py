import math
from dataclasses import dataclass

from app.domain.layout.models import EdgeKind, NodeKind, ZoneKind
from app.engine.layout.builder import Aisle, PlanBuilder
from app.engine.layout.dimensions import Dims
from app.engine.layout.models import LayoutError, Plan

HALF = 0.5


@dataclass(frozen=True, slots=True)
class PodField:
    columns: int
    rows: int
    pods: int


class WarehouseDrawer:
    """Places zones, racks and the route graph of a warehouse from derived dimensions.

    Coordinates: x along the dock facade, y from the back wall (0) to the dock wall (height).
    """

    def __init__(self, dims: Dims) -> None:
        self.d = dims
        self.b = PlanBuilder(dims.width, dims.height, dims.headway, dims.two_way_width)
        self.warnings: list[str] = []
        self.pods = PodField(0, 0, 0)
        self.stations_placed = 0

    def draw(self) -> Plan:
        d, b = self.d, self.b
        dock_y = d.height - d.staging - d.main * HALF
        top_y = d.band_top - d.main * HALF
        dock_zone = b.zone(
            ZoneKind.CORRIDOR, "Проезд вдоль ворот", (0, d.band_bottom, d.width, d.band_bottom + d.main)
        )
        top_zone = b.zone(
            ZoneKind.CORRIDOR,
            "Проезд вдоль ворот отгрузки" if d.flow_through else "Задний проезд",
            (0, d.band_top - d.main, d.width, d.band_top),
        )
        dock_aisle = Aisle(b, dock_y, d.main, EdgeKind.MAIN_AISLE, dock_zone)
        top_aisle = Aisle(b, top_y, d.main, EdgeKind.MAIN_AISLE, top_zone)
        self._storage(dock_aisle, top_aisle)
        self._picking(dock_aisle, top_aisle)
        self._staging(dock_aisle, top_aisle)
        dock_aisle.close()
        top_aisle.close()
        return b.plan()

    def _cross_aisles(self) -> list[Aisle]:
        d, b = self.d, self.b
        aisles: list[Aisle] = []
        for j in range(d.cross_aisles):
            y0 = d.band_top + (j + 1) * d.segment + j * d.main
            zone = b.zone(
                ZoneKind.CORRIDOR, f"Поперечный проезд {j + 1}", (0, y0, d.block_width, y0 + d.main)
            )
            aisles.append(Aisle(b, y0 + d.main * HALF, d.main, EdgeKind.MAIN_AISLE, zone))
        return aisles

    def _storage(self, dock_aisle: Aisle, top_aisle: Aisle) -> None:
        d, b = self.d, self.b
        per_bay = d.pallets_per_bay_level * d.levels
        storage = b.zone(
            ZoneKind.STORAGE,
            "Хранение",
            (0, d.band_top, d.block_width, d.band_bottom),
            capacity=2 * d.aisles * d.bays_per_segment * (d.cross_aisles + 1) * per_bay,
            levels=d.levels,
            aisles=d.aisles,
        )
        cross = self._cross_aisles()
        double = 2 * d.rack_depth + d.flue
        x = 0.0
        runs = [d.band_top + j * (d.segment + d.main) for j in range(d.cross_aisles + 1)]
        run_length = d.bays_per_segment * d.bay_pitch
        for i in range(d.aisles):
            self._racks(x, x + d.rack_depth, runs, run_length, per_bay)
            x += d.rack_depth
            centre = x + d.aisle * HALF
            path = [top_aisle.stop(centre)]
            for j, y0 in enumerate(runs):
                for bay in range(d.bays_per_segment):
                    path.append(
                        b.node(
                            centre,
                            y0 + (bay + HALF) * d.bay_pitch,
                            NodeKind.RACK_FACE,
                            zone=storage,
                            capacity=2 * per_bay,
                        )
                    )
                if j < len(cross):
                    path.append(cross[j].stop(centre))
            path.append(dock_aisle.stop(centre))
            b.chain(path, d.aisle, EdgeKind.RACK_AISLE)
            x += d.aisle
            if i < d.aisles - 1:
                self._racks(x, x + d.rack_depth, runs, run_length, per_bay)
                x += double - d.rack_depth
        self._racks(x, x + d.rack_depth, runs, run_length, per_bay)
        for aisle in cross:
            aisle.close()

    def _racks(self, x0: float, x1: float, runs: list[float], length: float, per_bay: int) -> None:
        for y0 in runs:
            self.b.rack((x0, y0, x1, y0 + length), self.d.levels, self.d.bays_per_segment * per_bay)

    def _picking(self, dock_aisle: Aisle, top_aisle: Aisle) -> None:
        """Pod field between two rows of stations, one along each main aisle: pods travel from both ends."""
        d, b = self.d, self.b
        x0, width = d.block_width, d.width - d.block_width
        lane = d.pod_pitch
        column = d.pod_block_width * d.pod_pitch + lane
        row = d.pod_block_length * d.pod_pitch + lane
        field_top, field_bottom = d.band_top + d.station_depth, d.band_bottom - d.station_depth
        columns = math.floor((width - lane) / column)
        rows = math.floor((field_bottom - field_top - lane) / row)
        if d.stations == 0 or columns < 1 or rows < 1:
            if d.stations:
                self.warnings.append("Зона отбора не поместилась: маршрут G2P берётся по нормативу")
            return
        per_row = math.floor(width / d.station_pitch)
        wanted = (math.ceil(d.stations / 2), d.stations // 2)
        placed = (min(wanted[0], per_row), min(wanted[1], per_row))
        if sum(placed) < d.stations:
            self.warnings.append(
                f"Вдоль зоны отбора помещается {sum(placed)} из {d.stations} станций"
                " — остальные ставить в третий ряд"
            )
        zone = b.zone(ZoneKind.PICKING, "Отбор товар-к-человеку", (x0, field_top, d.width, field_bottom))
        xs = [x0 + lane * HALF + i * column for i in range(columns + 1)]
        ys = [field_top + lane * HALF + j * row for j in range(rows + 1)]
        grid = self._pod_field(zone, xs, ys, columns, rows)
        rows_of_stations = (
            (placed[0], d.band_bottom - d.station_depth, dock_aisle, rows),
            (placed[1], d.band_top, top_aisle, 0),
        )
        number = 0
        for count, y0, aisle, lattice_row in rows_of_stations:
            if count == 0:
                continue
            strip = b.zone(
                ZoneKind.STATION, "Станции отбора", (x0, y0, d.width, y0 + d.station_depth), capacity=count
            )
            for k in range(count):
                number += 1
                x = x0 + (k + HALF) * d.station_pitch
                station = b.node(
                    x,
                    y0 + d.station_depth * HALF,
                    NodeKind.PICK_STATION,
                    zone=strip,
                    capacity=1,
                    label=f"Станция {number}",
                )
                nearest = min(range(len(xs)), key=lambda i: abs(xs[i] - x))
                b.edge(station, grid[nearest][lattice_row], lane, EdgeKind.CORRIDOR)
                b.edge(station, aisle.stop(x), d.main, EdgeKind.CORRIDOR)
        self.stations_placed = number

    def _pod_field(
        self, zone: str, xs: list[float], ys: list[float], columns: int, rows: int
    ) -> list[list[str]]:
        """Lanes between blocks of pods; a pickup node on a lane stands for the pods on both its sides."""
        d, b = self.d, self.b
        lane, row = d.pod_pitch, d.pod_block_length * d.pod_pitch + d.pod_pitch
        grid = [[b.node(x, y, NodeKind.WAYPOINT, zone=zone) for y in ys] for x in xs]
        pods = 0
        for i, x in enumerate(xs):
            sides = (i > 0) + (i < columns)
            path: list[str] = []
            for j, y in enumerate(ys):
                path.append(grid[i][j])
                if j < rows:
                    capacity = sides * d.pod_block_length
                    path.append(b.node(x, y + row * HALF, NodeKind.PICKUP, zone=zone, capacity=capacity))
                    pods += capacity
            b.chain(path, lane, EdgeKind.CORRIDOR)
        for j in range(len(ys)):
            b.chain([grid[i][j] for i in range(len(xs))], lane, EdgeKind.CORRIDOR)
        self.pods = PodField(columns, rows, pods)
        return grid

    def _docks(self, aisle: Aisle, count: int, kind: NodeKind, span: tuple[float, float], y: float) -> None:
        d, b = self.d, self.b
        centre = (span[0] + span[1]) * HALF
        prefix = "П" if kind == NodeKind.DOCK_IN else "О"
        for k in range(count):
            x = centre + (k - (count - 1) * HALF) * d.dock_pitch
            dock = b.node(x, y, kind, capacity=1, label=f"Ворота {prefix}{k + 1}")
            b.edge(dock, aisle.stop(x), d.main, EdgeKind.CORRIDOR)

    def _fit(self, widths: list[float], floors: list[float]) -> list[float]:
        """Shrinks flexible widths so the facade fits; docks and chargers keep their minimum."""
        excess = sum(widths) - self.d.width
        if excess <= 0:
            return widths
        slack = [w - f for w, f in zip(widths, floors, strict=True)]
        if sum(slack) < excess:
            raise LayoutError("Ворота и зарядки не помещаются вдоль фасада: уменьшите их число или шаг ворот")
        return [w - s * excess / sum(slack) for w, s in zip(widths, slack, strict=True)]

    def _staging(self, dock_aisle: Aisle, top_aisle: Aisle) -> None:
        d, b = self.d, self.b
        bottom = (d.height - d.staging, d.height)
        dock_y = d.height - d.staging * HALF
        spans_in, spans_out = d.docks_in * d.dock_pitch, d.docks_out * d.dock_pitch
        charging = d.chargers * d.charger_pitch
        if d.flow_through:
            rec, chg = self._fit([max(spans_in, d.block_width), charging], [spans_in, charging])
            b.zone(ZoneKind.RECEIVING, "Приёмка", (0, bottom[0], rec, bottom[1]), capacity=d.docks_in)
            self._docks(dock_aisle, d.docks_in, NodeKind.DOCK_IN, (0, rec), dock_y)
            self._charging(dock_aisle, rec, chg, bottom, dock_y)
            if rec + chg < d.width:
                b.zone(ZoneKind.BUFFER, "Буфер", (rec + chg, bottom[0], d.width, bottom[1]))
            ship = min(d.width, max(spans_out, d.block_width))
            b.zone(ZoneKind.SHIPPING, "Отгрузка", (0, 0, ship, d.staging), capacity=d.docks_out)
            self._docks(top_aisle, d.docks_out, NodeKind.DOCK_OUT, (0, ship), d.staging * HALF)
            self._packing(top_aisle, ship, d.width, (0, d.staging))
            return
        half = d.block_width * HALF
        rec, ship, chg = self._fit(
            [max(spans_in, half), max(spans_out, half), charging], [spans_in, spans_out, charging]
        )
        # Chargers sit between receiving and shipping: the middle of the facade is closest to the whole block.
        b.zone(ZoneKind.RECEIVING, "Приёмка", (0, bottom[0], rec, bottom[1]), capacity=d.docks_in)
        self._docks(dock_aisle, d.docks_in, NodeKind.DOCK_IN, (0, rec), dock_y)
        self._charging(dock_aisle, rec, chg, bottom, dock_y)
        b.zone(
            ZoneKind.SHIPPING,
            "Отгрузка",
            (rec + chg, bottom[0], rec + chg + ship, bottom[1]),
            capacity=d.docks_out,
        )
        self._docks(dock_aisle, d.docks_out, NodeKind.DOCK_OUT, (rec + chg, rec + chg + ship), dock_y)
        self._packing(dock_aisle, rec + chg + ship, d.width, bottom)

    def _charging(self, aisle: Aisle, x0: float, width: float, band: tuple[float, float], y: float) -> None:
        d = self.d
        zone = self.b.zone(
            ZoneKind.CHARGING, "Зарядка роботов", (x0, band[0], x0 + width, band[1]), capacity=d.chargers
        )
        pitch = width / d.chargers
        for k in range(d.chargers):
            x = x0 + (k + HALF) * pitch
            node = self.b.node(x, y, NodeKind.CHARGER, zone=zone, capacity=1, label=f"Зарядка {k + 1}")
            self.b.edge(node, aisle.stop(x), d.main, EdgeKind.CORRIDOR)

    def _packing(self, aisle: Aisle, x0: float, x1: float, band: tuple[float, float]) -> None:
        if x1 - x0 <= 0:
            return
        zone = self.b.zone(ZoneKind.PACKING, "Упаковка и консолидация", (x0, band[0], x1, band[1]))
        node = self.b.node(
            (x0 + x1) * HALF, (band[0] + band[1]) * HALF, NodeKind.DROPOFF, zone=zone, label="Упаковка"
        )
        self.b.edge(node, aisle.stop((x0 + x1) * HALF), self.d.main, EdgeKind.CORRIDOR)

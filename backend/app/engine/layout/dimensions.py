import math
from collections.abc import Mapping
from dataclasses import dataclass

from app.domain.layout.models import LayoutTemplate
from app.engine.layout.models import LayoutError
from app.engine.trace import Book, InputKind, Quantity, Section, Tracer

MM_PER_M = 1000.0
REQUIRED_PARAMS = (
    "area_m2",
    "ceiling_height_m",
    "aisle_width_m",
    "main_aisle_width_m",
    "pallet_positions",
    "pallets_in_per_day",
    "pallets_out_per_day",
    "shifts_per_day",
    "shift_hours",
    "peak_factor",
)
OVERRIDES: dict[str, tuple[str, str]] = {
    "aspect_ratio": ("Соотношение сторон здания", "коэфф."),
    "docks_in": ("Ворот приёмки", "шт"),
    "docks_out": ("Ворот отгрузки", "шт"),
    "pick_stations": ("Станций отбора", "шт"),
    "chargers": ("Мест зарядки", "шт"),
    "cross_aisles": ("Поперечных проездов", "шт"),
}


@dataclass(frozen=True, slots=True)
class Dims:
    template: LayoutTemplate
    width: float
    height: float
    staging: float
    main: float
    aisle: float
    rack_depth: float
    flue: float
    bay_pitch: float
    pallets_per_bay_level: int
    levels: int
    band_top: float
    band_bottom: float
    cross_aisles: int
    segment: float
    bays_per_segment: int
    aisles: int
    block_width: float
    docks_in: int
    docks_out: int
    dock_pitch: float
    stations: int
    station_pitch: float
    station_depth: float
    pod_pitch: float
    pod_block_width: int
    pod_block_length: int
    chargers: int
    charger_pitch: float
    headway: float
    two_way_width: float

    @property
    def flow_through(self) -> bool:
        return self.template == LayoutTemplate.WAREHOUSE_FLOW_THROUGH


class Inputs:
    """Params, norms and generator overrides as traced quantities; remembers what the layout used."""

    def __init__(self, params: Book, norms: Book, overrides: Mapping[str, float]) -> None:
        unknown = sorted(set(overrides) - set(OVERRIDES))
        if unknown:
            raise LayoutError(
                f"Неизвестные переопределения генератора: {', '.join(unknown)}",
                [{"field": f"overrides.{key}", "message": "Неизвестный ключ"} for key in unknown],
            )
        self.params = params
        self.norms = norms
        self.overrides = {
            key: Quantity(
                f"override_{key}",
                f"{OVERRIDES[key][0]} (задано при генерации)",
                value,
                OVERRIDES[key][1],
                InputKind.PARAM,
            )
            for key, value in overrides.items()
        }
        self.used: dict[str, float] = {}

    def _use(self, quantity: Quantity) -> Quantity:
        self.used[quantity.key] = quantity.value
        return quantity

    def param(self, key: str) -> Quantity:
        return self._use(self.params.get(key))

    def optional(self, key: str) -> Quantity | None:
        quantity = self.params.optional(key)
        return self._use(quantity) if quantity is not None else None

    def norm(self, key: str) -> Quantity:
        return self._use(self.norms.get(key))

    def override(self, key: str) -> Quantity | None:
        quantity = self.overrides.get(key)
        return self._use(quantity) if quantity is not None else None


class Deriver:
    def __init__(self, template: LayoutTemplate, inputs: Inputs, tracer: Tracer) -> None:
        missing = [key for key in REQUIRED_PARAMS if inputs.params.optional(key) is None]
        if missing:
            raise LayoutError(
                "Для планировки не хватает параметров объекта",
                [{"field": f"params.{key}", "message": "Не задан"} for key in missing],
            )
        self.template = template
        self.inp = inputs
        self.tr = tracer
        self.warnings: list[str] = []

    def rec(
        self, key: str, name: str, value: float, unit: str | None, formula: str, inputs: list[Quantity]
    ) -> Quantity:
        return self.tr.record(key, name, value, unit, formula, inputs, Section.LAYOUT).as_quantity()

    def building(self) -> tuple[Quantity, Quantity]:
        area = self.inp.param("area_m2")
        aspect = self.inp.override("aspect_ratio") or self.inp.norm("layout_building_aspect_ratio")
        width = self.rec(
            "building_width_m",
            "Длина здания вдоль фасада с воротами",
            math.sqrt(area.value * aspect.value),
            "м",
            f"√(area_m2 × {aspect.key})",
            [area, aspect],
        )
        depth = self.rec(
            "building_depth_m",
            "Глубина здания",
            area.value / width.value,
            "м",
            "area_m2 / building_width_m",
            [area, width],
        )
        return width, depth

    def levels(self) -> Quantity:
        ceiling = self.inp.param("ceiling_height_m")
        clearance, pitch = (
            self.inp.norm("layout_rack_top_clearance_m"),
            self.inp.norm("layout_rack_level_pitch_m"),
        )
        levels = self.rec(
            "rack_levels",
            "Ярусов хранения",
            float(math.floor((ceiling.value - clearance.value) / pitch.value)),
            "шт",
            "⌊(ceiling_height_m − layout_rack_top_clearance_m) / layout_rack_level_pitch_m⌋",
            [ceiling, clearance, pitch],
        )
        if levels.value < 1:
            raise LayoutError("Потолок слишком низкий: не помещается ни одного яруса стеллажей")
        return levels

    def band(self, depth: Quantity) -> tuple[float, float, Quantity]:
        staging, main = self.inp.norm("layout_dock_staging_depth_m"), self.inp.param("main_aisle_width_m")
        if self.template == LayoutTemplate.WAREHOUSE_FLOW_THROUGH:
            value = depth.value - 2 * (staging.value + main.value)
            formula = "building_depth_m − 2 × (layout_dock_staging_depth_m + main_aisle_width_m)"
            top = staging.value + main.value
        else:
            value = depth.value - staging.value - 2 * main.value
            formula = "building_depth_m − layout_dock_staging_depth_m − 2 × main_aisle_width_m"
            top = main.value
        band = self.rec(
            "storage_band_depth_m", "Глубина зоны стеллажей", value, "м", formula, [depth, staging, main]
        )
        if band.value < 2 * self.inp.norm("layout_rack_bay_pitch_m").value:
            raise LayoutError(
                "Здание слишком неглубокое: после зон у ворот и проездов не остаётся места под стеллажи"
            )
        return top, top + band.value, band

    def segments(self, band: Quantity) -> tuple[int, float, int]:
        main, interval = self.inp.param("main_aisle_width_m"), self.inp.norm("layout_cross_aisle_interval_m")
        override = self.inp.override("cross_aisles")
        cross = override or self.rec(
            "cross_aisles",
            "Поперечных проездов в зоне стеллажей",
            float(max(0, math.ceil(band.value / interval.value) - 1)),
            "шт",
            "max(0, ⌈storage_band_depth_m / layout_cross_aisle_interval_m⌉ − 1)",
            [band, interval],
        )
        count = int(cross.value)
        segment = self.rec(
            "rack_run_length_m",
            "Длина ряда стеллажей между проездами",
            (band.value - count * main.value) / (count + 1),
            "м",
            f"(storage_band_depth_m − {cross.key} × main_aisle_width_m) / ({cross.key} + 1)",
            [band, cross, main],
        )
        pitch = self.inp.norm("layout_rack_bay_pitch_m")
        bays = self.rec(
            "bays_per_run",
            "Секций стеллажа в ряду",
            float(math.floor(segment.value / pitch.value)),
            "шт",
            "⌊rack_run_length_m / layout_rack_bay_pitch_m⌋",
            [segment, pitch],
        )
        if bays.value < 1 or segment.value <= 0:
            raise LayoutError("Слишком много поперечных проездов: в ряду не остаётся секций стеллажа")
        return count, segment.value, int(bays.value)

    def per_hour(self, key: str) -> Quantity:
        volume = self.inp.optional(key)
        shifts, hours, peak = (self.inp.param(k) for k in ("shifts_per_day", "shift_hours", "peak_factor"))
        if volume is None:
            return Quantity(key, key, 0.0, None, InputKind.PARAM)
        return self.rec(
            f"{key}_peak_per_hour",
            f"{volume.name} в пиковый час",
            volume.value / (shifts.value * hours.value) * peak.value,
            "ед/ч",
            f"{key} / (shifts_per_day × shift_hours) × peak_factor",
            [volume, shifts, hours, peak],
        )

    def docks(self) -> tuple[int, int]:
        counts: list[int] = []
        doors = self.inp.optional("dock_doors")
        flows = {
            "in": self.inp.param("pallets_in_per_day"),
            "out": self.inp.param("pallets_out_per_day"),
        }
        per_door = self.inp.norm("layout_dock_pallets_per_door_hour")
        for flow, volume in flows.items():
            key = f"docks_{flow}"
            name = "Ворот приёмки" if flow == "in" else "Ворот отгрузки"
            override = self.inp.override(key)
            if override is not None:
                counts.append(max(1, int(override.value)))
                continue
            if doors is not None:
                total = sum(v.value for v in flows.values())
                share = volume.value / total if total else 1 / len(flows)
                value = round(doors.value * share) if flow == "in" else doors.value - counts[0]
                quantity = self.rec(
                    key,
                    name,
                    float(max(1, value)),
                    "шт",
                    f"dock_doors × {volume.key} / (приёмка + отгрузка)",
                    [doors, *flows.values()],
                )
            else:
                peak = self.per_hour(volume.key)
                quantity = self.rec(
                    key,
                    name,
                    float(max(1, math.ceil(peak.value / per_door.value))),
                    "шт",
                    f"⌈{peak.key} / layout_dock_pallets_per_door_hour⌉",
                    [peak, per_door],
                )
            counts.append(int(quantity.value))
        return counts[0], counts[1]

    def stations(self) -> int:
        override = self.inp.override("pick_stations")
        if override is not None:
            return max(0, int(override.value))
        if not (lines := self.inp.optional("order_lines_per_day")) or lines.value <= 0:
            return 0
        peak = self.per_hour(lines.key)
        rate = self.inp.norm("g2p_station_lines_per_hour")
        target = self.inp.norm("g2p_station_utilization_target")
        return int(
            self.rec(
                "pick_stations",
                "Станций отбора товар-к-человеку",
                float(math.ceil(peak.value / (rate.value * target.value))),
                "шт",
                "⌈order_lines_per_day_peak_per_hour"
                " / (g2p_station_lines_per_hour × g2p_station_utilization_target)⌉",
                [peak, rate, target],
            ).value
        )

    def storage(
        self, width: Quantity, levels: Quantity, bays: int, runs: int, stations: int
    ) -> tuple[int, float]:
        depth, flue = self.inp.norm("layout_rack_depth_m"), self.inp.norm("layout_rack_flue_m")
        aisle, per_level = self.inp.param("aisle_width_m"), self.inp.norm("layout_pallets_per_bay_level")
        positions = self.inp.param("pallet_positions")
        faces = Quantity(
            "bays_per_face", "Секций вдоль одной стороны прохода", float(bays * runs), "шт", InputKind.METRIC
        )
        per_aisle = self.rec(
            "slots_per_aisle",
            "Паллетомест на один рабочий проход (две стороны)",
            2 * faces.value * per_level.value * levels.value,
            "паллетомест",
            "2 × bays_per_face × layout_pallets_per_bay_level × rack_levels",
            [faces, per_level, levels],
        )
        needed = self.rec(
            "aisles_needed",
            "Рабочих проходов для заданной ёмкости",
            float(math.ceil(positions.value / per_aisle.value)),
            "шт",
            "⌈pallet_positions / slots_per_aisle⌉",
            [positions, per_aisle],
        )
        module = self.rec(
            "rack_module_width_m",
            "Шаг модуля «проход + спаренный стеллаж»",
            2 * depth.value + flue.value + aisle.value,
            "м",
            "2 × layout_rack_depth_m + layout_rack_flue_m + aisle_width_m",
            [depth, flue, aisle],
        )
        # Stations stand in two rows (along both main aisles), so half of them sets the width of the zone.
        reserve = math.ceil(stations / 2) * self.inp.norm("layout_pick_station_pitch_m").value

        def fits(space: float) -> int:
            return math.floor((space + flue.value) / module.value)

        aisles = min(int(needed.value), fits(width.value - reserve))
        if aisles < 1:
            aisles = min(int(needed.value), fits(width.value))
            self.warnings.append("Под зону отбора не остаётся места: здание целиком занято стеллажами")
        if aisles < 1:
            raise LayoutError("Здание слишком узкое: не помещается ни одного рабочего прохода со стеллажами")
        block = self.rec(
            "storage_block_width_m",
            "Ширина блока стеллажей",
            aisles * module.value - flue.value,
            "м",
            "aisles × rack_module_width_m − layout_rack_flue_m",
            [Quantity("aisles", "Рабочих проходов", float(aisles), "шт", InputKind.METRIC), module, flue],
        )
        slots = aisles * per_aisle.value
        if aisles < needed.value:
            fitted, wanted = f"{slots:,.0f}".replace(",", " "), f"{positions.value:,.0f}".replace(",", " ")
            self.warnings.append(
                f"В здании помещается {fitted} из {wanted} паллетомест при {int(levels.value)} ярусах"
                " — проверьте высоту потолков и площадь"
            )
        return aisles, block.value

    def vehicle(self) -> tuple[float, float]:
        width, clearance = (
            self.inp.norm("layout_loaded_vehicle_width_m"),
            self.inp.norm("aisle_safety_clearance_mm"),
        )
        two_way = self.rec(
            "two_way_min_width_m",
            "Минимальная ширина проезда для разъезда двух роботов",
            2 * width.value + clearance.value / MM_PER_M,
            "м",
            "2 × layout_loaded_vehicle_width_m + mm_to_m(aisle_safety_clearance_mm)",
            [width, clearance],
        )
        return self.inp.norm("layout_robot_headway_m").value, two_way.value

    def derive(self) -> Dims:
        width, depth = self.building()
        levels = self.levels()
        top, bottom, band = self.band(depth)
        cross, segment, bays = self.segments(band)
        docks_in, docks_out = self.docks()
        stations = self.stations()
        aisles, block = self.storage(width, levels, bays, cross + 1, stations)
        chargers = self.inp.override("chargers") or self.inp.norm("layout_default_charger_slots")
        headway, two_way = self.vehicle()
        n = self.inp.norm
        return Dims(
            template=self.template,
            width=width.value,
            height=depth.value,
            staging=n("layout_dock_staging_depth_m").value,
            main=self.inp.param("main_aisle_width_m").value,
            aisle=self.inp.param("aisle_width_m").value,
            rack_depth=n("layout_rack_depth_m").value,
            flue=n("layout_rack_flue_m").value,
            bay_pitch=n("layout_rack_bay_pitch_m").value,
            pallets_per_bay_level=int(n("layout_pallets_per_bay_level").value),
            levels=int(levels.value),
            band_top=top,
            band_bottom=bottom,
            cross_aisles=cross,
            segment=segment,
            bays_per_segment=bays,
            aisles=aisles,
            block_width=block,
            docks_in=docks_in,
            docks_out=docks_out,
            dock_pitch=n("layout_dock_door_pitch_m").value,
            stations=stations,
            station_pitch=n("layout_pick_station_pitch_m").value,
            station_depth=n("layout_pick_station_depth_m").value,
            pod_pitch=n("layout_g2p_pod_pitch_m").value,
            pod_block_width=int(n("layout_g2p_block_width_pods").value),
            pod_block_length=int(n("layout_g2p_block_length_pods").value),
            chargers=max(1, int(chargers.value)),
            charger_pitch=n("layout_charger_pitch_m").value,
            headway=headway,
            two_way_width=two_way,
        )

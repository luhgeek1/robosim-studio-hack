from app.domain.reference import SizingModel
from app.engine.calculation.context import Context
from app.engine.calculation.models import ItemInput
from app.engine.sizing import SizingOutcome
from app.engine.trace import InputKind, Quantity, Section


def station_count(ctx: Context, item: ItemInput, outcome: SizingOutcome | None) -> Quantity:
    ns = item.process_key
    if item.stations_manual is not None:
        manual = Quantity(
            f"{ns}.stations_manual",
            "Станций отбора, задано вручную",
            float(item.stations_manual),
            "шт",
            InputKind.PARAM,
        )
        return ctx.tr.record(
            f"{ns}.stations_final",
            "Станций отбора в сценарии",
            manual.value,
            "шт",
            manual.key,
            [manual],
            Section.SIZING,
        ).as_quantity()
    if outcome is not None and outcome.stations is not None:
        return Quantity(f"{ns}.stations", "Станций отбора", float(outcome.stations), "шт", InputKind.METRIC)
    return ctx.tr.record(
        f"{ns}.stations_final", "Станций отбора в сценарии", 0.0, "шт", "0", [], Section.SIZING
    ).as_quantity()


def station_capacity(ctx: Context, item: ItemInput, count: Quantity, *, simulated: bool) -> Quantity | None:
    if item.sizing_model != SizingModel.GOODS_TO_PERSON:
        return None
    rate = item.specs.optional("station_throughput_lines_h") or ctx.books.norms.get(
        "g2p_station_lines_per_hour"
    )
    inputs = [count, rate]
    value, formula = count.value * rate.value, f"{count.key} × {rate.key}"
    if not simulated:
        # A verified queue can use the planning headroom, but never exceed the station's physical rate.
        target = ctx.books.norms.get("g2p_station_utilization_target")
        inputs.append(target)
        value *= target.value
        formula += f" × {target.key}"
    return ctx.tr.record(
        f"{item.process_key}.station_capacity_per_hour",
        "Пропускная способность станций отбора",
        value,
        "строк/ч",
        formula,
        inputs,
        Section.SIZING,
    ).as_quantity()


def station_share(limit: Quantity | None, peak: Quantity, warnings: list[str]) -> float:
    share = min(1.0, limit.value / peak.value) if limit and peak.value else 1.0
    if share < 1:
        warnings.append(
            "Пропускная способность станций отбора ниже пикового спроса: "
            "высвобождение труда и экономия ограничены покрываемой долей операций"
        )
    return share


def fleet_capacity(
    working: int, effective: float | None, peak: float, simulated: bool, station_limit: Quantity | None
) -> float | None:
    capacity = peak if simulated else (working * effective if effective else None)
    if station_limit is not None:
        return min(capacity, station_limit.value) if capacity is not None else station_limit.value
    return capacity

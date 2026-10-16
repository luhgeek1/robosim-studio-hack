from app.domain.reference import ProcessDef
from app.engine.calculation.context import Context
from app.engine.calculation.models import CalculationError
from app.engine.expressions import ExpressionError, MissingValueError
from app.engine.trace import Quantity, Section, TraceStep

HOURS_PER_YEAR = 24 * 365


def release_cap(
    ctx: Context, process: ProcessDef, demand: dict[str, TraceStep], days: Quantity
) -> Quantity | None:
    """Manual workload FTE = demand / independent human rate / annual fund × absence cover.

    The process registry defines the human rate and its operation boundary; robot specifications never
    enter this calculation. Rates retain the demand unit: pallets, bags, kg, lines or square metres/hour.
    """
    if not process.labor_allocation:
        return None
    source = (process.demand or {}).get("manual_rate")
    if not source:
        raise CalculationError(
            f"{process.name}: не задана независимая выработка человека; укажите manual_rate в справочнике"
        )
    try:
        value, inputs = ctx.books.expression(source)
    except (MissingValueError, ExpressionError) as exc:
        raise CalculationError(f"{process.name}: не удалось определить ручную выработку: {exc}") from exc
    if value <= 0:
        raise CalculationError(f"{process.name}: ручная выработка должна быть больше нуля")
    rate = ctx.tr.record(
        f"{process.key}.manual_rate",
        "Выработка человека в границах процесса",
        value,
        "ед/ч",
        source,
        inputs,
        Section.BASELINE,
    ).as_quantity()
    per_day = demand["per_day"].as_quantity()
    workload = ctx.tr.record(
        f"{process.key}.manual_workload_hours_year",
        "Человеко-часы объёма работ без роботизации",
        per_day.value * days.value / rate.value,
        "ч/год",
        f"{per_day.key} × {days.key} / {rate.key}",
        [per_day, days, rate],
        Section.BASELINE,
    ).as_quantity()
    post = ctx.books.norms.get("fte_per_24x7_post")
    hours = ctx.tr.record(
        f"{process.key}.fte_annual_hours",
        "Годовой фонд времени одной штатной единицы",
        HOURS_PER_YEAR / post.value,
        "ч",
        f"24 × 365 / {post.key}",
        [post],
        Section.EFFECT,
    ).as_quantity()
    loss = ctx.books.norms.get("labor_time_loss_share")
    return ctx.tr.record(
        f"{process.key}.release_cap_fte",
        "Потолок высвобождения по ручному объёму работ",
        workload.value / hours.value * (1 + loss.value),
        "FTE",
        f"{workload.key} / {hours.key} × (1 + {loss.key})",
        [workload, hours, loss],
        Section.EFFECT,
    ).as_quantity()

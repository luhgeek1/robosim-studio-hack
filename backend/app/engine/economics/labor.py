from dataclasses import dataclass

from app.engine.economics.models import EffectKind, FleetItem, Line
from app.engine.trace import Book, InputKind, Quantity, Section, Tracer

HOURS_PER_YEAR = 24 * 365


@dataclass(frozen=True, slots=True)
class LaborSavings:
    lines: list[Line]
    potential_year: float
    hours_year: float
    cash_realization_share: float


def released_share(item: FleetItem, tracer: Tracer, warnings: list[str]) -> Quantity:
    """Release = min(staffing release share, manual workload / staffing) × covered demand share."""
    assert item.release is not None
    cap = item.release_cap_fte
    fte = Quantity(f"{item.key}.labor_fte", "Персонал процесса", item.labor_fte, "FTE", InputKind.METRIC)
    inputs = [item.release, item.coverage]
    share = item.release.value
    formula = f"{item.release.key} × {item.coverage.key}"
    if cap is not None and item.labor_fte > 0:
        share = min(share, cap.value / item.labor_fte)
        inputs += [cap, fte]
        formula = f"min({item.release.key}, {cap.key} / {fte.key}) × {item.coverage.key}"
        if share < item.release.value:
            warnings.append(
                f"{item.process_name}: высвобождение ограничено объёмом работ — {cap.value:.1f} FTE "
                f"вместо {item.labor_fte * item.release.value:.1f} по численности из датасета"
            )
    return tracer.record(
        f"{item.key}.released_share",
        "Доля высвобождаемой трудовой мощности процесса",
        share * item.coverage.value,
        "доля",
        formula,
        inputs,
        Section.EFFECT,
    ).as_quantity()


def labor_savings(items: list[FleetItem], norms: Book, tracer: Tracer, warnings: list[str]) -> LaborSavings:
    """Cash saving = released payroll potential × explicit realization share, independent of released FTE."""
    realization = norms.get("labor_cash_realization_share")
    post = norms.get("fte_per_24x7_post")
    loss = norms.get("labor_time_loss_share")
    lines: list[Line] = []
    potential_total = hours_total = 0.0
    for item in items:
        if item.release is None:
            warnings.append(f"{item.process_name}: не задана доля высвобождения — экономия ФОТ не считается")
            continue
        share = released_share(item, tracer, warnings)
        fte = Quantity(f"{item.key}.labor_fte", "Персонал процесса", item.labor_fte, "FTE", InputKind.METRIC)
        released = tracer.record(
            f"released_labor_fte.{item.key}",
            f"Высвобождаемая трудовая мощность: {item.process_name}",
            item.labor_fte * share.value,
            "FTE",
            f"{fte.key} × {share.key}",
            [fte, share],
            Section.EFFECT,
        ).as_quantity()
        hours = tracer.record(
            f"released_labor_hours.{item.key}",
            f"Высвобождаемые человеко-часы: {item.process_name}",
            released.value * HOURS_PER_YEAR / post.value / (1 + loss.value),
            "ч/год",
            f"{released.key} × 24 × 365 / {post.key} / (1 + {loss.key})",
            [released, post, loss],
            Section.EFFECT,
        )
        potential = tracer.record(
            f"labor_capacity_value.{item.key}",
            f"Стоимость высвобождаемой мощности: {item.process_name}",
            item.labor_cost.value * share.value,
            "₽/год",
            f"{item.labor_cost.key} × {share.key}",
            [item.labor_cost, share],
            Section.EFFECT,
        ).as_quantity()
        saving = tracer.record(
            f"labor_savings.{item.key}",
            f"Ожидаемая денежная экономия ФОТ: {item.process_name}",
            potential.value * realization.value,
            "₽/год",
            f"{potential.key} × {realization.key}",
            [potential, realization],
            Section.EFFECT,
        )
        lines.append(Line(saving, EffectKind.COST_REDUCTION, fte=released.value))
        potential_total += potential.value
        hours_total += hours.value
    if potential_total > 0:
        warnings.append(
            f"Денежная реализация высвобождения труда — {realization.value:.0%}: допущение, "
            "требующее плана сокращения затрат или предотвращённого найма. Перевод сотрудников на другие "
            "задачи высвобождает мощность, но сам по себе не уменьшает ФОТ."
        )
    return LaborSavings(lines, potential_total, hours_total, realization.value)

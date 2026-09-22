import pytest

from app.domain.reference import SizingModel
from app.engine.sizing import DemandInput, SizingOptions, size
from app.engine.trace import Book, InputKind, Quantity

NORMS = Book.of(
    InputKind.NORM,
    [
        ("effective_speed_factor", "Коэффициент эффективной скорости", 0.6, "доля"),
        ("transport_default_one_way_distance_m", "Маршрут по умолчанию", 200.0, "м"),
        ("load_handling_time_s", "Захват груза", 30.0, "с"),
        ("unload_handling_time_s", "Отдача груза", 30.0, "с"),
        ("fork_lift_cycle_extra_s", "Подъём вил на ярус", 60.0, "с"),
        ("analytic_availability_default", "Доступность по умолчанию", 0.75, "доля"),
        ("amr_utilization_target", "Целевая загрузка", 0.8, "доля"),
        ("fleet_reserve_share", "Резерв", 0.15, "доля"),
        ("robots_per_charging_station", "Роботов на зарядку", 3.0, "шт"),
        ("g2p_robot_lines_per_trip", "Строк за рейс", 3.0, "строк"),
        ("g2p_station_lines_per_hour", "Производительность станции", 300.0, "строк/ч"),
        ("cleaning_real_to_passport_share", "Реальная / паспортная", 0.6, "доля"),
        ("tow_train_carts_per_trip", "Тележек в сцепке", 3.0, "шт"),
        ("elevator_cycle_time_s", "Цикл лифта", 120.0, "с"),
    ],
)
PALLETS = DemandInput(
    "pallet_transport", peak_per_hour=136.36, avg_per_hour=90.9, demand_per_day=2000, hours_per_day=22
)


def specs(**values: float) -> Book:
    return Book.of(InputKind.SPEC, [(k, k, v, None) for k, v in values.items()])


def test_transport_cycle_hand_calculation() -> None:
    # travel = 2 × 200 / (1.5 × 0.6) = 444.44 s; cycle = 444.44 + 30 + 30 = 504.44 s
    # nominal = 3600 / 504.44 = 7.137 pal/h; availability = 10 / (10 + 18/60) = 0.9709
    # effective = 7.137 × 0.9709 × 0.8 = 5.543; N = ⌈136.36 / 5.543⌉ = 25
    # reserve = ⌈25 × 0.15⌉ = 4; chargers = ⌈29 / 3⌉ = 10
    out = size(
        SizingModel.TRANSPORT_CYCLE,
        PALLETS,
        specs(max_speed_mps=1.5, runtime_h=10, charging_time_min=18),
        NORMS,
    )
    assert out.cycle_time_s == pytest.approx(504.44, rel=1e-4)
    assert out.availability == pytest.approx(0.97087, rel=1e-4)
    assert out.effective_per_hour == pytest.approx(5.5434, rel=1e-3)
    assert (out.robots, out.reserve, out.chargers) == (25, 4, 10)
    assert out.missing == []
    assert any("норматив" in w for w in out.warnings)


def test_passport_vs_physics() -> None:
    # the vendor claims 80–100 pallets/h; the cycle on a 200 m route gives ~5.5 — 18× fewer
    out = size(
        SizingModel.TRANSPORT_CYCLE,
        PALLETS,
        specs(max_speed_mps=1.5, runtime_h=10, charging_time_min=18),
        NORMS,
    )
    assert out.effective_per_hour is not None
    assert 80 / out.effective_per_hour > 10


def test_fmr_adds_lift_time_and_default_availability() -> None:
    out = size(
        SizingModel.TRANSPORT_CYCLE, PALLETS, specs(max_speed_mps=1.5), NORMS, SizingOptions(is_fmr=True)
    )
    assert out.cycle_time_s == pytest.approx(564.44, rel=1e-4)
    assert out.availability == 0.75


def test_goods_to_person_counts_stations() -> None:
    picking = DemandInput(
        "order_picking", peak_per_hour=6818.2, avg_per_hour=4545.5, demand_per_day=100000, hours_per_day=22
    )
    out = size(
        SizingModel.GOODS_TO_PERSON,
        picking,
        specs(max_speed_mps=1.0, runtime_h=8, charging_time_min=60),
        NORMS,
    )
    assert out.stations == 23  # ⌈6818.2 / 300⌉
    assert out.robots is not None
    assert out.robots > out.stations


def test_area_coverage() -> None:
    # 40 000 m²/day; 1000 m²/h × 0.6 × 0.75 × 22 h = 9 900 m²/day per robot → 5 robots
    cleaning = DemandInput(
        "floor_cleaning", peak_per_hour=1818, avg_per_hour=1818, demand_per_day=40000, hours_per_day=22
    )
    out = size(SizingModel.AREA_COVERAGE, cleaning, specs(coverage_m2_h=1000), NORMS)
    assert out.robots == 5


def test_missing_spec_is_reported_not_raised() -> None:
    out = size(SizingModel.TRANSPORT_CYCLE, PALLETS, specs(), NORMS)
    assert out.robots is None
    assert out.missing == ["spec:max_speed_mps"]


def test_trace_renders_formula_with_numbers() -> None:
    out = size(
        SizingModel.TRANSPORT_CYCLE,
        PALLETS,
        specs(max_speed_mps=1.5, runtime_h=10, charging_time_min=18),
        NORMS,
    )
    step = next(s for s in out.trace.steps if s.key == "robots_analytic")
    assert step.rendered.endswith("= 25 шт")
    assert {q.key for q in step.inputs} == {"demand_peak_per_hour", "effective_per_hour"}


def test_manual_throughput_skips_cycle_model() -> None:
    # passport 90 pal/h instead of the cycle model: ⌈136.36 / 90⌉ = 2, reserve ⌈2 × 0.15⌉ = 1
    override = Quantity(
        "throughput_override_per_hour", "Производительность вручную", 90.0, "ед/ч", InputKind.PARAM
    )
    out = size(
        SizingModel.TRANSPORT_CYCLE, PALLETS, specs(), NORMS, SizingOptions(throughput_override=override)
    )
    assert (out.robots, out.reserve) == (2, 1)
    assert out.cycle_time_s is None
    assert any("вручную" in w for w in out.warnings)

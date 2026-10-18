from dataclasses import replace
from uuid import uuid4

import pytest

from app.db.models import Norm, Project, Scenario, ScenarioItem
from app.domain.scenario.models import CountMode, ScenarioKind
from app.engine.trace import Book
from app.seeds.schemas import load_norm_set
from app.service.scenarios.service import _keep_simulation
from app.service.scenarios.simulation_evidence import simulated_count
from app.service.scenarios.snapshot import Snapshot
from app.service.scenarios.views import Versions
from tests.unit.engine.test_calculation import scenario


def snapshot() -> Snapshot:
    inp = scenario()
    item = ScenarioItem(
        process_key=inp.items[0].process_key,
        product_id=inp.items[0].product_id,
        count_mode=CountMode.AUTO,
        stations_mode=CountMode.MANUAL,
        stations_count=27,
        simulated_count=8,
        simulated_basis=25,
        simulation_id=uuid4(),
        simulated_project_version=7,
    )
    result = Snapshot(
        input=inp,
        project=Project(version=7),
        scenario=Scenario(kind=ScenarioKind.PURCHASE, version=1, items=[item]),
        versions=Versions(7, "v1", "v1", "0.3.1"),
        norm_rows={n.key: Norm(key=n.key, category=n.category) for n in load_norm_set().norms},
        overrides={},
        sources={},
        param_provenance={},
        spec_status={},
        candidate_status={},
        budget_rub=None,
        physical_layout={"nodes": [{"id": "charger", "capacity": 8}], "edges": []},
    )
    item.simulated_fingerprint = result.physical_fingerprint
    return result


def test_station_change_keeps_history_but_invalidates_evidence() -> None:
    snap = snapshot()
    original = snap.scenario.items[0]
    changed = ScenarioItem(
        process_key=original.process_key,
        product_id=original.product_id,
        count_mode=CountMode.AUTO,
        stations_mode=CountMode.MANUAL,
        stations_count=1,
    )
    _keep_simulation([original], [changed])
    snap.scenario.items = [changed]
    assert changed.simulated_count == 8
    assert simulated_count(changed, snap.physical_fingerprint) is None


@pytest.mark.parametrize("key", ["max_speed_mps", "runtime_h", "charging_time_min"])
def test_robot_physics_change_invalidates_without_a_project_version_bump(key: str) -> None:
    snap = snapshot()
    item = snap.input.items[0]
    quantities = dict(item.specs.items)
    quantities[key] = replace(quantities[key], value=quantities[key].value * 1.1)
    snap.input = replace(snap.input, items=[replace(item, specs=Book(item.specs.kind, quantities))])
    assert simulated_count(snap.scenario.items[0], snap.physical_fingerprint) is None


@pytest.mark.parametrize("key", ["effective_speed_factor", "robots_per_charging_station", "sim_replications"])
def test_physical_norm_change_invalidates_even_in_the_same_norm_set(key: str) -> None:
    snap = snapshot()
    quantities = dict(snap.input.norms.items)
    quantities[key] = replace(quantities[key], value=quantities[key].value * 1.1)
    snap.input = replace(snap.input, norms=Book(snap.input.norms.kind, quantities))
    assert simulated_count(snap.scenario.items[0], snap.physical_fingerprint) is None


def test_project_resource_and_process_definition_changes_invalidate() -> None:
    snap = snapshot()
    original = snap.physical_fingerprint
    snap.input = replace(snap.input, params={**snap.input.params, "shift_hours": 12.0})
    assert snap.physical_fingerprint != original
    snap = snapshot()
    original = snap.physical_fingerprint
    snap.physical_layout = {"nodes": [{"id": "charger", "capacity": 1}], "edges": []}
    assert snap.physical_fingerprint != original
    snap = snapshot()
    original = snap.physical_fingerprint
    process = snap.input.processes[0]
    snap.input = replace(snap.input, processes=[replace(process, simulation={"target_share": "new_target"})])
    assert snap.physical_fingerprint != original


def test_price_financing_and_financial_norm_edits_preserve_physical_evidence() -> None:
    snap = snapshot()
    original = snap.physical_fingerprint
    snap.scenario.items[0].price_override_rub = 3_000_000
    snap.scenario.version += 1
    snap.project.version += 1
    norms = dict(snap.input.norms.items)
    norms["discount_rate"] = replace(norms["discount_rate"], value=0.3)
    snap.input = replace(
        snap.input,
        horizon_years=8,
        kind=ScenarioKind.LEASE,
        items=[replace(snap.input.items[0], price=3_000_000)],
        norms=Book(snap.input.norms.kind, norms),
    )
    # The object's default planning horizon is financial too, even though it is a numeric parameter.
    snap.input = replace(snap.input, params={**snap.input.params, "horizon_years": 8.0})
    assert snap.physical_fingerprint == original
    assert simulated_count(snap.scenario.items[0], original) == 8


def test_legacy_simulation_without_fingerprint_is_never_confirmed() -> None:
    snap = snapshot()
    snap.scenario.items[0].simulated_fingerprint = None
    assert simulated_count(snap.scenario.items[0], snap.physical_fingerprint) is None

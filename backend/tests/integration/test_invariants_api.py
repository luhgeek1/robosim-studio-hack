import math
from typing import Any

import pytest
from httpx import AsyncClient

from tests.conftest import bearer, login

pytestmark = pytest.mark.integration

OBJECTS = ["warehouse", "airport", "hospital"]


def _numbers(value: Any) -> list[float]:
    if isinstance(value, dict):
        return [n for v in value.values() for n in _numbers(v)]
    if isinstance(value, list):
        return [n for v in value for n in _numbers(v)]
    return [value] if isinstance(value, float) else []


async def _recommended(client: AsyncClient, kind: str) -> tuple[dict[str, Any], dict[str, str]]:
    headers = bearer((await login(client, "user@roboscope.demo"))["access"])
    payload = {"name": kind, "object_type": kind, "init": {"mode": "demo", "demo_key": f"{kind}_demo_01"}}
    project = (await client.post("/api/v1/projects", json=payload, headers=headers)).json()
    scenario = {"name": "Из подбора", "kind": "purchase", "from_recommendation": True}
    response = await client.post(
        f"/api/v1/projects/{project['id']}/scenarios", json=scenario, headers=headers
    )
    assert response.status_code == 201, response.text
    calc = await client.post(f"/api/v1/scenarios/{response.json()['id']}/calculate", json={}, headers=headers)
    assert calc.status_code == 200, calc.text
    return calc.json(), headers


@pytest.mark.parametrize("kind", OBJECTS)
async def test_trace_is_a_graph_with_sources_for_every_object(client: AsyncClient, kind: str) -> None:
    """Live Excel formulas, UI links and «no undocumented constants» rely on this, for every sizing model."""
    calc, headers = await _recommended(client, kind)
    trace = (await client.get(f"/api/v1/calculations/{calc['id']}/trace", headers=headers)).json()
    assert trace["undocumented_constants"] == 0
    seen: set[str] = set()
    for step in trace["items"]:
        assert step["metric_key"] not in seen, step["metric_key"]
        assert step["formula"], step["metric_key"]
        for quantity in step["inputs"]:
            if quantity["kind"] == "metric":
                assert quantity["key"] in seen, (step["metric_key"], quantity["key"])
            if quantity["kind"] in {"norm", "assumption"}:
                provenance = quantity.get("provenance") or {}
                assert (provenance.get("source") or {}).get("title") or provenance.get("note"), quantity[
                    "key"
                ]
        seen.add(step["metric_key"])


@pytest.mark.parametrize("kind", OBJECTS)
async def test_economics_is_consistent_for_every_object(client: AsyncClient, kind: str) -> None:
    calc, _ = await _recommended(client, kind)
    assert all(math.isfinite(n) for n in _numbers(calc))
    metrics = calc["metrics"]
    if metrics["effect_rub_year"] > 0 and metrics["capex_rub"] > 0:
        assert metrics["payback_years"] == pytest.approx(metrics["capex_rub"] / metrics["effect_rub_year"])
    flow = calc["cashflow"]
    assert flow["yearly"][-1]["cumulative_rub"] == pytest.approx(flow["monthly"][-1]["cumulative_rub"])
    for item in calc["sizing"]:
        count = item["count"]
        if count["source"] == "analytic":
            assert count["final"] == count["analytic"] + count["reserve"]
        assert count["final"] >= 1

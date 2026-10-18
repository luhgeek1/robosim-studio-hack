import pytest
from httpx import AsyncClient

from tests.integration.test_scenarios_api import _demo, _purchase

pytestmark = pytest.mark.integration


async def test_financial_perspectives_and_zero_equity_survive_api(client: AsyncClient) -> None:
    project, headers = await _demo(client)
    scenario = await _purchase(client, headers, project)
    url = f"/api/v1/scenarios/{scenario['id']}"
    own = (await client.post(f"{url}/calculate", headers=headers)).json()
    response = await client.patch(
        url,
        json={"financing": {"kind": "loan", "rate_pct": 0, "term_years": 5, "down_payment_pct": 0}},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    loan = (await client.post(f"{url}/calculate", headers=headers)).json()
    for key in ("npv_rub", "irr_pct", "roi_pct", "discounted_payback_years"):
        assert loan["metrics"][key] == pytest.approx(own["metrics"][key])
    assert loan["cashflow"] == own["cashflow"]
    assert loan["owner_cashflow"]["upfront_rub"] == 0
    assert loan["metrics"]["owner_roi_pct"] is None
    assert loan["metrics"]["owner_npv_rub"] != pytest.approx(loan["metrics"]["npv_rub"])
    assert all(point["financing_rub"] == 0 for point in loan["cashflow"]["monthly"])
    assert sum(point["financing_rub"] for point in loan["owner_cashflow"]["monthly"]) > 0
    response = await client.patch(
        url,
        json={
            "overrides": [{"norm_key": "owner_discount_rate", "value": 0.3, "reason": "Требование инвестора"}]
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    changed = (await client.post(f"{url}/calculate", headers=headers)).json()
    assert changed["metrics"]["npv_rub"] == pytest.approx(loan["metrics"]["npv_rub"])
    assert changed["metrics"]["owner_npv_rub"] != pytest.approx(loan["metrics"]["owner_npv_rub"])
    assert changed["metrics"]["owner_discount_rate_pct"] == 30


async def test_unmonetized_labor_keeps_capacity_but_removes_cash_saving(client: AsyncClient) -> None:
    project, headers = await _demo(client)
    scenario = await _purchase(client, headers, project)
    url = f"/api/v1/scenarios/{scenario['id']}"
    before = (await client.post(f"{url}/calculate", headers=headers)).json()
    response = await client.patch(
        url,
        json={
            "overrides": [
                {
                    "norm_key": "labor_cash_realization_share",
                    "value": 0,
                    "reason": "Перевод сотрудников без снижения ФОТ",
                }
            ]
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    after = (await client.post(f"{url}/calculate", headers=headers)).json()
    for key in ("fte_released", "labor_hours_released_year", "labor_potential_savings_rub_year"):
        assert after["metrics"][key] == pytest.approx(before["metrics"][key])
        assert after["metrics"][key] > 0
    assert after["metrics"]["labor_savings_rub_year"] == 0
    assert after["metrics"]["labor_cash_realization_pct"] == 0
    assert after["metrics"]["effect_rub_year"] < 0
    assert after["metrics"]["npv_rub"] < before["metrics"]["npv_rub"]
    assert all(point["savings_rub"] == 0 for point in after["cashflow"]["monthly"])
    assert after["baseline_cost_year"] == before["baseline_cost_year"]

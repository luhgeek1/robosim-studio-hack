import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.integration


async def test_health_is_ok(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.headers["X-Request-ID"]


async def test_ready_reports_worker_missing_as_degraded(client: AsyncClient) -> None:
    body = (await client.get("/api/v1/ready")).json()
    assert body["checks"]["database"] == "ok"
    assert body["checks"]["redis"] == "ok"
    assert body["status"] == "degraded"  # no worker heartbeat in tests


async def test_version_lists_engine(client: AsyncClient) -> None:
    body = (await client.get("/api/v1/version")).json()
    assert set(body) >= {"app_version", "engine_version", "catalog_version", "norm_set_version"}


async def test_incoming_request_id_is_echoed(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health", headers={"X-Request-ID": "abc-123"})
    assert response.headers["X-Request-ID"] == "abc-123"

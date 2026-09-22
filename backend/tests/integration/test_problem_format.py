import pytest
from httpx import AsyncClient

from app.core.errors import ErrorCode

pytestmark = pytest.mark.integration

REQUIRED = {"type", "title", "status", "detail", "error_code", "instance", "timestamp", "request_id"}


def assert_problem(body: dict[str, object], status: int, code: ErrorCode) -> None:
    assert set(body) >= REQUIRED
    assert body["status"] == status
    assert body["error_code"] == code.value


async def test_unauthorized(client: AsyncClient) -> None:
    response = await client.get("/api/v1/me")
    assert_problem(response.json(), 401, ErrorCode.UNAUTHORIZED)


async def test_validation_details_shape(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/login", json={"email": "not-an-email"})
    body = response.json()
    assert_problem(body, 422, ErrorCode.REQUEST_VALIDATION_ERROR)
    assert {"loc", "msg", "type"} <= set(body["details"][0])


async def test_unknown_route(client: AsyncClient) -> None:
    response = await client.get("/api/v1/nope")
    assert_problem(response.json(), 404, ErrorCode.NOT_FOUND)


async def test_garbage_token(client: AsyncClient) -> None:
    response = await client.get("/api/v1/me", headers={"Authorization": "Bearer garbage"})
    assert_problem(response.json(), 401, ErrorCode.UNAUTHORIZED)

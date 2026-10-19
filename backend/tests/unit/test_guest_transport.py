from collections.abc import AsyncIterator
from uuid import uuid4

from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient

from app.core.body_limits import MAX_BODY_BYTES, BodyLimitMiddleware
from app.core.config import Settings
from app.core.security.tokens import TokenCodec
from app.domain.auth import Role
from app.infra.client_ip import client_ip


async def test_streaming_body_limit_prevents_parsing_and_keeps_account_upload_budget() -> None:
    app = FastAPI()
    codec = TokenCodec(Settings())
    reached: list[int] = []

    @app.post("/upload")
    async def upload(request: Request) -> dict[str, int]:
        size = len(await request.body())
        reached.append(size)
        return {"size": size}

    app.add_middleware(BodyLimitMiddleware, codec=codec)

    async def chunks() -> AsyncIterator[bytes]:
        for _ in range(7):
            yield b" " * (1024 * 1024)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        guest = codec.issue(uuid4(), Role.GUEST, 1, "mobile").access
        denied = await client.post("/upload", headers={"Authorization": f"Bearer {guest}"}, content=chunks())
        assert denied.status_code == 413
        assert denied.json()["error_code"] == "FILE_TOO_LARGE"
        assert not reached
        account = codec.issue(uuid4(), Role.USER, 1, "mobile").access
        allowed = await client.post(
            "/upload", headers={"Authorization": f"Bearer {account}"}, content=chunks()
        )
        assert allowed.status_code == 200
        assert allowed.json()["size"] == 7 * 1024 * 1024
        too_big = await client.post(
            "/upload", headers={"Content-Length": str(MAX_BODY_BYTES + 1)}, content=b"x"
        )
        assert too_big.status_code == 413
        assert reached == [7 * 1024 * 1024]


def test_ip_headers_are_ignored_unless_explicitly_trusted_and_validated() -> None:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "client": ("127.0.0.1", 123),
        "headers": [(b"x-forwarded-for", b"192.0.2.1"), (b"x-robomera-client-ip", b"2001:db8::1")],
    }
    request = Request(scope)
    assert client_ip(request, Settings()) == "127.0.0.1"
    assert client_ip(request, Settings(client_ip_header="X-Robomera-Client-IP")) == "2001:db8::1"
    scope["headers"] = [(b"x-robomera-client-ip", b"192.0.2.1, evil")]
    assert client_ip(Request(scope), Settings(client_ip_header="X-Robomera-Client-IP")) == "127.0.0.1"

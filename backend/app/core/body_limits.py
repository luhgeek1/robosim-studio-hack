"""Bound request bodies before multipart spooling and JSON validation, including chunked uploads."""

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import ErrorCode, UnauthorizedError
from app.core.problem import problem_body
from app.core.security.tokens import TokenCodec
from app.domain.auth import Role

MAX_BODY_BYTES = 25 * 1024 * 1024
GUEST_BODY_BYTES = 6 * 1024 * 1024  # 5 MB file plus multipart fields and headers


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp, codec: TokenCodec) -> None:
        self.app, self.codec = app, codec

    def _limit(self, headers: Headers) -> int:
        token = headers.get("authorization", "")
        if token.startswith("Bearer "):
            try:
                if self.codec.decode(token[7:], "access").role == Role.GUEST:
                    return GUEST_BODY_BYTES
            except UnauthorizedError:
                pass  # The ordinary authentication dependency will reject it.
        return MAX_BODY_BYTES

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") not in {"POST", "PUT", "PATCH"}:
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        limit = self._limit(headers)
        length = headers.get("content-length", "")
        if length.isdigit() and int(length) > limit:
            await self._reject(scope, receive, send)
            return
        chunks: list[bytes] = []
        size = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > limit:
                await self._reject(scope, receive, send)
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        body = b"".join(chunks)
        sent = False

        async def replay() -> Message:
            nonlocal sent
            if sent:
                return await receive()
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}

        await self.app(scope, replay, send)

    @staticmethod
    async def _reject(scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse(
            status_code=413,
            content=problem_body(
                Request(scope),
                status=413,
                detail="Превышен размер запроса. В демо файлы до 5 МБ.",
                error_code=ErrorCode.FILE_TOO_LARGE,
            ),
        )
        await response(scope, receive, send)

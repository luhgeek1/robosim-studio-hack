"""Exception handlers that render every error as a contract ``Problem`` (RFC 7807 + ``error_code``)."""

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.errors import DomainError, ErrorCode

logger = logging.getLogger(__name__)

_STATUS_TITLES = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    409: "Conflict",
    413: "Payload Too Large",
    415: "Unsupported Media Type",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error",
    503: "Service Unavailable",
}


def problem_body(
    request: Request,
    *,
    status: int,
    detail: str,
    error_code: ErrorCode,
    details: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "type": "about:blank",
        "title": _STATUS_TITLES.get(status, "Error"),
        "status": status,
        "detail": detail,
        "error_code": error_code.value,
        "instance": request.url.path,
        "timestamp": datetime.now(UTC).isoformat(),
        "request_id": getattr(request.state, "request_id", None) or uuid4().hex,
    }
    if details is not None:
        body["details"] = details
    return body


def _response(request: Request, status: int, **kwargs: Any) -> JSONResponse:
    return JSONResponse(status_code=status, content=problem_body(request, status=status, **kwargs))


def _validation_details(exc: RequestValidationError) -> list[dict[str, Any]]:
    return [
        {
            "loc": [str(part) for part in err.get("loc", ())],
            "msg": err.get("msg", ""),
            "type": err.get("type", ""),
        }
        for err in exc.errors()
    ]


def register_problem_handlers(app: FastAPI, *, expose_internal: bool) -> None:
    @app.exception_handler(DomainError)
    async def _domain(request: Request, exc: DomainError) -> JSONResponse:
        return _response(
            request, exc.status_code, detail=exc.detail, error_code=exc.error_code, details=exc.details
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        return _response(
            request,
            422,
            detail="Проверьте введённые данные",
            error_code=ErrorCode.REQUEST_VALIDATION_ERROR,
            details=_validation_details(exc),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {401: ErrorCode.UNAUTHORIZED, 403: ErrorCode.FORBIDDEN, 404: ErrorCode.NOT_FOUND}.get(
            exc.status_code, ErrorCode.HTTP_ERROR
        )
        response = _response(request, exc.status_code, detail=str(exc.detail), error_code=code)
        if exc.headers:
            response.headers.update(exc.headers)
        return response

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # Runs in ServerErrorMiddleware, outside request tracing, so the id is passed explicitly.
        logger.exception(
            "unhandled error",
            extra={"path": request.url.path, "request_id": getattr(request.state, "request_id", None)},
        )
        detail = f"{type(exc).__name__}: {exc}" if expose_internal else "Внутренняя ошибка сервера"
        return _response(request, 500, detail=detail, error_code=ErrorCode.INTERNAL_ERROR)

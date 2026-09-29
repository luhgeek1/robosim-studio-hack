import logging
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.errors import STATUS_TITLES, DomainError, ErrorCode

logger = logging.getLogger(__name__)


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
        "title": STATUS_TITLES.get(status, "Error"),
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


# The UI is Russian (ТЗ 4.5): pydantic's English messages are replaced by a text per error type.
_VALIDATION_TEXT = {
    "missing": "обязательное поле не заполнено",
    "float_type": "нужно число",
    "float_parsing": "нужно число",
    "int_type": "нужно целое число",
    "int_parsing": "нужно целое число",
    "int_from_float": "нужно целое число",
    "bool_type": "нужно «да» или «нет»",
    "bool_parsing": "нужно «да» или «нет»",
    "string_type": "нужен текст",
    "string_too_short": "слишком короткое значение",
    "string_too_long": "слишком длинное значение",
    "greater_than": "значение слишком мало",
    "greater_than_equal": "значение слишком мало",
    "less_than": "значение слишком велико",
    "less_than_equal": "значение слишком велико",
    "enum": "недопустимое значение из списка",
    "literal_error": "недопустимое значение из списка",
    "uuid_type": "неверный идентификатор",
    "uuid_parsing": "неверный идентификатор",
    "value_error": "недопустимое значение",
    "list_type": "нужен список",
    "dict_type": "нужен объект",
    "model_attributes_type": "нужен объект",
    "json_invalid": "неверный формат JSON",
    "extra_forbidden": "лишнее поле",
    "datetime_parsing": "неверная дата",
    "date_parsing": "неверная дата",
}
_FIELD_SKIP = {"body", "query", "path", "header"}


def _message(err: Any) -> str:
    text = _VALIDATION_TEXT.get(err.get("type", ""), "недопустимое значение")
    field = ".".join(str(part) for part in err.get("loc", ()) if str(part) not in _FIELD_SKIP)
    return f"{field}: {text}" if field else text


def _validation_details(exc: RequestValidationError) -> list[dict[str, Any]]:
    return [
        {
            "loc": [str(part) for part in err.get("loc", ())],
            "msg": _message(err),
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

from enum import StrEnum
from typing import Any


class ErrorCode(StrEnum):
    """Closed list from docs/api/components/common.yaml#/ErrorCode."""

    BAD_REQUEST = "BAD_REQUEST"
    REQUEST_VALIDATION_ERROR = "REQUEST_VALIDATION_ERROR"
    UNAUTHORIZED = "UNAUTHORIZED"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"  # noqa: S105
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    CONFLICT = "CONFLICT"
    RATE_LIMITED = "RATE_LIMITED"
    HTTP_ERROR = "HTTP_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    PROJECT_LOCKED = "PROJECT_LOCKED"
    PARAMS_INVALID = "PARAMS_INVALID"
    IMPORT_FAILED = "IMPORT_FAILED"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    UNSUPPORTED_FILE_TYPE = "UNSUPPORTED_FILE_TYPE"
    OBJECT_TYPE_NOT_SUPPORTED = "OBJECT_TYPE_NOT_SUPPORTED"
    NO_CANDIDATES = "NO_CANDIDATES"
    SCENARIO_INCOMPLETE = "SCENARIO_INCOMPLETE"
    CALCULATION_FAILED = "CALCULATION_FAILED"
    SIMULATION_FAILED = "SIMULATION_FAILED"
    JOB_NOT_READY = "JOB_NOT_READY"
    LLM_UNAVAILABLE = "LLM_UNAVAILABLE"
    DEMO_LIMIT = "DEMO_LIMIT"


class DomainError(Exception):
    status_code: int = 400
    error_code: ErrorCode = ErrorCode.BAD_REQUEST
    default_detail: str = "Некорректный запрос"

    def __init__(
        self,
        detail: str | None = None,
        *,
        details: list[dict[str, Any]] | None = None,
        error_code: ErrorCode | None = None,
    ) -> None:
        self.detail = detail or self.default_detail
        self.details = details
        if error_code is not None:
            self.error_code = error_code
        super().__init__(self.detail)


class UnauthorizedError(DomainError):
    status_code = 401
    error_code = ErrorCode.UNAUTHORIZED
    default_detail = "Требуется вход"


class TokenExpiredError(UnauthorizedError):
    error_code = ErrorCode.TOKEN_EXPIRED
    default_detail = "Сессия истекла, войдите снова"


class ForbiddenError(DomainError):
    status_code = 403
    error_code = ErrorCode.FORBIDDEN
    default_detail = "Недостаточно прав"


class NotFoundError(DomainError):
    status_code = 404
    error_code = ErrorCode.NOT_FOUND
    default_detail = "Не найдено"


class ConflictError(DomainError):
    status_code = 409
    error_code = ErrorCode.CONFLICT
    default_detail = "Конфликт состояния"


class RateLimitedError(DomainError):
    status_code = 429
    error_code = ErrorCode.RATE_LIMITED
    default_detail = "Слишком много запросов, попробуйте через минуту"


class ParamsInvalidError(DomainError):
    status_code = 422
    error_code = ErrorCode.PARAMS_INVALID
    default_detail = "Проверьте значения параметров"


class FileTooLargeError(DomainError):
    status_code = 413
    error_code = ErrorCode.FILE_TOO_LARGE
    default_detail = "Файл слишком большой"


class UnsupportedFileTypeError(DomainError):
    status_code = 415
    error_code = ErrorCode.UNSUPPORTED_FILE_TYPE
    default_detail = "Неподдерживаемый формат файла"


class LlmUnavailableError(DomainError):
    status_code = 503
    error_code = ErrorCode.LLM_UNAVAILABLE
    default_detail = "Ассистент недоступен: загрузите файл по шаблону или заполните форму"

from uuid import uuid4

import pytest

from app.core.errors import TokenExpiredError, UnauthorizedError
from app.core.security.tokens import TokenCodec
from app.domain.auth import Role
from tests.conftest import make_settings


def test_access_and_refresh_have_distinct_jti() -> None:
    codec = TokenCodec(make_settings())
    issued = codec.issue(uuid4(), Role.USER, 1, "web")
    access = codec.decode(issued.access, "access")
    refresh = codec.decode(issued.refresh, "refresh")
    assert access.jti != refresh.jti
    assert refresh.client == "web"


def test_wrong_type_rejected() -> None:
    codec = TokenCodec(make_settings())
    issued = codec.issue(uuid4(), Role.USER, 1, "mobile")
    with pytest.raises(UnauthorizedError):
        codec.decode(issued.access, "refresh")


def test_expired_token_has_dedicated_error() -> None:
    codec = TokenCodec(make_settings(access_ttl_s=-1))
    issued = codec.issue(uuid4(), Role.USER, 1, "mobile")
    with pytest.raises(TokenExpiredError):
        codec.decode(issued.access, "access")


def test_csrf_bound_to_refresh_token() -> None:
    codec = TokenCodec(make_settings())
    issued = codec.issue(uuid4(), Role.USER, 1, "web")
    assert codec.csrf_matches(issued.refresh, issued.csrf)
    assert not codec.csrf_matches(issued.refresh, "0" * 64)
    assert not codec.csrf_matches(issued.refresh, None)


def test_prod_rejects_dev_secrets() -> None:
    with pytest.raises(ValueError, match="RS_JWT_SECRET"):
        make_settings(stage="prod")

import pytest
from sqlalchemy.engine import make_url

from tests.worker_resources import worker_urls

DATABASE = "postgresql+asyncpg://test:secret@localhost:5432/robomera_test?ssl=require"
REDIS = "redis://test:secret@localhost:6379/15?socket_timeout=5"


@pytest.mark.parametrize("index", range(4))
def test_workers_have_distinct_databases_and_keep_connection_options(index: int) -> None:
    database, redis = worker_urls(DATABASE, REDIS, f"gw{index}", 4)
    assert make_url(database) == make_url(DATABASE).set(database=f"robomera_test_gw{index}")
    assert make_url(redis) == make_url(REDIS).set(database=str(15 - index))


def test_serial_run_keeps_original_resources() -> None:
    assert worker_urls(DATABASE, REDIS, "master", 1) == (DATABASE, REDIS)


def test_redis_query_database_cannot_override_worker_isolation() -> None:
    _, redis = worker_urls(DATABASE, "rediss://test:secret@localhost/0?db=15", "gw1", 4)
    assert make_url(redis).database == "14"
    assert make_url(redis).query["db"] == "14"


def test_too_many_workers_fail_before_using_another_redis_database() -> None:
    with pytest.raises(ValueError, match="one descending database number"):
        worker_urls(DATABASE, "redis://localhost/1", "gw0", 4)


def test_long_database_name_cannot_be_truncated_into_another_workers_database() -> None:
    with pytest.raises(ValueError, match="exceeds 63 bytes"):
        worker_urls(f"postgresql+asyncpg://localhost/{'a' * 63}", REDIS, "gw0", 4)

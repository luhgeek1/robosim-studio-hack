from sqlalchemy.engine import make_url


def worker_urls(database_url: str, redis_url: str, worker_id: str, worker_count: int) -> tuple[str, str]:
    if worker_id == "master":
        return database_url, redis_url

    index = int(worker_id.removeprefix("gw"))
    database = make_url(database_url)
    name = f"{database.database}_{worker_id}"
    if len(name.encode()) > 63:
        raise ValueError("RS_TEST_DATABASE_URL database name with worker suffix exceeds 63 bytes")

    redis = make_url(redis_url)
    # Redis URL query parameters override its path, including the database number.
    base = int(str(redis.query.get("db", redis.database or "0")))
    if worker_count > base + 1:
        raise ValueError("RS_TEST_REDIS_URL must reserve one descending database number per test worker")
    redis = redis.set(database=str(base - index))
    if "db" in redis.query:
        redis = redis.update_query_dict({"db": str(base - index)})
    return (
        database.set(database=name).render_as_string(hide_password=False),
        redis.render_as_string(hide_password=False),
    )

"""Fixed-window rate limiter in Redis: ``limit`` hits per ``window_s`` per key."""

from redis.asyncio import Redis


class RateLimiter:
    def __init__(self, redis: "Redis", *, limit: int, window_s: int) -> None:
        self._redis = redis
        self._limit = limit
        self._window_s = window_s

    async def hit(self, key: str) -> bool:
        """Register a hit; ``False`` means the limit is exceeded."""
        redis_key = f"rl:{key}"
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.incr(redis_key)
            pipe.expire(redis_key, self._window_s, nx=True)
            count, _ = await pipe.execute()
        return int(count) <= self._limit

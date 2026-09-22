from redis.asyncio import Redis

from app.core.config import Settings


def create_redis(settings: Settings) -> "Redis":
    redis: Redis = Redis.from_url(settings.redis_url, decode_responses=True)
    return redis

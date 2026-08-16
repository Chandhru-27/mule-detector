from fastapi import Request
from app.services.redis_service import RedisClientService


def get_redis(request: Request) -> RedisClientService:
    """
    Pull Redis client from app.state
    Created once in lifespan and reused across requests
    """
    return request.app.state.redis

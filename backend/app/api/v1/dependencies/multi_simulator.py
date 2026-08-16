from fastapi import Request

from app.services.multi_simulator import MultiChannelSimulator
from app.services.masking_service import MaskingService
from app.services.redis_service import RedisClientService


def get_multi_simulator(request: Request) -> MultiChannelSimulator:
    return request.app.state.multi_simulator


def get_masking_service(request: Request) -> MaskingService:
    return request.app.state.masking


def get_redis_service(request: Request) -> RedisClientService:
    return request.app.state.redis

import time
import structlog
from fastapi import APIRouter, Depends, status
from app.schemas.common import HealthResponse, StatusResponse
from app.services.redis_service import RedisClientService
from app.api.v1.dependencies.redis import get_redis


router = APIRouter()
logger = structlog.get_logger(__name__)


@router.get(
    "/health",
    status_code=status.HTTP_200_OK,
    tags=["health"],
    summary="Health check",
    response_description="System health status",
    response_model=HealthResponse,
)
async def health_check():
    logger.debug("Checking System Health")
    return HealthResponse(status="ok")


@router.get(
    "/status",
    status_code=status.HTTP_200_OK,
    tags=["health"],
    summary="Service status",
    response_description="System service status",
    response_model=StatusResponse,
)
async def service_status():
    logger.debug("Checking Service Status")
    return StatusResponse(status="ok", service_name="transaction_simulator_service")


@router.get(
    "/health/redis",
    tags=["health"],
    summary="Redis velocity pipeline diagnostic",
    response_description="Write-then-read roundtrip result",
)
async def redis_health(redis: RedisClientService = Depends(get_redis)):
    """
    End-to-end diagnostic: write a test transaction into sorted sets,
    read it back, verify counts, then clean up.

    If txn_count_1h == 1, the pipeline is working correctly.
    If txn_count_1h == 0, the sorted-set logic is broken.
    """
    try:
        # 1. connectivity check
        await redis.client.ping()

        # 2. write a test velocity entry
        test_hash = "debug_test_account"
        ts = int(time.time())
        await redis.update_velocity(
            account_hash=test_hash,
            receiver_ref="test_receiver",
            amount=1000.0,
            timestamp=ts,
            txn_id="debug_txn_001",
        )

        # 3. immediately read it back
        velocity = await redis.get_velocity(test_hash)

        # 4. clean up test keys
        for suffix in ["1h", "6h", "24h"]:
            await redis.client.delete(f"vel_txns:{suffix}:{test_hash}")
            await redis.client.delete(f"vel_amounts:{suffix}:{test_hash}")
            await redis.client.delete(f"vel_receivers:{suffix}:{test_hash}")

        passed = velocity.get("txn_count_1h") == 1

        return {
            "status": "ok",
            "test_velocity_write_read": velocity,
            "expected_txn_count_1h": 1,
            "pass": passed,
        }
    except Exception as e:
        logger.error("redis_health_check_failed", error=str(e))
        return {"status": "error", "error": str(e)}

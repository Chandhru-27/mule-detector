import json
import structlog

from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse

from app.schemas.common import ErrorReponse
from app.api.v1.dependencies.simulator import get_simulator
from app.api.v1.dependencies.kafka import get_kafka
from app.api.v1.dependencies.redis import get_redis
from app.services.redis_service import RedisClientService
from app.services.simulator_service import SimulatorService
from app.services.kafka_service import KafkaProducerService
from app.services.masking_service import mask
from app.schemas.transaction import StreamRequest, StreamStatus


router = APIRouter(prefix="/data")
logger = structlog.get_logger(__name__)


async def chunk_generator(
    request: StreamRequest,
    simulator: SimulatorService,
    kafka: KafkaProducerService,
    redis: RedisClientService,
):
    """
    Async generator that wraps simulator.stream_chunks()
    and produces data to kafka producer, Aditionally this also
    formats each chunk as a Server-Sent Event (SSE) string.

    SSE format is simply:
        data: <json string>\n\n

    The double newline signals end of one event to the client.
    This is a standard browser-readable format that works with EventSource API.
    """
    try:
        async for chunk in simulator.stream_chunks(
            chunk_size=request.chunk_size,
            delay_seconds=request.delay_seconds,
            max_rows=request.max_rows,
        ):
            salt = "mule_detector_v1"

            def sha(value: str) -> str:
                import hashlib

                return hashlib.sha256(f"{value}{salt}".encode()).hexdigest()[:16]

            account_hashes = [sha(str(row.get("account_number", ""))) for row in chunk]
            redis_aggs = await redis.get_txn_aggregates_batch(account_hashes)

            enriched_chunk = []
            for row, account_hash in zip(chunk, account_hashes):
                enriched = await mask(row, redis_aggs=redis_aggs[account_hash])
                enriched_chunk.append(enriched)
                await kafka.produce_transaction(row)

            payload = {
                "rows": enriched_chunk,
                "count": len(enriched_chunk),
            }
            yield f"data: {json.dumps(payload)}\n\n"

    except Exception as e:
        logger.error("stream_error", error=str(e))
        yield f"error: {json.dumps(str(e))}\n\n"


@router.post(
    "/stream",
    summary="Stream transactions",
    description="Streams transaction rows from the dataset in chunks as Server-Sent Events.",
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "Stream started successfully"},
        503: {"model": ErrorReponse, "description": "Dataset not loaded"},
    },
)
async def stream_transactions(
    request: StreamRequest,
    simulator: SimulatorService = Depends(get_simulator),
    kafka: KafkaProducerService = Depends(get_kafka),
    redis: RedisClientService = Depends(get_redis),
):
    """
    POST /api/v1/data/stream

    Client sends:
        { "chunk_size": 100, "delay_seconds": 0.1, "max_rows": 500 }

    Server responds with a continuous stream of SSE events:
        data: {"rows": [{...}, {...}], "count": 100}

        data: {"rows": [{...}, {...}], "count": 100}

        ...
    """
    if not simulator.is_loaded:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Dataset not loaded yet",
        )

    logger.info(
        "stream_request_received",
        chunk_size=request.chunk_size,
        delay_seconds=request.delay_seconds,
        max_rows=request.max_rows,
        total_available=simulator.total_rows,
    )

    return StreamingResponse(
        chunk_generator(request=request, simulator=simulator, kafka=kafka, redis=redis),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/stream/status",
    summary="Dataset status",
    response_model=StreamStatus,
)
async def stream_status(
    simulator: SimulatorService = Depends(get_simulator),
    kafka: KafkaProducerService = Depends(get_kafka),
    redis: RedisClientService = Depends(get_redis),
):
    """Returns current state of the loaded dataset."""
    return StreamStatus(
        status="ready" if simulator.is_loaded else "not_loaded",
        message="Dataset loaded and ready to stream"
        if simulator.is_loaded and kafka.is_loaded and redis.is_loaded
        else "Call POST /stream to begin",
        total_rows=simulator.total_rows,
        chunk_size=100,
    )

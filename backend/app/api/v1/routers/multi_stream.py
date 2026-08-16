import asyncio
import json
import structlog
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.v1.dependencies.multi_simulator import (
    get_multi_simulator,
    get_masking_service,
)
from app.api.v1.dependencies.kafka import get_kafka
from app.schemas.stream import MultiStreamRequest, MultiStreamStatus
from app.services.multi_simulator import MultiChannelSimulator
from app.services.masking_service import MaskingService
from app.services.kafka_service import KafkaProducerService


logger = structlog.get_logger(__name__)

router = APIRouter()


@router.post("/api/v1/multi-stream")
async def multi_stream(
    body: MultiStreamRequest,
    multi_simulator: MultiChannelSimulator = Depends(get_multi_simulator),
    masking: MaskingService = Depends(get_masking_service),
    kafka: KafkaProducerService = Depends(get_kafka),
):
    async def _multi_chunk_generator():
        chunk = []
        async for row in multi_simulator.stream_all(
            chunk_size=body.chunk_size,
            delay_seconds=body.delay_seconds,
            max_rows_per_channel=body.max_rows_per_channel,
        ):
            try:
                masked = await masking.mask_and_enrich(row)
                await kafka.produce_masked_transaction(masked)
                chunk.append(masked)
                if len(chunk) >= body.chunk_size:
                    yield f"data: {json.dumps({'rows': chunk, 'count': len(chunk)})}\n\n"
                    chunk = []
                    await asyncio.sleep(body.delay_seconds)
            except Exception as e:
                logger.error("row_processing_failed", error=str(e))
                continue
        if chunk:
            yield f"data: {json.dumps({'rows': chunk, 'count': len(chunk)})}\n\n"

    return StreamingResponse(
        _multi_chunk_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/api/v1/multi-stream/status", response_model=MultiStreamStatus)
async def multi_stream_status(
    multi_simulator: MultiChannelSimulator = Depends(get_multi_simulator),
):
    return MultiStreamStatus(
        status="ready" if multi_simulator.is_loaded else "loading",
        channels=multi_simulator.channel_status(),
    )

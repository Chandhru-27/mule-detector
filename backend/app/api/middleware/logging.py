# simulator/api/middleware/logging.py

import time
import structlog
from fastapi import Request

logger = structlog.get_logger(__name__)


async def logging_middleware(request: Request, call_next):
    """
    Logs every HTTP request with method, path, status and duration.
    Binds request context so all logs within this request carry
    method and path automatically.
    """

    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        method=request.method,
        path=request.url.path,
    )

    start = time.perf_counter()
    logger.info("request_started")

    response = await call_next(request)

    duration_ms = round((time.perf_counter() - start) * 1000)
    logger.info(
        "request_finished",
        status_code=response.status_code,
        duration_ms=duration_ms,
    )

    response.headers["X-Response-Time-Ms"] = str(duration_ms)
    return response

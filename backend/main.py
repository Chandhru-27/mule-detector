import structlog
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware


from app.core.config import settings
from app.api.v1.api import api_router 
from app.core.logging import init_logging
from app.api.middleware.logging import logging_middleware    
from app.api.v1.routers import health, stream, multi_stream


logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_logging(
        log_level=settings.LOG_LEVEL,
        json_logs=settings.json_logs
    )
    logger.info(
        "app_starting",
        app=settings.APP_NAME,
        env=settings.APP_ENV,
        log_level=settings.LOG_LEVEL,
        docs_url=f"Docs available at: http://{settings.HOST}:{settings.PORT}/api/docs",
    )

    # 1. risk table
    from app.services.risk_table import RiskTable
    app.state.risk_table = RiskTable(csv_path=settings.RISK_TABLE_PATH)
    await app.state.risk_table.load()

    # 2. redis
    from app.services.redis_service import RedisClientService
    app.state.redis = RedisClientService(
        host=settings.REDIS_HOST, port=settings.REDIS_PORT,
        db=settings.REDIS_DB, password=settings.REDIS_PASSWORD
    )
    await app.state.redis.connect()

    # 3. masking service (depends on risk_table + redis)
    from app.services.masking_service import MaskingService
    app.state.masking = MaskingService(
        risk_table=app.state.risk_table,
        redis=app.state.redis,
    )

    # 4. kafka producer
    from app.services.kafka_service import KafkaProducerService
    app.state.kafka = KafkaProducerService()
    await app.state.kafka.start()

    # 5. single channel simulator (legacy)
    from app.services.simulator_service import SimulatorService
    app.state.simulator = SimulatorService(csv_path=settings.CSV_PATH)
    await app.state.simulator.load()

    # 6. normaliser
    from app.services.normaliser import ChannelNormaliser
    app.state.normaliser = ChannelNormaliser(master_db_path=settings.MASTER_DB_PATH)
    await app.state.normaliser.load()

    # 7. multi channel simulator
    from app.services.multi_simulator import MultiChannelSimulator
    app.state.multi_simulator = MultiChannelSimulator(
        channel_csvs=settings.CHANNEL_CSVS,
        normaliser=app.state.normaliser,
    )
    await app.state.multi_simulator.load()

    logger.info("app_ready", app=settings.APP_NAME)

    yield

    # shutdown
    await app.state.redis.disconnect()
    await app.state.kafka.stop()
    logger.info("app_shutting_down")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.middleware("http")(logging_middleware)

    app.include_router(health.router, prefix="/api")
    app.include_router(stream.router, prefix="/api/v1", tags=["stream"])
    app.include_router(multi_stream.router, prefix="", tags=["multi-stream"]) 
    
    return app

app = create_app()

@app.get("/")
async def root():
    """
    Root endpoint
    """
    return JSONResponse(
        content={
            "app": settings.APP_NAME, 
            "message": "Welcome to mule detector backend",
            "version": settings.APP_VERSION,
            "status": "running",
        }
    )


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.debug,
        log_level=settings.LOG_LEVEL.lower()
    )

 

import json
import structlog

from confluent_kafka import Producer
from app.core.config import settings


logger = structlog.get_logger(__name__)


class KafkaProducerService:
    """
    Wraps confluent-kafka Producer,
    Used through FastAPI dependency injection.
    """

    def __init__(self):
        self._producer: Producer | None = None

    async def start(self) -> None:
        """
        Loads kafka service into app state,
        Call once in lifespan startup.
        """
        config = {
            "bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS,
            "acks": "all",
            "linger.ms": 5,
            "compression.type": "snappy",
            "retries": 3,
        }
        self._producer = Producer(config)
        logger.info("kafka_producer_started", servers=settings.KAFKA_BOOTSTRAP_SERVERS)

    async def stop(self) -> None:
        """
        Unplugs kafka from app state and flushes pending
        messages, Call once in lifespan shutdown.
        """
        if self._producer:
            self._producer.flush(timeout=10)
            logger.info("kafka_producer_stopped")

    def _delivery_callback(self, error, message) -> None:
        """
        Confluent Kafka calls this after every produce() success or failure.
        Runs in background worker threads and not app's asyn loop.

        Args:
            error   : raw error signal thrown by kafka producer
            message : appropriate error message to the error thrown
        """
        if error:
            logger.error(
                "kafka_delivery_failed",
                error=str(error),
                topic=message.topic(),
                partition=message.partition(),
            )
        else:
            logger.debug(
                "kafka_delivered",
                topic=message.topic(),
                partition=message.partition(),
                offset=message.offset(),
            )

    async def produce_masked_transaction(self, masked_row: dict) -> None:
        """
        Produces one masked transaction to transactions.raw.
        Non-blocking — returns immediately, delivery confirmed via callback.
        """
        if not self._producer:
            raise RuntimeError("Producer not started. Call start() first.")

        key = masked_row["account_hash"]

        self._producer.produce(
            topic=settings.KAFKA_TOPIC_RAW,
            key=key.encode("utf-8"),
            value=json.dumps(masked_row).encode("utf-8"),
            on_delivery=self._delivery_callback,
        )

        self._producer.poll(0)

    # Backward compatibility method for existing stream router
    async def produce_transaction(self, row: dict) -> None:
        """
        Legacy method for backward compatibility with existing stream router.
        Masks and produces one transaction to transactions.raw.
        """
        from app.services.masking_service import mask

        masked_row = await mask(row=row)
        await self.produce_masked_transaction(masked_row)

    @property
    def is_loaded(self):
        return self._producer is not None

from fastapi import Request
from app.services.kafka_service import KafkaProducerService


def get_kafka(request: Request) -> KafkaProducerService:
    """
    Pulls the KafkaProducerService instance from app.state.
    app.state is set once in lifespan same object reused for every request.
    """
    return request.app.state.kafka

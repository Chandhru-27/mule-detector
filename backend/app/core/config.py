from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    APP_NAME: str = "mule_detector_data_streamer"
    APP_VERSION: str = "0.1.0"
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"

    HOST: str = "0.0.0.0"
    PORT: int = 8000
    ALLOWED_ORIGINS: List[str] = ["*"]

    CSV_PATH: str = "data/transactions_v2.csv"
    TRANSACTIONS_PER_SECOND: int = 10
    SIMULATOR_BATCH_SIZE: int = 50

    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"
    KAFKA_TOPIC_RAW: str = "transactions.raw"
    KAFKA_TOPIC_ENRICHED: str = "transactions.enriched"
    KAFKA_TOPIC_SCORED: str = "transactions.scored"
    KAFKA_TOPIC_DLQ: str = "transactions.dlq"
    KAFKA_NUM_PARTITIONS: int = 6
    KAFKA_REPLICATION_FACTOR: int = 1
    KAFKA_GROUP_ID: str = "mule-detector-consumer"

    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: str = "password"

    NEO4J_URI: str = "bolt://neo4j:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "password"

    RISK_TABLE_PATH: str = "data/risk_tables.csv"
    MASTER_DB_PATH: str = "data/master_db.json"
    CHANNEL_CSVS: dict = {
        "UPI": "data/channels/upi_transactions.csv",
        "NETBANKING": "data/channels/netbanking_transactions.csv",
        "APP": "data/channels/app_transactions.csv",
        "WEB": "data/channels/web_transactions.csv",
    }

    @property
    def debug(self) -> bool:
        return self.APP_ENV == "development"

    @property
    def json_logs(self) -> bool:
        return self.APP_ENV == "production"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


settings = Settings()

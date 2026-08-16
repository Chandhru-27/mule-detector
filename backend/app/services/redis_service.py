import redis.asyncio as aioredis
import structlog
from typing import Dict, List


logger = structlog.get_logger(__name__)

# Window definitions: (seconds, human-readable suffix)
WINDOWS = [(3600, "1h"), (21600, "6h"), (86400, "24h")]


class RedisClientService:
    def __init__(self, host: str, port: int, db: int, password: str):
        self.host = host
        self.port = port
        self.db = db
        self.password = password
        self.client: aioredis.Redis = None

    async def connect(self) -> None:
        self.client = aioredis.Redis(
            host=self.host,
            port=self.port,
            db=self.db,
            password=self.password or None,
            decode_responses=True,
        )
        # Fail fast if Redis is unreachable — do not let the app start broken
        await self.client.ping()
        logger.info("redis_connected", host=self.host, port=self.port, db=self.db)

    async def disconnect(self) -> None:
        if self.client:
            await self.client.close()
            logger.info("redis_disconnected")

    @property
    def is_connected(self) -> bool:
        return self.client is not None

    @property
    def is_loaded(self) -> bool:
        """Backward compatibility property for existing code."""
        return self.client is not None

    # ------------------------------------------------------------------
    # Write — must be called BEFORE get_velocity in mask_and_enrich
    # ------------------------------------------------------------------
    async def update_velocity(
        self,
        account_hash: str,
        receiver_ref: str | None,
        amount: float,
        timestamp: int,
        txn_id: str,
    ) -> None:
        """
        Write this transaction into the sliding-window sorted sets.

        Sorted-set contract
        -------------------
        vel_txns:<window>:<hash>      score=timestamp  member=txn_id
        vel_amounts:<window>:<hash>   score=amount     member=txn_id
        vel_receivers:<window>:<hash> score=timestamp   member=receiver_ref
        """
        try:
            pipe = self.client.pipeline()

            for window_seconds, suffix in WINDOWS:
                key_txns = f"vel_txns:{suffix}:{account_hash}"
                key_amounts = f"vel_amounts:{suffix}:{account_hash}"
                key_receivers = f"vel_receivers:{suffix}:{account_hash}"

                # --- evict expired entries FIRST ---
                min_ts = timestamp - window_seconds
                pipe.zremrangebyscore(key_txns, 0, min_ts)
                pipe.zremrangebyscore(key_amounts, 0, min_ts)
                pipe.zremrangebyscore(key_receivers, 0, min_ts)

                # --- add current transaction ---
                # score = timestamp (numeric, for ZREMRANGEBYSCORE)
                # member = txn_id  (unique per transaction)
                pipe.zadd(key_txns, {txn_id: timestamp})

                # score = amount (numeric, so we can sum scores later)
                # member = txn_id  (unique per transaction)
                pipe.zadd(key_amounts, {txn_id: amount})

                # score = timestamp, member = receiver_ref (natural dedup)
                if receiver_ref:
                    pipe.zadd(key_receivers, {receiver_ref: timestamp})

                # TTL as safety net so keys don't linger forever
                pipe.expire(key_txns, window_seconds)
                pipe.expire(key_amounts, window_seconds)
                pipe.expire(key_receivers, window_seconds)

            await pipe.execute()
            logger.debug(
                "velocity_updated",
                account_hash=account_hash,
                txn_id=txn_id,
                amount=amount,
            )
        except Exception as e:
            logger.error(
                "redis_update_velocity_failed",
                account_hash=account_hash,
                txn_id=txn_id,
                error=str(e),
            )
            raise

    # ------------------------------------------------------------------
    # Read — must be called AFTER update_velocity in mask_and_enrich
    # ------------------------------------------------------------------
    async def get_velocity(self, account_hash: str) -> Dict[str, int | float]:
        """
        Read the 9 velocity features for a single account.

        Returns dict with keys like txn_count_1h, amount_sum_6h, unique_receivers_24h.
        On error, logs and returns all-zero defaults so the pipeline keeps moving.
        """
        try:
            pipe = self.client.pipeline()

            for window_seconds, suffix in WINDOWS:
                key_txns = f"vel_txns:{suffix}:{account_hash}"
                key_amounts = f"vel_amounts:{suffix}:{account_hash}"
                key_receivers = f"vel_receivers:{suffix}:{account_hash}"

                pipe.zcard(key_txns)
                pipe.zrange(key_amounts, 0, -1, withscores=True)
                pipe.zcard(key_receivers)

            results = await pipe.execute()

            velocity: Dict[str, int | float] = {}
            idx = 0
            for _, suffix in WINDOWS:
                txn_count = results[idx]
                amounts_data = results[idx + 1]  # list of (member, score)
                receiver_count = results[idx + 2]

                # score = amount, so sum scores
                amount_sum = sum(float(score) for _, score in amounts_data)

                velocity[f"txn_count_{suffix}"] = int(txn_count)
                velocity[f"amount_sum_{suffix}"] = round(float(amount_sum), 2)
                velocity[f"unique_receivers_{suffix}"] = int(receiver_count)

                idx += 3

            return velocity

        except Exception as e:
            logger.error(
                "redis_get_velocity_failed",
                account_hash=account_hash,
                error=str(e),
            )
            return {
                "txn_count_1h": 0,
                "txn_count_6h": 0,
                "txn_count_24h": 0,
                "amount_sum_1h": 0.0,
                "amount_sum_6h": 0.0,
                "amount_sum_24h": 0.0,
                "unique_receivers_1h": 0,
                "unique_receivers_6h": 0,
                "unique_receivers_24h": 0,
            }

    # ------------------------------------------------------------------
    # Batch read
    # ------------------------------------------------------------------
    async def get_velocity_batch(
        self, account_hashes: List[str]
    ) -> Dict[str, Dict[str, int | float]]:
        if not account_hashes:
            return {}

        try:
            pipe = self.client.pipeline()
            for acc in account_hashes:
                self._add_velocity_commands(pipe, acc)

            results = await pipe.execute()

            out: Dict[str, Dict[str, int | float]] = {}
            idx = 0
            for acc in account_hashes:
                velocity: Dict[str, int | float] = {}
                for _, suffix in WINDOWS:
                    txn_count = results[idx]
                    amounts_data = results[idx + 1]
                    receiver_count = results[idx + 2]

                    amount_sum = sum(float(score) for _, score in amounts_data)

                    velocity[f"txn_count_{suffix}"] = int(txn_count)
                    velocity[f"amount_sum_{suffix}"] = round(float(amount_sum), 2)
                    velocity[f"unique_receivers_{suffix}"] = int(receiver_count)

                    idx += 3
                out[acc] = velocity

            return out

        except Exception as e:
            logger.error(
                "redis_get_velocity_batch_failed",
                account_hashes=account_hashes,
                error=str(e),
            )
            default = {
                "txn_count_1h": 0,
                "txn_count_6h": 0,
                "txn_count_24h": 0,
                "amount_sum_1h": 0.0,
                "amount_sum_6h": 0.0,
                "amount_sum_24h": 0.0,
                "unique_receivers_1h": 0,
                "unique_receivers_6h": 0,
                "unique_receivers_24h": 0,
            }
            return {acc: dict(default) for acc in account_hashes}

    # Backward compatibility with old stream router API
    async def get_txn_aggregates_batch(
        self, account_hashes: List[str]
    ) -> Dict[str, Dict[str, int]]:
        """Legacy method for compatibility with existing stream router."""
        velocity = await self.get_velocity_batch(account_hashes)
        return {
            acc: {
                "txn_count_1h": data.get("txn_count_1h", 0),
                "txn_count_6h": data.get("txn_count_6h", 0),
                "txn_count_24h": data.get("txn_count_24h", 0),
                "amount_sum_1h": data.get("amount_sum_1h", 0),
                "amount_sum_6h": data.get("amount_sum_6h", 0),
                "amount_sum_24h": data.get("amount_sum_24h", 0),
                "unique_receivers_1h": data.get("unique_receivers_1h", 0),
                "unique_receivers_6h": data.get("unique_receivers_6h", 0),
                "unique_receivers_24h": data.get("unique_receivers_24h", 0),
            }
            for acc, data in velocity.items()
        }

    def _add_velocity_commands(self, pipe, account_hash: str):
        """Queue read-commands onto an existing pipeline (no await needed — just queuing)."""
        for _, suffix in WINDOWS:
            key_txns = f"vel_txns:{suffix}:{account_hash}"
            key_amounts = f"vel_amounts:{suffix}:{account_hash}"
            key_receivers = f"vel_receivers:{suffix}:{account_hash}"

            pipe.zcard(key_txns)
            pipe.zrange(key_amounts, 0, -1, withscores=True)
            pipe.zcard(key_receivers)

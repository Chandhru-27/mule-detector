import hashlib
import math
import time
import structlog
import uuid
from datetime import datetime, timezone
from typing import Dict, Tuple, Optional
from app.services.redis_service import RedisClientService

logger = structlog.get_logger(__name__)


class MaskingService:
    def __init__(self, risk_table, redis: RedisClientService):
        self.risk_table = risk_table
        self.redis = redis

    def _parse_narration(self, narration: str) -> Tuple[str, Optional[str]]:
        parts = narration.split("/")
        channel_map = {
            "UPI": "UPI",
            "ATM": "ATM",
            "WEB-TRF": "WEB",
            "IMPS": "IMPS",
            "NEFT": "NEFT",
            "APP-P2P": "APP",
        }
        raw_channel = parts[0] if parts else ""
        channel = channel_map.get(raw_channel, "OTHER")
        receiver_ref = None
        if channel == "UPI" and len(parts) >= 4:
            receiver_ref = parts[3]
        elif channel in ("IMPS", "WEB", "NEFT") and len(parts) >= 2:
            receiver_ref = parts[1]
        elif channel == "APP" and len(parts) >= 4:
            receiver_ref = parts[3]
        return channel, receiver_ref

    async def mask_and_enrich(self, row: Dict) -> Dict:
        try:
            salt = "mule_detector_v1"

            def sha(value: str) -> str:
                return hashlib.sha256(f"{value}{salt}".encode()).hexdigest()[:16]

            def mask_name(name: str) -> str:
                return name[0] + "*" * (len(name) - 1) if name else "****"

            # Hash sensitive fields
            account_hash = sha(str(row.get("account_number", "")))
            mobile_hash = sha(str(row.get("mobile", "")))
            name_masked = mask_name(str(row.get("name", "")))

            # Channel and receiver explicit handling with fallback to narration parsing
            channel = row.get("channel")
            receiver_ref = row.get("receiver_ref")
            if not channel:
                narration = str(row.get("narration", ""))
                channel, receiver_ref = self._parse_narration(narration)

            # Risks
            pincode = str(row.get("pincode", ""))
            pincode_risk = self.risk_table.get_pincode_risk(pincode)
            channel_risk = self.risk_table.get_channel_risk(channel)

            # Amount
            amount = float(row.get("amount", 0))
            amount_log = round(math.log1p(amount), 3)

            # Transaction metadata
            timestamp = int(row.get("timestamp", int(time.time())))
            txn_id = row.get("txn_id") or str(uuid.uuid4())

            # ── STEP 1: WRITE velocity — record this transaction FIRST ──
            await self.redis.update_velocity(
                account_hash=account_hash,
                receiver_ref=receiver_ref,
                amount=amount,
                timestamp=timestamp,
                txn_id=txn_id,
            )

            # ── STEP 2: READ velocity — now includes this transaction ──
            velocity = await self.redis.get_velocity(account_hash)

            # Timestamps
            now = datetime.now(timezone.utc)
            produced_at = now.replace(microsecond=0).isoformat()
            enriched_at = now.isoformat()

            output = {
                "txn_id": txn_id,
                "account_hash": account_hash,
                "name_masked": name_masked,
                "mobile_hash": mobile_hash,
                "pincode": pincode,
                "account_product_type": row.get("account_product_type"),
                "amount": amount,
                "amount_log": amount_log,
                "timestamp": timestamp,
                "produced_at": produced_at,
                "channel": channel,
                "receiver_ref": receiver_ref,
                "channel_risk": channel_risk,
                "pincode_risk": pincode_risk,
                **velocity,
                "enriched_at": enriched_at,
            }

            return output
        except Exception as e:
            logger.error("masking_failed", error=str(e), txn_id=row.get("txn_id"))
            raise


# Legacy function for backward compatibility with existing stream router
async def mask(row: dict, redis_aggs: dict = None) -> dict:
    """
    Legacy masking function for backward compatibility.
    Hashes sensitive fields before they touch Kafka.
    Original values never leave this function.

    Args:
        row   : streamed response value as rows
        redis_aggs: (optional) pre-fetched redis aggregates for this account_hash
    """
    salt = "mule_detector_v1"

    def sha(value: str) -> str:
        return hashlib.sha256(f"{value}{salt}".encode()).hexdigest()[:16]

    def mask_name(name: str) -> str:
        return name[0] + "*" * (len(name) - 1) if name else "****"

    # Hashes and masks
    account_hash = sha(str(row.get("account_number", "")))
    mobile_hash = sha(str(row.get("mobile", "")))
    name_masked = mask_name(str(row.get("name", "")))

    # Channel and receiver explicit handling with fallback to narration parsing
    channel = row.get("channel")
    receiver_ref = row.get("receiver_ref")
    if not channel:
        narration = str(row.get("narration", ""))
        channel_map = {
            "UPI": "UPI",
            "ATM": "ATM",
            "WEB-TRF": "WEB",
            "IMPS": "IMPS",
            "NEFT": "NEFT",
            "APP-P2P": "APP",
        }
        parts = narration.split("/")
        raw_channel = parts[0] if parts else ""
        channel = channel_map.get(raw_channel, "OTHER")
        if channel == "UPI" and len(parts) >= 4:
            receiver_ref = parts[3]
        elif channel in ("IMPS", "WEB", "NEFT") and len(parts) >= 2:
            receiver_ref = parts[1]
        elif channel == "APP" and len(parts) >= 4:
            receiver_ref = parts[3]

    # Amount log
    amount = float(row.get("amount", 0))
    amount_log = round(math.log1p(amount), 3)

    # Risks
    pincode = str(row.get("pincode", ""))

    # Fetch risk table and redis from app state for legacy masking
    from app.services.risk_table import RiskTable

    # This is a workaround - ideally these would be injected
    # but we can't change the old stream router signature
    risk_table = RiskTable(csv_path="data/risk_tables.csv")
    await risk_table.load()

    pincode_risk = risk_table.get_pincode_risk(pincode)
    channel_risk = risk_table.get_channel_risk(channel)

    # Aggregates (use provided or fetch from Redis)
    if redis_aggs is not None:
        aggs = redis_aggs
    else:
        aggs = {
            "txn_count_1h": 0,
            "txn_count_6h": 0,
            "txn_count_24h": 0,
            "amount_sum_1h": 0,
            "amount_sum_6h": 0,
            "amount_sum_24h": 0,
            "unique_receivers_1h": 0,
            "unique_receivers_6h": 0,
            "unique_receivers_24h": 0,
        }

    # Timestamps
    now = datetime.now(timezone.utc)
    produced_at = now.replace(microsecond=0).isoformat()
    enriched_at = now.isoformat()

    # Generate txn_id if missing
    txn_id = row.get("txn_id") or str(uuid.uuid4())

    return {
        "txn_id": txn_id,
        "account_hash": account_hash,
        "name_masked": name_masked,
        "mobile_hash": mobile_hash,
        "pincode": pincode,
        "account_product_type": row.get("account_product_type"),
        "amount": amount,
        "amount_log": amount_log,
        "timestamp": int(row.get("timestamp", 0)),
        "produced_at": produced_at,
        "channel": channel,
        "receiver_ref": receiver_ref,
        "channel_risk": channel_risk,
        "pincode_risk": pincode_risk,
        **aggs,
        "enriched_at": enriched_at,
    }

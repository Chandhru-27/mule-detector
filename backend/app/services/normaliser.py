import asyncio
import json
import structlog
import uuid
from typing import Dict, Optional


logger = structlog.get_logger(__name__)


class ChannelNormaliser:
    def __init__(self, master_db_path: str):
        self.master_db_path = master_db_path
        self.accounts: Dict[str, Dict] = {}
        self.upi_index: Dict[str, str] = {}
        self.mobile_index: Dict[str, str] = {}
        self._loaded = False

    async def load(self) -> None:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._load_sync)
        self._loaded = True
        logger.info("normaliser_loaded", account_count=len(self.accounts))

    def _load_sync(self) -> None:
        with open(self.master_db_path, "r") as f:
            data = json.load(f)
            accounts_data = data.get("accounts", data)
            for account_number, record in accounts_data.items():
                self.accounts[account_number] = record
                if "upi_id" in record:
                    self.upi_index[record["upi_id"]] = account_number
                if "mobile" in record:
                    self.mobile_index[record["mobile"]] = account_number

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    # Per-channel field mappings: (amount_field, timestamp_field, txn_id_field)
    CHANNEL_FIELDS = {
        "UPI":        ("amount",            "txn_timestamp",    "upi_txn_ref"),
        "NETBANKING": ("transaction_amount", "transaction_date", "transaction_id"),
        "APP":        ("transfer_amount",   "initiated_at",     "txn_reference"),
        "WEB":        ("amount",            "timestamp_epoch",  "web_txn_id"),
    }

    def normalise(self, row: Dict, channel: str) -> Optional[Dict]:
        try:
            if channel == "UPI":
                sender = row.get("sender_vpa")
                rec = row.get("receiver_vpa")
                account_number = self.upi_index.get(str(sender)) if sender else None
                receiver_ref = self.upi_index.get(str(rec)) if rec else None
            elif channel == "NETBANKING":
                sender = row.get("debit_account_no")
                rec = row.get("credit_account_no")
                account_number = str(sender) if sender else None
                receiver_ref = str(rec) if rec else None
            elif channel == "APP":
                sender = row.get("sender_mobile")
                rec = row.get("receiver_mobile")
                account_number = self.mobile_index.get(str(sender)) if sender else None
                receiver_ref = self.mobile_index.get(str(rec)) if rec else None
            elif channel == "WEB":
                sender = row.get("from_account")
                rec = row.get("to_account")
                account_number = str(sender) if sender else None
                receiver_ref = str(rec) if rec else None
            else:
                logger.warning(
                    "normaliser_lookup_failed",
                    channel=channel,
                    error="unsupported_channel",
                )
                return None

            if not account_number or account_number not in self.accounts:
                logger.warning(
                    "normaliser_lookup_failed",
                    channel=channel,
                    error="account_not_found",
                    account_number=account_number,
                )
                return None

            account = self.accounts[account_number]

            # Extract amount/timestamp/txn_id using per-channel field names
            amount_field, ts_field, txn_id_field = self.CHANNEL_FIELDS.get(
                channel, ("amount", "timestamp", "txn_id")
            )

            raw_amount = row.get(amount_field, 0)
            raw_ts = row.get(ts_field, 0)

            # Parse timestamp — could be epoch int or date string
            try:
                timestamp = int(raw_ts)
            except (ValueError, TypeError):
                from datetime import datetime
                try:
                    timestamp = int(datetime.fromisoformat(str(raw_ts)).timestamp())
                except Exception:
                    timestamp = 0

            return {
                "txn_id": row.get(txn_id_field) or str(uuid.uuid4()),
                "channel": channel,
                "account_number": account_number,
                "name": account.get("name", ""),
                "mobile": account.get("mobile", ""),
                "pincode": account.get("pincode", ""),
                "account_product_type": account.get("account_product_type", ""),
                "amount": int(raw_amount),
                "timestamp": timestamp,
                "receiver_ref": receiver_ref,
                "bank": account.get("bank", ""),
                "narration": f"{channel}/{receiver_ref or ''}",
            }
        except Exception as e:
            logger.warning("normaliser_lookup_failed", channel=channel, error=str(e))
            return None

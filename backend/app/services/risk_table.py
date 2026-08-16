import asyncio
import csv
import structlog
from typing import Dict


logger = structlog.get_logger(__name__)


class RiskTable:
    def __init__(self, csv_path: str):
        self.csv_path = csv_path
        self.pincode_risk: Dict[str, float] = {}
        self.channel_risk: Dict[str, float] = {}
        self._loaded = False

    async def load(self) -> None:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._load_sync)
        self._loaded = True
        logger.info(
            "risk_table_loaded",
            pincode_count=len(self.pincode_risk),
            channel_count=len(self.channel_risk),
        )

    def _load_sync(self) -> None:
        with open(self.csv_path, newline="") as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                if row["type"] == "pincode":
                    self.pincode_risk[row["key"]] = float(row["value"])
                elif row["type"] == "channel":
                    self.channel_risk[row["key"]] = float(row["value"])

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def get_pincode_risk(self, pincode: str) -> float:
        return self.pincode_risk.get(str(pincode), 0.5)

    def get_channel_risk(self, channel: str) -> float:
        return self.channel_risk.get(str(channel), 0.5)

import asyncio
import structlog
import pandas as pd
from pathlib import Path
from typing import AsyncGenerator


logger = structlog.get_logger(__name__)


class SimulatorService:
    """
    Loads transaction CSV into memory once.
    Streams rows in chunks as async generator — caller controls chunk size and delay.
    """

    def __init__(self, csv_path: str):
        self.csv_path = Path(csv_path)
        self._df: pd.DataFrame | None = None

    async def load(self) -> None:
        """
        Called once at startup in lifespan.
        Reads CSV into a pandas DataFrame and keeps it in memory.
        All streaming calls read from this in-memory copy — no disk I/O per request.
        """
        if not self.csv_path.exists():
            raise FileNotFoundError(f"CSV not found: {self.csv_path}")

        logger.info("loading_dataset", path=str(self.csv_path))

        self._df = pd.read_csv(self.csv_path)

        logger.info(
            "dataset_loaded",
            rows=len(self._df),
            columns=list(self._df.columns),
        )

    @property
    def total_rows(self) -> int:
        return len(self._df) if self._df is not None else 0

    @property
    def is_loaded(self) -> bool:
        return self._df is not None

    async def stream_chunks(
        self,
        chunk_size: int = 50,
        delay_seconds: float = 0.1,
        max_rows: int | None = None,
    ) -> AsyncGenerator[list[dict], None]:
        """
        Yields chunks of rows from the DataFrame as lists of dicts.

        AsyncGenerator means this function uses 'yield' instead of 'return'.
        The caller gets one chunk at a time — the rest stays in memory untouched
        until the next iteration.

        Args:
            chunk_size    : rows per chunk
            delay_seconds : sleep between chunks — simulates real transaction rate
            max_rows      : cap total rows streamed (use only when writing tests)
        """
        if not self.is_loaded:
            raise RuntimeError("Dataset not loaded. Call load() first.")

        df = self._df

        if max_rows:
            df = df.head(max_rows)

        total = len(df)
        rows_sent = 0

        logger.info(
            "stream_started",
            total_rows=total,
            chunk_size=chunk_size,
            delay_seconds=delay_seconds,
        )

        for start in range(0, total, chunk_size):
            chunked_df = df.iloc[start : start + chunk_size]

            chunk = chunked_df.to_dict(orient="records")

            rows_sent += len(chunk)

            logger.debug(
                "chunk_yielded",
                rows_in_chunk=len(chunk),
                rows_sent=rows_sent,
                total_rows=total,
            )

            yield chunk

            if delay_seconds > 0:
                await asyncio.sleep(delay_seconds)

        logger.info("stream_completed", rows_sent=rows_sent)

import asyncio
import pandas as pd
import structlog
from typing import Dict, AsyncGenerator, Optional


logger = structlog.get_logger(__name__)


class MultiChannelSimulator:
    def __init__(self, channel_csvs: Dict[str, str], normaliser):
        self.channel_csvs = channel_csvs
        self.normaliser = normaliser
        self._dataframes: Dict[str, pd.DataFrame] = {}
        self._loaded = False

    async def load(self) -> None:
        tasks = []
        for channel, path in self.channel_csvs.items():
            tasks.append(self._load_channel(channel, path))
        await asyncio.gather(*tasks)
        self._loaded = True
        total_rows = sum(len(df) for df in self._dataframes.values())
        logger.info("multi_simulator_loaded", total_rows=total_rows)

    async def _load_channel(self, channel: str, path: str) -> None:
        loop = asyncio.get_event_loop()
        df = await loop.run_in_executor(None, pd.read_csv, path)
        self._dataframes[channel] = df
        logger.info("channel_loaded", channel=channel, rows=len(df))

    @property
    def is_loaded(self) -> bool:
        return self._loaded and all(self.normaliser.is_loaded for _ in self._dataframes)

    def channel_status(self) -> Dict[str, Dict]:
        return {
            channel: {
                "loaded": channel in self._dataframes,
                "total_rows": len(self._dataframes.get(channel, pd.DataFrame())),
            }
            for channel in self.channel_csvs.keys()
        }

    async def stream_all(
        self,
        chunk_size: int,
        delay_seconds: float,
        max_rows_per_channel: Optional[int] = None,
    ) -> AsyncGenerator[Dict, None]:
        active_gens = []
        for channel, df in self._dataframes.items():
            logger.info(
                "channel_stream_started",
                channel=channel,
                chunk_size=chunk_size,
                delay_seconds=delay_seconds,
                max_rows_per_channel=max_rows_per_channel,
            )
            gen = self._stream_channel(
                channel, df, chunk_size, delay_seconds, max_rows_per_channel
            )
            active_gens.append((channel, gen))

        while active_gens:
            await asyncio.sleep(delay_seconds)
            tasks = [anext(gen) for channel, gen in active_gens]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            next_active = []
            for (channel, gen), result in zip(active_gens, results):
                if isinstance(result, StopAsyncIteration):
                    logger.info("channel_stream_exhausted", channel=channel)
                elif isinstance(result, Exception):
                    logger.error("channel_stream_error", channel=channel, error=str(result))
                else:
                    yield result
                    next_active.append((channel, gen))
            
            active_gens = next_active

    async def _stream_channel(
        self,
        channel: str,
        df: pd.DataFrame,
        chunk_size: int,
        delay_seconds: float,
        max_rows: Optional[int],
    ) -> AsyncGenerator[Dict, None]:
        logger.info(
            "channel_stream_fire",
            channel=channel,
            total_rows=len(df),
            max_rows=max_rows,
        )
        rows_sent = 0
        rows_skipped = 0

        for start in range(0, len(df), chunk_size):
            if max_rows and rows_sent >= max_rows:
                break

            chunk = df.iloc[start : start + chunk_size]

            for _, row in chunk.iterrows():
                normalised = self.normaliser.normalise(row.to_dict(), channel)
                if normalised:
                    rows_sent += 1
                    yield normalised
                else:
                    rows_skipped += 1

            await asyncio.sleep(delay_seconds)

        logger.info(
            "channel_stream_complete",
            channel=channel,
            rows_sent=rows_sent,
            rows_skipped=rows_skipped,
        )

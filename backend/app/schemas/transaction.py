from pydantic import BaseModel, Field
from typing import Optional


class StreamRequest(BaseModel):
    """
    Body the client sends to POST /stream.
    All fields are optional — client can override defaults from settings.
    """

    chunk_size: int = Field(
        default=50, ge=1, le=1000, description="Number of rows to stream per chunk"
    )
    delay_seconds: float = Field(
        default=0.5, ge=0.0, le=10.0, description="Delay between chunks in seconds"
    )
    max_rows: Optional[int] = Field(
        default=None,
        ge=1,
        description="Stop after this many rows. None = stream entire dataset",
    )


class StreamStatus(BaseModel):
    """Response body returned immediately when streaming starts."""

    status: str
    message: str
    total_rows: int
    chunk_size: int

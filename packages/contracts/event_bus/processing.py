from __future__ import annotations

from enum import StrEnum


class EventProcessingStatus(StrEnum):
    PROCESSING = "processing"
    PROCESSED = "processed"
    RETRYING = "retrying"
    DEAD_LETTERED = "dead_lettered"

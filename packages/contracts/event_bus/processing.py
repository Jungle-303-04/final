from __future__ import annotations

from enum import StrEnum


class EventProcessingStatus(StrEnum):
    """consumer별 이벤트 처리 상태(멱등 ledger에 기록).

    흐름: PROCESSING → PROCESSED(성공)
          또는 PROCESSING → RETRYING → ... → DEAD_LETTERED(소진).
    """

    PROCESSING = "processing"  # 처리 시작(claim)
    PROCESSED = "processed"  # 성공 완료(ack)
    RETRYING = "retrying"  # 실패, 재시도 예정(nak)
    DEAD_LETTERED = "dead_lettered"  # 재시도 소진, DLQ로

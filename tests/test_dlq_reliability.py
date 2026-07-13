"""DLQ 신뢰성 회귀 — 핸들러 실패 반복 시 attempt 누적으로 결국 DLQ 도달 검증.

claim(attempt 증가)을 핸들러 트랜잭션과 분리하지 않으면, 핸들러 예외가 attempt 증가까지
롤백해 재시도 횟수가 누적되지 않고 영영 DLQ 에 못 감. 인메모리 store 로 트랜잭션 롤백을
흉내 내 그 회귀를 잠금.
"""

from __future__ import annotations

import asyncio
import copy
from contextlib import contextmanager
from typing import Any

from packages.contracts.event_bus.processing import EventProcessingStatus
from packages.contracts.interfaces import EventProcessingRecord
from packages.runtime.worker import EventProcessor, EventRetryPolicy

_DONE = (EventProcessingStatus.PROCESSED, EventProcessingStatus.DEAD_LETTERED)


class _StubStore:
    """인메모리 처리대장 + 트랜잭션 롤백 흉내(예외 시 변경 폐기)."""

    def __init__(self) -> None:
        self.rows: dict[tuple[str, str], dict[str, Any]] = {}
        self.durations: list[int | None] = []

    @contextmanager
    def unit_of_work(self) -> Any:
        snapshot = copy.deepcopy(self.rows)
        try:
            yield object()
        except BaseException:
            self.rows = snapshot  # rollback
            raise

    def record_event(self, evt: Any) -> None: ...
    def stage_events(self, conn: Any, events: Any) -> None: ...

    def begin_event_processing(self, evt: Any, consumer: str) -> EventProcessingRecord:
        row = self.rows.setdefault(
            (evt.event_id, consumer),
            {"status": EventProcessingStatus.PROCESSING, "attempts": 0},
        )
        if row["status"] not in _DONE:
            row["attempts"] += 1
            row["status"] = EventProcessingStatus.PROCESSING
        return EventProcessingRecord(status=row["status"], attempts=row["attempts"])

    def finish_event_processing(
        self, evt: Any, consumer: str, duration_ms: int | None = None
    ) -> None:
        self.rows[(evt.event_id, consumer)]["status"] = EventProcessingStatus.PROCESSED
        self.durations.append(duration_ms)

    def fail_event_processing(
        self,
        evt: Any,
        consumer: str,
        error: str,
        status: str,
        duration_ms: int | None = None,
    ) -> None:
        self.rows[(evt.event_id, consumer)]["status"] = status
        self.durations.append(duration_ms)


class _Evt:
    event_id = "evt-1"
    subject = "git.changed"
    source = "svc"
    correlation_id = "corr-1"
    causation_id = None
    payload: dict[str, Any] = {}


class _Codec:
    def decode(self, message: Any) -> _Evt:
        return _Evt()


class _DeadLetters:
    def __init__(self) -> None:
        self.captured: list[tuple[str, int]] = []

    async def capture(self, evt: Any, consumer: str, error: Any, attempts: int) -> Any:
        self.captured.append((evt.event_id, attempts))
        return evt

    async def capture_raw(self, raw: Any, consumer: str, error: Any) -> Any:
        return _Evt()


class _Message:
    data = b"{}"

    def __init__(self) -> None:
        self.acked = 0
        self.naked = 0

    async def ack(self) -> None:
        self.acked += 1

    async def nak(self, delay: int = 0) -> None:
        self.naked += 1


def test_handler_failure_accumulates_attempts_to_dlq() -> None:
    store = _StubStore()
    dead = _DeadLetters()

    async def failing_handler(evt: Any) -> Any:
        raise RuntimeError("boom")

    processor = EventProcessor(
        "svc",
        failing_handler,
        store,  # type: ignore[arg-type]
        dead,  # type: ignore[arg-type]
        EventRetryPolicy(max_attempts=3, retry_delay_seconds=0),
        codec=_Codec(),  # type: ignore[arg-type]
    )

    async def run() -> _Message:
        msg = _Message()
        for _ in range(3):  # 재배달 3회 시뮬레이션
            await processor.process(msg)
        return msg

    msg = asyncio.run(run())
    assert dead.captured == [("evt-1", 3)]  # 3회째에 DLQ 도달(롤백돼도 attempt 누적)
    assert store.rows[("evt-1", "svc")]["status"] == EventProcessingStatus.DEAD_LETTERED
    assert all(isinstance(duration, int) for duration in store.durations)
    assert msg.naked == 2 and msg.acked == 1  # 1·2회 nak(재시도), 3회 ack(DLQ)

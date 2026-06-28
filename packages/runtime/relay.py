"""OutboxRelay — outbox 에 적재된 이벤트를 NATS 로 발행(소비 루프와 별도).

저장된 봉투를 같은 event_id 로 발행 → relay 재시도 시 downstream 이 dedup.
각 워커는 자기 outbox 만 relay 한다.
"""

from __future__ import annotations

from packages.contracts.event_bus.interfaces import EnvelopePublisher
from packages.contracts.interfaces import OutboxReader

DEFAULT_BATCH = 100


class OutboxRelay:
    def __init__(
        self,
        store: OutboxReader,
        publisher: EnvelopePublisher,
        source: str,
        batch: int = DEFAULT_BATCH,
    ) -> None:
        self.store = store
        self.publisher = publisher
        self.source = source  # 자기 서비스가 적재한 행만 relay
        self.batch = batch

    async def run_once(self) -> int:
        """미발행 outbox 를 한 배치 발행하고 sent 표시. 발행 건수 반환."""
        rows = await self.store.unsent_events(self.batch, self.source)
        for evt in rows:
            await self.publisher.publish_envelope(evt)
        if rows:
            await self.store.mark_events_sent([e.event_id for e in rows])
        return len(rows)

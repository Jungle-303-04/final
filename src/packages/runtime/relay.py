"""OutboxRelay — outbox 에 적재된 이벤트를 NATS 로 발행(소비 루프와 별도).

저장된 봉투를 같은 event_id 로 발행 → relay 재시도 시 downstream 이 dedup.
각 워커는 자기 outbox 만 relay 한다.
"""

from __future__ import annotations

import asyncio

from packages.contracts.event_bus.interfaces import EnvelopePublisher
from packages.contracts.interfaces import OutboxReader

DEFAULT_BATCH = 1000
DEFAULT_PUBLISH_TIMEOUT_SECONDS = 10


class OutboxRelay:
    def __init__(
        self,
        store: OutboxReader,
        publisher: EnvelopePublisher,
        source: str,
        batch: int = DEFAULT_BATCH,
        publish_timeout_seconds: int = DEFAULT_PUBLISH_TIMEOUT_SECONDS,
    ) -> None:
        self.store = store
        self.publisher = publisher
        self.source = source  # 자기 서비스가 적재한 행만 relay
        self.batch = batch
        self.publish_timeout_seconds = publish_timeout_seconds

    async def run_once(self) -> int:
        """미발행 outbox 를 한 배치 발행하고 '발행된 것만' sent 표시. 발행 건수 반환.

        발행 도중 실패해도 finally 로 '이미 발행된 것'만 표시 → 다음 루프가 전체 배치를
        재발행하지 않는다(중복 최소화). 미발행 행은 표시 안 돼 다음에 재시도된다.
        """
        rows = await self.store.unsent_events(self.batch, self.source)
        published: list[str] = []
        try:
            for evt in rows:
                await asyncio.wait_for(
                    self.publisher.publish_envelope(evt),
                    timeout=self.publish_timeout_seconds,
                )
                published.append(evt.event_id)
        finally:
            if published:
                await self.store.mark_events_sent(published)
        return len(published)

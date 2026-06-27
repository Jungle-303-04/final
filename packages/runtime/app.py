"""App — 서비스 하나를 선언하는 단일 진입점(FastAPI 의 app 처럼).

서비스 파일(app.py) 한 곳에서:
    app = App("rca-worker")          # 서비스 이름 = 정체성(여기 한 번만)

    @app.sub(ClusterEvidenceReceived)  # 구독: 이 이벤트 오면 이 함수
    async def on_evidence(evt, ctx):
        yield EvidenceBuiltPayload(...)  # 체이닝 = yield

    if __name__ == "__main__":
        app.run()                       # NATS 붙여 실행

settings.py / 별도 핸들러 모듈 / import 배선이 사라진다. 내부(NATS/ledger/
runtime)는 App 이 숨긴다.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from packages.contracts.event_bus.registry import Subscription, events
from packages.contracts.event_bus.subjects import EventSubject
from packages.runtime.checks import (
    require_handler_signature,
    require_registered,
    require_single_handler,
    require_unique_handler,
)
from packages.runtime.dispatch import EventContext, make_event_handler

# 서비스는 App 과 EventContext 를 함께 쓰므로 여기서 재노출한다.
__all__ = ["App", "EventContext"]


class App:
    def __init__(self, name: str) -> None:
        self.name = name
        self._handlers: dict[EventSubject, Subscription] = {}

    def sub(self, payload_type: type) -> Callable[..., Any]:
        subject = require_registered(payload_type)

        def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
            require_unique_handler(self._handlers, subject)
            sub = Subscription(
                subject, payload_type, fn, require_handler_signature(fn)
            )
            self._handlers[subject] = sub
            events.note_handler(self.name, sub)  # 카탈로그 표시용
            return fn

        return decorator

    def run(self) -> None:
        """등록된 구독자를 NATS 에 붙여 실행. (런타임은 지연 import)"""
        from packages.contracts.event_bus.subscriptions import (
            WorkerSubscription,
        )
        from packages.runtime.service import WorkerService

        require_single_handler(self.name, self._handlers)
        sub = next(iter(self._handlers.values()))
        worker_sub = WorkerSubscription(
            service_name=self.name, subject=sub.subject
        )

        def factory(client: Any, db: Any) -> Callable[..., Any]:
            return make_event_handler(sub, client, db, self.name)

        WorkerService.from_subscription(worker_sub, factory).run()

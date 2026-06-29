"""App — 서비스 하나를 선언하는 단일 진입점(FastAPI 의 app 처럼).

서비스 파일(app.py) 한 곳에서:
    app = App("rca-worker")          # 서비스 이름 = 정체성(여기 한 번만)

    @app.sub(ClusterEvidenceReceivedBody)  # 구독: 이 이벤트 오면 이 함수
    async def on_evidence(evt, ctx):
        yield EvidenceBuiltBody(...)  # 체이닝 = yield

    if __name__ == "__main__":
        app.run()                       # NATS 붙여 실행

settings.py / 별도 핸들러 모듈 / import 배선 없음. 내부(NATS/ledger/
runtime)는 App 이 은닉.
"""

from __future__ import annotations

import inspect
from collections.abc import Callable
from typing import Any

from packages.config.errors import fail, require
from packages.contracts.event_bus.registry import Subscription, events
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.event_bus.subscriptions import ALL_EVENTS_SUBJECT, WorkerSubscription
from packages.runtime.dispatch import EventContext, make_event_handler, make_raw_handler

# App 과 EventContext 함께 쓰므로 여기서 재노출.
__all__ = ["App", "EventContext"]


class App:
    def __init__(self, name: str) -> None:
        self.name = name
        self._handlers: dict[EventSubject, Subscription] = {}
        self._raw: tuple[Callable[..., Any], bool] | None = None

    def sub(self, body_type: type) -> Callable[..., Any]:
        """타입 구독: 이 body 가 실린 이벤트 1종을 받음."""
        require(self._raw is None, f"{self.name}: @app.sub·@app.projector 혼용 불가", TypeError)
        subject = ensure_registered(body_type)

        def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
            ensure_unique_handler(self._handlers, subject)
            sub = Subscription(subject, body_type, fn, ensure_handler_signature(fn))
            self._handlers[subject] = sub
            events.note_handler(self.name, sub)  # 카탈로그 표시용
            return fn

        return decorator

    def projector(self, fn: Callable[..., Any]) -> Callable[..., Any]:
        """전체(>) 구독: 모든 이벤트를 봉투(EventEnvelope) 그대로 받음.

        대시보드/감사처럼 도메인을 가로지르는 프로젝터용.
        """
        require(not self._handlers and self._raw is None, f"{self.name}: 구독은 하나만", TypeError)
        self._raw = (fn, ensure_handler_signature(fn))
        events.note_raw_handler(self.name, fn.__name__)
        return fn

    @property
    def subscriptions(self) -> tuple[Subscription, ...]:
        return tuple(self._handlers.values())

    def run(self) -> None:
        """등록된 구독자를 NATS 에 붙여 실행. (런타임은 지연 import)"""
        from packages.runtime.service import WorkerService

        subject, factory = self._resolve()
        worker_sub = WorkerSubscription(service_name=self.name, subject=subject)
        WorkerService.from_subscription(worker_sub, factory).run()

    def _resolve(self) -> tuple[str, Callable[..., Any]]:
        """구독 종류(typed/raw)에 맞는 (subject, 핸들러 팩토리)."""
        if self._raw is not None:
            fn, wants_ctx = self._raw

            def raw_factory(client: Any, db: Any) -> Callable[..., Any]:
                return make_raw_handler(fn, wants_ctx, db, self.name)

            return ALL_EVENTS_SUBJECT, raw_factory

        ensure_single_handler(self.name, self._handlers)
        sub = self.subscriptions[0]

        def factory(client: Any, db: Any) -> Callable[..., Any]:
            return make_event_handler(sub, db, self.name)

        return sub.subject, factory


# ensure


def ensure_registered(body_type: type) -> Any:
    subject = getattr(body_type, "__subject__", None)
    require(subject is not None, f"{body_type.__name__} 미등록 — @events.reg 필요", TypeError)
    return subject


def ensure_handler_signature(fn: Callable[..., Any]) -> bool:
    params = [p for p in inspect.signature(fn).parameters.values() if p.name != "self"]
    require(1 <= len(params) <= 2, f"{fn.__name__} 시그니처는 (evt) 또는 (evt, ctx)", TypeError)
    return len(params) == 2


def ensure_unique_handler(handlers: dict[Any, Any], subject: Any) -> None:
    if subject in handlers:
        fail(f"{subject} 구독자 중복: {handlers[subject].fn.__name__}", TypeError)


def ensure_single_handler(service: str, handlers: dict[Any, Any]) -> None:
    require(len(handlers) == 1, f"{service}: 핸들러 1개만(현재 {len(handlers)})", RuntimeError)

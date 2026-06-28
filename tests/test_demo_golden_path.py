"""데모 golden path — API 입구부터 outbound 게이트웨이까지 한 바퀴.

프레임워크 4계층(API→event→worker→outbound)을 한 테스트로 따라간다:
    demo.ping.requested → ping-worker → demo.pong.requested
      → ping-gateway → (외부 호출) → demo.pong.delivered
그리고 인과(causation) 자동 전파를 런타임 수준에서 확인한다.
"""

from __future__ import annotations

import asyncio
from typing import Any

from conftest import load_service, run_handler, subjects_of

from packages.contracts.event_bus.bodies import DemoPingRequested, DemoPongRequestedBody
from packages.events.bus import RecordedEventClient, event_causation
from packages.events.envelope import event


class FakeOutbound:
    """외부 호출을 기록하는 가짜 어댑터(테스트에서 HttpOutbound 교체)."""

    def __init__(self, fail: bool = False) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.fail = fail

    async def post(self, path: str, body: dict[str, Any]) -> int:
        self.calls.append((path, body))
        if self.fail:
            raise RuntimeError("callback unreachable")
        return 200


def test_golden_path_ping_to_outbound_callback() -> None:
    worker = load_service("demo/ping-worker")
    gateway = load_service("demo/ping-gateway")
    outbound = FakeOutbound()
    gateway.outbound = outbound

    # 1) ping-worker: ping → pong.requested
    pong_reqs = run_handler(worker.on_ping, DemoPingRequested(message="hello"))
    assert subjects_of(pong_reqs) == ["demo.pong.requested"]
    assert pong_reqs[0].message == "pong: hello"

    # 2) ping-gateway: pong.requested → 외부 호출 → pong.delivered
    delivered = run_handler(gateway.on_pong_requested, pong_reqs[0])
    assert subjects_of(delivered) == ["demo.pong.delivered"]
    # 외부(api-gateway /demo/callback)로 되돌아간 호출 1건
    assert outbound.calls == [("/demo/callback", {"message": "pong: hello"})]


def test_outbound_failure_emits_failed() -> None:
    gateway = load_service("demo/ping-gateway")
    gateway.outbound = FakeOutbound(fail=True)
    out = run_handler(
        gateway.on_pong_requested,
        DemoPongRequestedBody(message="pong: x", reply_to="/demo/callback"),
    )
    assert subjects_of(out) == ["demo.pong.failed"]
    assert "unreachable" in out[0].error


def test_causation_auto_propagates_through_runtime() -> None:
    # 런타임은 핸들러를 event_causation(부모 event_id) 안에서 실행한다.
    # 그 안에서 emit 한 자식은 correlation 유지 + causation=부모 event_id.
    published: list[Any] = []

    class Pub:
        async def emit(
            self,
            subject: str,
            source: str,
            payload: dict[str, Any],
            correlation_id: str | None = None,
            causation_id: str | None = None,
        ) -> Any:
            evt = event(subject, source, payload, correlation_id, causation_id)
            published.append(evt)
            return evt

    class Rec:
        def record_event(self, evt: Any) -> None: ...

    async def run() -> None:
        client = RecordedEventClient(Pub(), Rec())
        parent = event("demo.ping.requested", "api-gateway", {}, "corr-1")
        with event_causation(parent.event_id):
            child = await client.emit(
                "demo.pong.requested", "demo-ping-worker", {}, parent.correlation_id
            )
        assert child.correlation_id == "corr-1"
        assert child.causation_id == parent.event_id

    asyncio.run(run())

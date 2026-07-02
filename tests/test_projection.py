"""audit 프로젝터(@app.on_any, 전체 구독) 동작 검증."""

from __future__ import annotations

from conftest import SpyDb, load_service, run_handler

from packages.contracts.event_bus.interfaces import EventEnvelope


def _evt(
    subject: str, source: str = "rca-worker", payload: dict[str, object] | None = None
) -> EventEnvelope:
    return EventEnvelope(
        event_id="e1",
        subject=subject,
        source=source,
        correlation_id="c1",
        causation_id=None,
        created_at="t",
        payload=payload or {},
    )


def test_audit_appends_log_without_chaining() -> None:
    audit = load_service("projection/audit-worker")
    db = SpyDb()
    outs = run_handler(audit.on_event, _evt("command.requested"), db=db)
    assert outs == []
    assert db.called("append_audit_log")

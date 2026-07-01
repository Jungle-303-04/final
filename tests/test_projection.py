"""dashboard·audit 프로젝터(@app.on_event, 전체 구독) 동작 검증."""

from __future__ import annotations

from conftest import SpyDb, load_service, run_handler, subjects_of

from domains.projection.repository import workspace_id_from_payload
from packages.config.constants import CommandStatus
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


def test_dashboard_projects_and_emits_update() -> None:
    dash = load_service("projection/dashboard-worker")
    db = SpyDb()
    outs = run_handler(dash.on_event, _evt("safe_pr.created"), db=db)
    assert subjects_of(outs) == ["dashboard.updated"]
    assert db.called("upsert_dashboard")


def test_dashboard_marks_failed_command_result_as_attention() -> None:
    dash = load_service("projection/dashboard-worker")
    db = SpyDb()
    outs = run_handler(
        dash.on_event,
        _evt(
            "command.completed",
            payload={
                "command_id": "cmd-1",
                "result": {
                    "status": CommandStatus.COMPLETED,
                    "applied": False,
                    "message": "kubernetes api not configured; dry-run only",
                },
            },
        ),
        db=db,
    )

    assert subjects_of(outs) == ["dashboard.updated"]
    assert outs[0].status == "attention"
    assert db.calls[0][1][1] == "attention"


def test_dashboard_uses_command_result_workspace() -> None:
    assert (
        workspace_id_from_payload(
            {
                "command_id": "cmd-1",
                "result": {
                    "workspace_id": "workspace-2",
                    "status": CommandStatus.COMPLETED,
                    "applied": True,
                },
            }
        )
        == "workspace-2"
    )


def test_dashboard_ignores_its_own_event() -> None:
    dash = load_service("projection/dashboard-worker")
    db = SpyDb()
    outs = run_handler(dash.on_event, _evt("dashboard.updated"), db=db)
    assert outs == []
    assert not db.called("upsert_dashboard")


def test_audit_appends_log_without_chaining() -> None:
    audit = load_service("projection/audit-worker")
    db = SpyDb()
    outs = run_handler(audit.on_event, _evt("command.requested"), db=db)
    assert outs == []
    assert db.called("append_audit_log")

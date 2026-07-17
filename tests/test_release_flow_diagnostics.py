"""Unit coverage for release-flow plans and editor diagnostics."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from domains.diagnostics.router import (
    release_plan_diagnostics,
    settings_diagnostics,
    yaml_diagnostics,
)
from domains.release_flow import router as release_router
from domains.release_flow.execution import (
    dry_run_event_id,
    execution_profile,
    release_execution_blockers,
)
from domains.release_flow.preview import build_release_plan_preview
from domains.release_flow.repository import (
    derive_release_plan_id,
    github_release_metadata,
    release_audit_event_type_filter,
    release_run_steps_from_plan,
    release_step_values,
    serialize_release_run,
    serialize_release_run_event,
)
from domains.release_flow.router import dispatch_request_for_step, steps_for_wave
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.responses import DiagnosticItem
from packages.contracts.gitops import DEFAULT_WORKFLOW_RUN_ID


def codes(items: list[DiagnosticItem]) -> set[str]:
    return {item.code for item in items}


def test_release_production_evidence_urls_require_live_https_hosts() -> None:
    assert release_router.release_runbook_url_is_valid(
        "https://wiki.company.internal/runbooks/checkout"
    )
    assert release_router.release_verification_url_is_valid(
        "https://checkout.company.internal/readyz"
    )
    assert not release_router.release_runbook_url_is_valid(
        "http://wiki.company.internal/runbooks/checkout"
    )
    assert not release_router.release_verification_url_is_valid("https://example.com/readyz")
    assert not release_router.release_verification_url_is_valid("https://api.localhost/readyz")


def release_plan_request(plan_id: str | None = None) -> release_router.ReleasePlanUpsertRequest:
    return release_router.ReleasePlanUpsertRequest(
        plan_id=plan_id,
        name="Checkout release",
        settings={"runtime_mode": "demo", "approval_policy": "auto_safe"},
        steps=[
            {
                "application_id": "app-a",
                "name": "Checkout",
                "position": 0,
                "config": {
                    "branch": "main",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                    "health_check_path": "/readyz",
                },
            }
        ],
    )


class ReleasePlanWriteDb:
    def __init__(self) -> None:
        self.upserts: list[dict[str, object]] = []

    def lock_release_plan_identity(self, _workspace_id: str, _name: str) -> None:
        return None

    def get_release_plan(
        self,
        workspace_id: str,
        plan_id: str,
        *,
        for_update: bool = False,
    ) -> dict[str, object] | None:
        del for_update
        if workspace_id == "workspace-a" and plan_id == "path-plan":
            return {
                "workspace_id": workspace_id,
                "plan_id": plan_id,
                "name": "Existing release",
                "steps": [{"application_id": "app-a", "position": 0}],
            }
        return None

    def get_release_plan_by_name(
        self,
        _workspace_id: str,
        _name: str,
        *,
        for_update: bool = False,
    ) -> dict[str, object] | None:
        del for_update
        return None

    def can_access(
        self,
        _user_id: str,
        _workspace_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        return (
            resource_type == "application"
            and resource_id == "app-a"
            and permission == "application.manage"
        )

    def upsert_release_plan(self, payload: dict[str, object]) -> dict[str, object]:
        self.upserts.append(payload)
        return payload


def release_operator() -> SimpleNamespace:
    return SimpleNamespace(
        workspace_id="workspace-a",
        user_id="operator",
        roles=("release_operator",),
    )


def test_create_release_plan_without_explicit_id_still_writes() -> None:
    db = ReleasePlanWriteDb()

    response = asyncio.run(
        release_router.create_release_plan(
            release_plan_request(),
            current=release_operator(),
            db=db,
        )
    )

    assert response.plan["workspace_id"] == "workspace-a"
    assert db.upserts[0]["plan_id"] is None


def test_create_release_plan_rejects_explicit_plan_id_before_write() -> None:
    db = ReleasePlanWriteDb()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.create_release_plan(
                release_router.ReleasePlanUpsertRequest(
                    plan_id="client-controlled-plan",
                    name="Checkout release",
                ),
                current=release_operator(),
                db=db,
            )
        )

    assert exc.value.status_code == 422
    assert db.upserts == []


def test_update_release_plan_keeps_using_path_id() -> None:
    db = ReleasePlanWriteDb()

    response = asyncio.run(
        release_router.update_release_plan(
            "path-plan",
            release_router.ReleasePlanUpsertRequest(
                plan_id="ignored-body-plan",
                name="Updated release",
                steps=[{"application_id": "app-a", "position": 0}],
            ),
            current=release_operator(),
            db=db,
        )
    )

    assert response.plan["plan_id"] == "path-plan"
    assert db.upserts[0]["plan_id"] == "path-plan"


def test_release_run_summary_route_precedes_dynamic_run_route() -> None:
    paths = [
        route.path
        for route in release_router.router.routes
        if "GET" in getattr(route, "methods", set())
    ]

    assert paths.index(gateway_routes.RELEASE_RUN_SUMMARY_PATH) < paths.index(
        gateway_routes.RELEASE_RUN_PATH
    )


def test_release_plan_permission_helpers_use_separate_permissions(monkeypatch) -> None:
    seen: list[tuple[str, str]] = []

    def capture_access(
        _db: object,
        _current: object,
        _workspace_id: str,
        _resource_type: str,
        resource_id: str,
        action: str,
    ) -> None:
        seen.append((resource_id, action))

    monkeypatch.setattr(release_router, "require_resource_access", capture_access)
    current = SimpleNamespace(user_id="operator")
    steps = [{"application_id": "checkout"}]

    release_router.require_plan_application_plan_manage_access(
        object(), current, "workspace-a", steps
    )
    release_router.require_plan_application_manage_access(object(), current, "workspace-a", steps)
    release_router.require_plan_application_rollback_access(object(), current, "workspace-a", steps)
    release_router.require_plan_application_cancel_access(object(), current, "workspace-a", steps)
    release_router.require_plan_application_audit_access(object(), current, "workspace-a", steps)

    assert seen == [
        ("checkout", release_router.Permission.APPLICATION_MANAGE.value),
        ("checkout", release_router.Permission.DEPLOY_RUN.value),
        ("checkout", release_router.Permission.ROLLBACK_RUN.value),
        ("checkout", release_router.Permission.RUNNER_JOB_CANCEL.value),
        ("checkout", release_router.Permission.EVIDENCE_READ.value),
    ]


def test_advance_release_run_requires_manage_access(monkeypatch) -> None:
    db = ReleaseRunActionDb()
    seen: list[tuple[str, str]] = []

    def require_manage(
        _db: object,
        _current: object,
        workspace_id: str,
        steps: list[dict[str, object]],
    ) -> None:
        seen.append((workspace_id, str(steps[0]["application_id"])))

    monkeypatch.setattr(release_router, "require_plan_application_manage_access", require_manage)

    current = SimpleNamespace(
        workspace_id="workspace-a", user_id="operator", roles=("release_operator",)
    )
    response = asyncio.run(
        release_router.advance_release_run("release-run-1", current=current, db=db, events=object())
    )

    assert seen == [("workspace-a", "checkout")]
    assert response.run["run_id"] == "release-run-1"
    assert db.updated


def test_advance_release_run_blocks_when_verification_job_is_pending(monkeypatch) -> None:
    db = ReleaseRunActionDb(verification_job_status="pending")
    monkeypatch.setattr(
        release_router, "require_plan_application_manage_access", lambda *_args: None
    )

    current = SimpleNamespace(
        workspace_id="workspace-a", user_id="operator", roles=("release_operator",)
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.advance_release_run(
                "release-run-1",
                current=current,
                db=db,
                events=object(),
            )
        )

    assert exc.value.status_code == 409
    assert (
        "post-deploy verification kubernetes_health_check is pending"
        in exc.value.detail["blockers"][0]
    )
    assert db.updated == []


def test_advance_release_run_blocks_when_verification_job_failed(monkeypatch) -> None:
    db = ReleaseRunActionDb(verification_job_status="failed", step_health_status="unhealthy")
    monkeypatch.setattr(
        release_router, "require_plan_application_manage_access", lambda *_args: None
    )

    current = SimpleNamespace(
        workspace_id="workspace-a", user_id="operator", roles=("release_operator",)
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.advance_release_run(
                "release-run-1",
                current=current,
                db=db,
                events=object(),
            )
        )

    assert exc.value.status_code == 409
    assert any("health is unhealthy" in blocker for blocker in exc.value.detail["blockers"])
    assert any(
        "post-deploy verification kubernetes_health_check failed" in blocker
        for blocker in exc.value.detail["blockers"]
    )
    assert db.updated == []


def test_advance_release_run_blocks_when_verification_job_timed_out(monkeypatch) -> None:
    db = ReleaseRunActionDb(verification_job_status="timeout")
    monkeypatch.setattr(
        release_router, "require_plan_application_manage_access", lambda *_args: None
    )

    current = SimpleNamespace(
        workspace_id="workspace-a", user_id="operator", roles=("release_operator",)
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.advance_release_run(
                "release-run-1",
                current=current,
                db=db,
                events=object(),
            )
        )

    assert exc.value.status_code == 409
    assert any(
        "post-deploy verification kubernetes_health_check failed" in blocker
        for blocker in exc.value.detail["blockers"]
    )
    assert db.updated == []


def test_rollback_release_run_checks_rollback_access_before_mutating(monkeypatch) -> None:
    db = ReleaseRunActionDb()

    def deny_rollback(*_args: object, **_kwargs: object) -> None:
        raise HTTPException(status_code=403, detail="denied")

    monkeypatch.setattr(release_router, "require_plan_application_rollback_access", deny_rollback)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.rollback_release_run(
                "release-run-1",
                release_router.ReleaseRunActionRequest(reason="test"),
                current=current,
                db=db,
            )
        )

    assert exc.value.status_code == 403
    assert db.requested_rollback is False


def test_rollback_release_run_blocks_when_policy_disabled(monkeypatch) -> None:
    db = ReleaseRunActionDb(rollback_policy="disabled")
    monkeypatch.setattr(
        release_router, "require_plan_application_rollback_access", lambda *_args: None
    )

    current = SimpleNamespace(
        workspace_id="workspace-a", user_id="operator", roles=("release_operator",)
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.rollback_release_run(
                "release-run-1",
                release_router.ReleaseRunActionRequest(reason="rollback requested during incident"),
                current=current,
                db=db,
            )
        )

    assert exc.value.status_code == 409
    assert "rollback is disabled" in exc.value.detail["blockers"][0]
    assert db.requested_rollback is False


def test_cancel_release_run_records_operator_reason(monkeypatch) -> None:
    db = ReleaseRunActionDb()
    seen_permissions: list[str] = []

    def allow_permission(
        _db: object,
        _current: object,
        _workspace_id: str,
        _steps: list[dict[str, object]],
        permission: str,
    ) -> None:
        seen_permissions.append(permission)

    monkeypatch.setattr(
        release_router, "require_plan_application_permission_access", allow_permission
    )

    current = SimpleNamespace(
        workspace_id="workspace-a", user_id="operator", roles=("release_operator",)
    )
    response = asyncio.run(
        release_router.cancel_release_run(
            "release-run-1",
            release_router.ReleaseRunActionRequest(reason="bad canary metrics"),
            current=current,
            db=db,
        )
    )

    assert response.run["run_id"] == "release-run-1"
    assert seen_permissions == [release_router.Permission.RUNNER_JOB_CANCEL.value]
    assert db.updated[0]["message"] == "Release run cancelled."
    assert db.updated[0]["details"] == {
        "reason": "bad canary metrics",
        "operator_action": "cancelled",
    }


@pytest.mark.parametrize(
    ("handler", "expected_status", "expected_message"),
    [
        (release_router.pause_release_run, "paused", "Release run paused."),
        (release_router.resume_release_run, "running", "Release run resumed."),
    ],
)
def test_pause_and_resume_release_run_use_the_shared_audited_transition(
    monkeypatch,
    handler,
    expected_status: str,
    expected_message: str,
) -> None:
    db = ReleaseRunActionDb()
    permissions: list[str] = []

    def allow_permission(
        _db: object,
        _current: object,
        _workspace_id: str,
        _steps: list[dict[str, object]],
        permission: str,
    ) -> None:
        permissions.append(permission)

    monkeypatch.setattr(
        release_router,
        "require_plan_application_permission_access",
        allow_permission,
    )
    current = SimpleNamespace(
        workspace_id="workspace-a",
        user_id="operator",
        roles=("release_operator",),
    )

    response = asyncio.run(
        handler(
            "release-run-1",
            release_router.ReleaseRunActionRequest(reason="operator handoff"),
            current=current,
            db=db,
        )
    )

    assert response.run["run_id"] == "release-run-1"
    assert permissions == [release_router.Permission.DEPLOY_RUN.value]
    assert db.updated[0]["args"] == ("workspace-a", "release-run-1", expected_status)
    assert db.updated[0]["message"] == expected_message
    assert db.updated[0]["details"] == {
        "reason": "operator handoff",
        "operator_action": expected_status,
    }


def test_notify_release_run_attention_emits_alert(monkeypatch) -> None:
    db = ReleaseRunActionDb()
    events = AcceptingEventGateway()
    monkeypatch.setattr(
        release_router, "require_plan_application_manage_access", lambda *_args: None
    )

    current = SimpleNamespace(
        workspace_id="workspace-a", user_id="operator", roles=("release_operator",)
    )
    response = asyncio.run(
        release_router.notify_release_run_attention(
            "release-run-1",
            release_router.ReleaseRunActionRequest(reason="page release owner"),
            current=current,
            db=db,
            events=events,
        )
    )

    alert = events.calls[0]["body"]
    assert response.accepted is True
    assert alert.severity == "warning"
    assert alert.workspace_id == "workspace-a"
    assert alert.cluster_id == "target"
    assert alert.namespace == "sandbox"
    assert alert.application_id == "checkout"
    assert alert.reason == "release run needs attention"
    assert "page release owner" in alert.message
    assert db.recorded_events[0]["event_type"].startswith("release.notify.")
    assert db.recorded_events[0]["details"]["operator_action"] == "notify"
    assert db.recorded_events[0]["details"]["alert"]["severity"] == "warning"
    assert db.recorded_events[0]["details"]["alert"]["cluster_id"] == "target"
    assert db.recorded_events[0]["details"]["alert"]["namespace"] == "sandbox"
    assert db.recorded_events[0]["details"]["alert"]["application_id"] == "checkout"
    assert db.recorded_events[0]["details"]["alert"]["workflow_run_id"] == "release-run-1"


def test_notify_release_run_attention_blocks_recent_duplicate(monkeypatch) -> None:
    db = ReleaseRunActionDb(recent_notify_minutes=3)
    events = AcceptingEventGateway()
    monkeypatch.setattr(
        release_router, "require_plan_application_manage_access", lambda *_args: None
    )

    current = SimpleNamespace(
        workspace_id="workspace-a", user_id="operator", roles=("release_operator",)
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.notify_release_run_attention(
                "release-run-1",
                release_router.ReleaseRunActionRequest(reason="page release owner again"),
                current=current,
                db=db,
                events=events,
            )
        )

    assert exc.value.status_code == 409
    assert "already sent recently" in exc.value.detail["blockers"][0]
    assert events.calls == []
    assert db.recorded_events == []


def test_notify_release_run_attention_marks_verification_timeout_critical(monkeypatch) -> None:
    db = ReleaseRunActionDb(
        verification_job_status="pending",
        verification_queued_at=(datetime.now(UTC) - timedelta(minutes=20)).isoformat(),
        verification_timeout_minutes=5,
    )
    events = AcceptingEventGateway()
    monkeypatch.setattr(
        release_router, "require_plan_application_manage_access", lambda *_args: None
    )

    current = SimpleNamespace(
        workspace_id="workspace-a", user_id="operator", roles=("release_operator",)
    )
    asyncio.run(
        release_router.notify_release_run_attention(
            "release-run-1",
            release_router.ReleaseRunActionRequest(reason="verification worker may be stuck"),
            current=current,
            db=db,
            events=events,
        )
    )

    alert = events.calls[0]["body"]
    assert alert.severity == "critical"
    assert "release-verification-fixture timed out after" in alert.message
    assert "limit 5m" in alert.message
    assert "verification worker may be stuck" in alert.message


def test_get_release_run_handoff_summarizes_operator_next_actions(monkeypatch) -> None:
    db = ReleaseRunActionDb()
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(
        workspace_id="workspace-a", user_id="operator", roles=("release_operator",)
    )
    response = asyncio.run(
        release_router.get_release_run_handoff(
            "release-run-1",
            current=current,
            db=db,
        )
    )

    handoff = response.handoff
    assert handoff["run_id"] == "release-run-1"
    assert handoff["severity"] == "warning"
    assert "needs operator attention" in handoff["headline"]
    assert handoff["attention_reasons"] == ["Release run is paused by an operator."]
    assert [action["action"] for action in handoff["next_actions"]] == [
        "monitor",
        "notify",
        "rollback",
        "cancel",
    ]
    assert {check["name"] for check in handoff["checks"]} == {
        "mode",
        "health",
        "attention",
        "rollback",
        "verification",
        "abort_criteria",
        "change_freeze",
        "policy_overrides",
    }
    assert handoff["verification"] == {
        "status": "passed",
        "message": "Post-deploy verification evidence is present (/readyz).",
        "evidence": ["/readyz"],
        "jobs": [
            {
                "job_id": "release-verification-fixture",
                "application_id": "checkout",
                "name": "Checkout",
                "kind": "kubernetes_health_check",
                "status": "passed",
                "evidence_key": "release-run-1:wave-1:checkout:post-deploy-verification",
                "target": {
                    "cluster_id": "target",
                    "namespace": "sandbox",
                    "service_name": "checkout",
                    "path": "/readyz",
                },
            }
        ],
        "job_count": 1,
        "timed_out_jobs": [],
        "override_reason": None,
        "production_targets": ["checkout"],
    }
    assert handoff["abort_criteria"] == {
        "status": "passed",
        "message": (
            "Rollback criteria are present "
            "(rollback if checkout error rate exceeds 5% for 5 minutes)."
        ),
        "criteria": ["rollback if checkout error rate exceeds 5% for 5 minutes"],
        "override_reason": None,
        "production_targets": ["checkout"],
    }
    assert handoff["change_freeze"] == {
        "status": "warning",
        "message": "Active change freeze was bypassed with an operator reason.",
        "active": True,
        "start": "2026-07-09T09:00:00Z",
        "end": "2026-07-09T11:00:00Z",
        "override_reason": "incident commander approved emergency hotfix",
        "production_targets": ["checkout"],
    }
    assert handoff["policy_overrides"] == [
        {
            "source": "Change freeze",
            "reason": "incident commander approved emergency hotfix",
            "production_targets": ["checkout"],
        }
    ]


def test_release_run_handoff_disables_notify_during_cooldown(monkeypatch) -> None:
    db = ReleaseRunActionDb(recent_notify_minutes=3)
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(
        workspace_id="workspace-a", user_id="operator", roles=("release_operator",)
    )
    response = asyncio.run(
        release_router.get_release_run_handoff(
            "release-run-1",
            current=current,
            db=db,
        )
    )

    notify = next(
        action for action in response.handoff["next_actions"] if action["action"] == "notify"
    )
    assert notify["enabled"] is False
    assert "already sent recently" in notify["reason"]
    attention_check = next(
        check for check in response.handoff["checks"] if check["name"] == "attention"
    )
    assert attention_check["status"] == "blocked"
    assert "already sent recently" in attention_check["message"]


def test_release_run_handoff_explains_disabled_rollback_action(monkeypatch) -> None:
    db = ReleaseRunActionDb(rollback_policy="disabled")
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(
        workspace_id="workspace-a", user_id="operator", roles=("release_operator",)
    )
    response = asyncio.run(
        release_router.get_release_run_handoff(
            "release-run-1",
            current=current,
            db=db,
        )
    )

    rollback = next(
        action for action in response.handoff["next_actions"] if action["action"] == "rollback"
    )
    assert rollback["enabled"] is False
    assert rollback["reason"] == "Rollback policy is disabled for this release run."


def test_get_release_run_report_includes_redacted_audit_and_markdown(monkeypatch) -> None:
    db = ReleaseRunReportDb()
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)
    monkeypatch.setattr(
        release_router, "require_plan_application_audit_access", lambda *_args: None
    )

    current = SimpleNamespace(
        workspace_id="workspace-a", user_id="operator", roles=("release_operator",)
    )
    response = asyncio.run(
        release_router.get_release_run_report(
            "release-run-1",
            current=current,
            db=db,
        )
    )

    report = response.report
    assert db.filters == {
        "plan_id": None,
        "run_id": "release-run-1",
        "event_type": None,
        "limit": 50,
    }
    assert report["run_id"] == "release-run-1"
    assert "Release run report: Checkout release" in report["markdown"]
    assert "Targets:" in report["markdown"]
    assert (
        "checkout / cluster target / namespace sandbox / workflow workflow-checkout-1"
        in report["markdown"]
    )
    assert "repo org/checkout / commit abc123 / manifest deploy/app.yaml" in report["markdown"]
    assert "Approvals:" in report["markdown"]
    assert "Checkout: approval-checkout-1 / granted / gate manual" in report["markdown"]
    assert "Checks:" in report["markdown"]
    assert "verification: passed" in report["markdown"]
    assert "Verification:" in report["markdown"]
    assert "evidence: /readyz" in report["markdown"]
    assert "job: release-verification-fixture passed" in report["markdown"]
    assert "Rollback criteria:" in report["markdown"]
    assert "rollback if checkout error rate exceeds 5% for 5 minutes" in report["markdown"]
    assert "Change freeze:" in report["markdown"]
    assert "Active change freeze was bypassed with an operator reason." in report["markdown"]
    assert "2026-07-09T09:00:00Z to 2026-07-09T11:00:00Z" in report["markdown"]
    assert "Policy overrides:" in report["markdown"]
    assert (
        "Change freeze: incident commander approved emergency hotfix / targets: checkout"
        in report["markdown"]
    )
    assert "incident commander approved emergency hotfix" in report["markdown"]
    assert "Audit summary:" in report["markdown"]
    assert "Events in report: 1" in report["markdown"]
    assert "workflow.run.failed: 1" in report["markdown"]
    assert "Recent audit:" in report["markdown"]
    assert "workflow.run.failed" in report["markdown"]
    assert report["audit_events"][0]["details"]["token"] == "<redacted>"
    assert report["audit_events"][0]["details"]["nested"]["client_secret"] == "<redacted>"
    assert "raw-token" not in report["markdown"]
    assert "super-secret" not in report["markdown"]


def test_export_release_run_report_returns_markdown_attachment(monkeypatch) -> None:
    db = ReleaseRunReportDb()
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)
    monkeypatch.setattr(
        release_router, "require_plan_application_audit_access", lambda *_args: None
    )

    current = SimpleNamespace(
        workspace_id="workspace-a", user_id="operator", roles=("release_operator",)
    )
    response = asyncio.run(
        release_router.export_release_run_report(
            "release-run-1",
            current=current,
            db=db,
        )
    )

    body = response.body.decode("utf-8")
    assert response.media_type == "text/markdown; charset=utf-8"
    assert (
        response.headers["content-disposition"]
        == 'attachment; filename="release-run-release-run-1.md"'
    )
    assert "## Release run report: Checkout release" in body
    assert "Targets:" in body
    assert "checkout / cluster target / namespace sandbox" in body
    assert "Approvals:" in body
    assert "approval-checkout-1 / granted" in body
    assert "Checks:" in body
    assert "verification: passed" in body
    assert "Verification:" in body
    assert "evidence: /readyz" in body
    assert "Rollback criteria:" in body
    assert "Change freeze:" in body
    assert "Active change freeze was bypassed with an operator reason." in body
    assert "Audit summary:" in body
    assert "workflow.run.failed: 1" in body
    assert "Recent audit:" in body
    assert "raw-token" not in body
    assert "super-secret" not in body


def test_retry_release_run_dispatches_failed_wave_step(monkeypatch) -> None:
    db = ReleaseRetryDb()
    monkeypatch.setattr(
        release_router, "require_plan_application_manage_access", lambda *_args: None
    )
    monkeypatch.setattr(release_router, "require_cluster_access", lambda *_args: None)

    current = SimpleNamespace(
        workspace_id="workspace-a", user_id="operator", roles=("release_operator",)
    )
    response = asyncio.run(
        release_router.retry_release_run(
            "release-run-retry",
            release_router.ReleaseRunActionRequest(reason="retry failed pod"),
            current=current,
            db=db,
            events=FailingEventGateway(),
        )
    )

    assert response.run["status"] == "running"
    assert db.retry_marks[0]["wave"] == 1
    assert db.retry_marks[0]["attempt"] == 1
    assert db.dispatched == ["checkout"]


def test_retry_release_run_blocks_when_retry_budget_is_exhausted(monkeypatch) -> None:
    db = ReleaseRetryDb(previous_retry=True)
    monkeypatch.setattr(
        release_router, "require_plan_application_manage_access", lambda *_args: None
    )

    current = SimpleNamespace(
        workspace_id="workspace-a", user_id="operator", roles=("release_operator",)
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.retry_release_run(
                "release-run-retry",
                release_router.ReleaseRunActionRequest(reason="retry failed pod"),
                current=current,
                db=db,
                events=FailingEventGateway(),
            )
        )

    assert exc.value.status_code == 409
    assert "retry budget exhausted" in exc.value.detail["blockers"][0]
    assert db.retry_marks == []
    assert db.dispatched == []


def test_start_release_plan_blocks_when_plan_has_active_run(monkeypatch) -> None:
    db = ReleaseDispatchDb()
    db.active_plan_ids.add("plan-a")
    monkeypatch.setattr(
        release_router, "require_plan_application_manage_access", lambda *_args: None
    )

    current = SimpleNamespace(
        workspace_id="workspace-a", user_id="operator", roles=("release_operator",)
    )
    payload = release_plan_request(plan_id="plan-a")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.start_release_plan(
                payload,
                current=current,
                db=db,
                events=FailingEventGateway(),
            )
        )

    assert exc.value.status_code == 409
    assert any("already has an active run" in item for item in exc.value.detail["blockers"])
    assert db.dispatched == []


def test_dispatch_release_plan_blocks_when_plan_has_active_run(monkeypatch) -> None:
    db = ReleaseDispatchDb()
    db.active_plan_ids.add("plan-a")
    monkeypatch.setattr(
        release_router, "require_plan_application_manage_access", lambda *_args: None
    )

    current = SimpleNamespace(
        workspace_id="workspace-a", user_id="operator", roles=("release_operator",)
    )
    payload = release_plan_request(plan_id="plan-a")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.dispatch_release_plan(
                payload,
                wave=1,
                current=current,
                db=db,
                events=FailingEventGateway(),
            )
        )

    assert exc.value.status_code == 409
    assert any("already has an active run" in item for item in exc.value.detail["blockers"])
    assert db.dispatched == []


def test_release_audit_list_checks_read_access_and_hides_internal_steps(monkeypatch) -> None:
    db = ReleaseAuditDb()
    seen: list[tuple[str, str]] = []

    def require_read(
        _db: object,
        _current: object,
        workspace_id: str,
        steps: list[dict[str, object]],
    ) -> None:
        seen.append((workspace_id, str(steps[0]["application_id"])))

    monkeypatch.setattr(release_router, "require_plan_application_audit_access", require_read)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.list_release_audit(
            plan_id="plan-a",
            run_id=None,
            event_type=None,
            limit=10,
            current=current,
            db=db,
        )
    )

    assert seen == [("workspace-a", "checkout")]
    assert response.events[0]["audit_id"] == "audit-1"
    assert response.events[0]["application_ids"] == ["checkout"]
    assert response.events[0]["details"]["token"] == "<redacted>"
    assert response.events[0]["details"]["nested"]["client_secret"] == "<redacted>"
    assert response.events[0]["details"]["nested"]["safe"] == "visible"
    assert "_steps" not in response.events[0]
    assert db.filters == {"plan_id": "plan-a", "run_id": None, "event_type": None, "limit": 10}


def test_release_audit_export_returns_csv_without_internal_steps(monkeypatch) -> None:
    db = ReleaseAuditDb()
    monkeypatch.setattr(
        release_router, "require_plan_application_audit_access", lambda *_args: None
    )

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.export_release_audit(
            plan_id=None,
            run_id="run-a",
            event_type="workflow.run.failed",
            limit=20,
            current=current,
            db=db,
        )
    )

    body = response.body.decode()
    assert response.media_type == "text/csv; charset=utf-8"
    assert "audit-1" in body
    assert "workflow.run.failed" in body
    assert "checkout" in body
    assert "raw-token" not in body
    assert "super-secret" not in body
    assert "<redacted>" in body
    assert "_steps" not in body
    assert db.filters == {
        "plan_id": None,
        "run_id": "run-a",
        "event_type": "workflow.run.failed",
        "limit": 20,
    }


def test_release_audit_event_type_filter_supports_prefix() -> None:
    assert release_audit_event_type_filter("workflow.run.failed") == ("workflow.run.failed", None)
    assert release_audit_event_type_filter("release.*") == (None, "release.")
    assert release_audit_event_type_filter("release.notify.*") == (None, "release.notify.")
    assert release_audit_event_type_filter("  release.retry.*  ") == (None, "release.retry.")
    assert release_audit_event_type_filter("") == (None, None)


def test_release_audit_accepts_notify_prefix_filter(monkeypatch) -> None:
    db = ReleaseAuditDb()
    monkeypatch.setattr(
        release_router, "require_plan_application_audit_access", lambda *_args: None
    )

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    asyncio.run(
        release_router.list_release_audit(
            plan_id="plan-a",
            run_id=None,
            event_type="release.notify.*",
            limit=25,
            current=current,
            db=db,
        )
    )

    assert db.filters == {
        "plan_id": "plan-a",
        "run_id": None,
        "event_type": "release.notify.*",
        "limit": 25,
    }


def test_release_readiness_reports_blockers_and_operational_warnings(monkeypatch) -> None:
    monkeypatch.delenv("RELEASE_FLOW_LIVE_ENABLED", raising=False)
    db = ReleaseReadinessDb(channels=[])
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "manual_each_step",
                    "retry_attempts": 0,
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {"environment": "production", "commit_sha": "abc1234"},
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert response.mode == "live"
    assert any("Live release dispatch is disabled" in item for item in response.blockers)
    assert any("Checkout is missing image" in item for item in response.blockers)
    assert any("requires at least one enabled alert channel" in item for item in response.blockers)
    assert any("cannot be retried" in item for item in response.warnings)
    action_ids = {action["check_id"] for action in response.next_actions}
    assert {
        "plan.required_inputs",
        "live.dispatch_gate",
        "alerts.enabled_channels",
        "retry.policy",
    } <= action_ids
    assert all(action["severity"] in {"blocked", "warning"} for action in response.next_actions)


def test_release_readiness_passes_demo_with_alert_channel(monkeypatch) -> None:
    db = ReleaseReadinessDb(channels=[{"channel_id": "chan-a", "enabled": True}])
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout release",
                settings={"runtime_mode": "demo", "approval_policy": "auto_safe"},
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "sandbox",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is True
    assert response.blockers == []
    assert response.warnings == []
    assert response.impact["live_side_effects"] is False
    assert response.impact["total_steps"] == 1
    assert response.impact["applications"] == ["checkout"]
    assert response.impact["environments"] == ["sandbox"]
    assert response.impact["production_target_count"] == 0
    assert response.impact["first_wave_steps"][0]["name"] == "Checkout"
    assert {check["check_id"] for check in response.checks} >= {
        "plan.preview",
        "alerts.enabled_channels",
        "audit.redaction",
    }


def test_release_readiness_blocks_live_when_channels_do_not_cover_warning(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[{"channel_id": "chan-critical", "enabled": True, "min_severity": "critical"}]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout release",
                settings={"runtime_mode": "live", "approval_policy": "auto_safe"},
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "sandbox",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any("warning-or-higher release events" in item for item in response.blockers)
    alert_check = next(
        check for check in response.checks if check["check_id"] == "alerts.enabled_channels"
    )
    assert alert_check["status"] == "blocked"
    assert "none receive warning release events" in alert_check["message"]


def test_release_readiness_blocks_live_when_warning_channel_is_not_validated(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "failed",
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout release",
                settings={"runtime_mode": "live", "approval_policy": "auto_safe"},
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "sandbox",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any("passing validation test" in item for item in response.blockers)
    alert_check = next(
        check for check in response.checks if check["check_id"] == "alerts.enabled_channels"
    )
    assert alert_check["status"] == "blocked"
    assert "none has a passing validation test" in alert_check["message"]


def test_release_readiness_blocks_live_when_diagnostics_do_not_pass(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "require_diagnostics_pass": True,
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "production",
                            "approval_gate": "auto",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any("risk.release_step_auto_gate_production" in item for item in response.blockers)
    diagnostics_check = next(
        check for check in response.checks if check["check_id"] == "plan.diagnostics"
    )
    assert diagnostics_check["status"] == "blocked"


def test_release_readiness_blocks_live_diagnostics_bypass_without_reason(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "require_diagnostics_pass": False,
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "sandbox",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any("diagnostics override reason" in item for item in response.blockers)
    diagnostics_check = next(
        check for check in response.checks if check["check_id"] == "plan.diagnostics"
    )
    assert diagnostics_check["status"] == "blocked"


def test_release_readiness_warns_when_live_diagnostics_bypass_has_reason(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "require_diagnostics_pass": False,
                    "diagnostics_override_reason": "incident hotfix approved in war room",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "sandbox",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is True
    diagnostics_check = next(
        check for check in response.checks if check["check_id"] == "plan.diagnostics"
    )
    assert diagnostics_check["status"] == "warning"
    assert "bypassed" in diagnostics_check["message"]


def test_release_readiness_blocks_live_when_rollback_disabled_without_reason(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "rollback_policy": "disabled",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "sandbox",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any("rollback override reason" in item for item in response.blockers)
    rollback_check = next(
        check for check in response.checks if check["check_id"] == "rollback.policy"
    )
    assert rollback_check["status"] == "blocked"


def test_release_readiness_warns_when_rollback_disabled_has_reason(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "rollback_policy": "disabled",
                    "rollback_override_reason": "rollback handled by external incident commander",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "sandbox",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is True
    rollback_check = next(
        check for check in response.checks if check["check_id"] == "rollback.policy"
    )
    assert rollback_check["status"] == "warning"


def test_release_readiness_blocks_production_live_without_change_ticket(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout production release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "approval_granted": True,
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "production",
                            "approval_gate": "manual",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                            "health_check_path": "/readyz",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any("change ticket" in item for item in response.blockers)
    change_check = next(check for check in response.checks if check["check_id"] == "change.ticket")
    assert change_check["status"] == "blocked"


def test_release_readiness_blocks_production_placeholder_change_ticket(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout production release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "approval_granted": True,
                    "approval_granted_by": "lead@example.com",
                    "approval_reason": "approved production release",
                    "approval_granted_at": datetime.now(UTC).isoformat(),
                    "change_ticket": "CHG-PREFLIGHT",
                    "release_window_override_reason": "incident commander approved immediate release",
                    "runbook_url": "https://wiki.company.internal/runbooks/checkout-release",
                    "post_deploy_verification_url": "https://checkout.company.internal/readyz",
                    "release_owner": "checkout-release-team",
                    "abort_criteria": "rollback if checkout error rate exceeds 5% for 5 minutes",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "production",
                            "approval_gate": "manual",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                            "health_check_path": "/readyz",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any(
        "must not use placeholder change ticket CHG-PREFLIGHT" in item for item in response.blockers
    )
    change_check = next(check for check in response.checks if check["check_id"] == "change.ticket")
    assert change_check["status"] == "blocked"


def test_release_readiness_warns_when_production_change_ticket_gate_is_bypassed(
    monkeypatch,
) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout production release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "approval_granted": True,
                    "approval_granted_by": "lead@example.com",
                    "approval_reason": "approved production release",
                    "approval_granted_at": datetime.now(UTC).isoformat(),
                    "production_change_override_reason": "emergency production fix approved",
                    "release_window_override_reason": "incident commander approved immediate release",
                    "runbook_url": "https://wiki.company.internal/runbooks/checkout-release",
                    "post_deploy_verification_url": "https://checkout.company.internal/readyz",
                    "release_owner": "checkout-release-team",
                    "abort_criteria": "rollback if checkout error rate exceeds 5% for 5 minutes",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "production",
                            "approval_gate": "manual",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                            "health_check_path": "/readyz",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is True
    change_check = next(check for check in response.checks if check["check_id"] == "change.ticket")
    assert change_check["status"] == "warning"
    change_action = next(
        action for action in response.next_actions if action["check_id"] == "change.ticket"
    )
    assert change_action["severity"] == "warning"
    assert change_action["label"] == "Review Change ticket"


def test_release_readiness_blocks_production_live_without_release_window(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout production release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "approval_granted": True,
                    "change_ticket": "CHG-123",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "production",
                            "approval_gate": "manual",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                            "health_check_path": "/readyz",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any("release_window_start" in item for item in response.blockers)
    window_check = next(check for check in response.checks if check["check_id"] == "release.window")
    assert window_check["status"] == "blocked"


def test_release_readiness_blocks_production_live_without_approval_evidence(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout production release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "approval_granted": True,
                    "change_ticket": "CHG-123",
                    "release_window_override_reason": "incident commander approved immediate release",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "production",
                            "approval_gate": "manual",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                            "health_check_path": "/readyz",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any(
        "approval_granted_by" in item and "approval_reason" in item for item in response.blockers
    )
    approval_check = next(
        check for check in response.checks if check["check_id"] == "approval.evidence"
    )
    assert approval_check["status"] == "blocked"


def test_release_readiness_blocks_stale_production_approval(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    monkeypatch.setenv("RELEASE_FLOW_APPROVAL_MAX_AGE_HOURS", "1")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout production release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "approval_granted": True,
                    "approval_granted_by": "lead@example.com",
                    "approval_reason": "approved production release",
                    "approval_granted_at": (datetime.now(UTC) - timedelta(hours=2)).isoformat(),
                    "change_ticket": "CHG-123",
                    "release_window_override_reason": "incident commander approved immediate release",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "production",
                            "approval_gate": "manual",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=()),
            db=db,
        )
    )

    assert response.ready is False
    assert any("approval evidence is older than 1 hour(s)" in item for item in response.blockers)
    approval_check = next(
        check for check in response.checks if check["check_id"] == "approval.evidence"
    )
    assert approval_check["status"] == "blocked"


def test_release_readiness_warns_when_production_release_window_is_bypassed(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout production release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "approval_granted": True,
                    "approval_granted_by": "lead@example.com",
                    "approval_reason": "approved production release",
                    "approval_granted_at": datetime.now(UTC).isoformat(),
                    "change_ticket": "CHG-123",
                    "release_window_override_reason": "incident commander approved immediate release",
                    "runbook_url": "https://wiki.company.internal/runbooks/checkout-release",
                    "post_deploy_verification_url": "https://checkout.company.internal/readyz",
                    "release_owner": "checkout-release-team",
                    "abort_criteria": "rollback if checkout error rate exceeds 5% for 5 minutes",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "production",
                            "approval_gate": "manual",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                            "health_check_path": "/readyz",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is True
    window_check = next(check for check in response.checks if check["check_id"] == "release.window")
    assert window_check["status"] == "warning"


def test_release_readiness_blocks_production_live_during_change_freeze(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    now = datetime.now(UTC)
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": now.isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout production release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "approval_granted": True,
                    "approval_granted_by": "lead@example.com",
                    "approval_reason": "approved production release",
                    "approval_granted_at": now.isoformat(),
                    "change_ticket": "CHG-123",
                    "release_window_start": (now - timedelta(hours=1)).isoformat(),
                    "release_window_end": (now + timedelta(hours=1)).isoformat(),
                    "change_freeze_start": (now - timedelta(minutes=5)).isoformat(),
                    "change_freeze_end": (now + timedelta(minutes=5)).isoformat(),
                    "runbook_url": "https://wiki.company.internal/runbooks/checkout-release",
                    "release_owner": "checkout-release-team",
                    "abort_criteria": "rollback if checkout error rate exceeds 5% for 5 minutes",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "production",
                            "approval_gate": "manual",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                            "health_check_path": "/readyz",
                        },
                    }
                ],
            ),
            current=SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=()),
            db=db,
        )
    )

    assert response.ready is False
    assert any("change freeze window" in item for item in response.blockers)
    freeze_check = next(check for check in response.checks if check["check_id"] == "change.freeze")
    assert freeze_check["status"] == "blocked"


def test_release_readiness_warns_when_change_freeze_is_bypassed(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    now = datetime.now(UTC)
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": now.isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout production release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "approval_granted": True,
                    "approval_granted_by": "lead@example.com",
                    "approval_reason": "approved production release",
                    "approval_granted_at": now.isoformat(),
                    "change_ticket": "CHG-123",
                    "release_window_start": (now - timedelta(hours=1)).isoformat(),
                    "release_window_end": (now + timedelta(hours=1)).isoformat(),
                    "change_freeze_start": (now - timedelta(minutes=5)).isoformat(),
                    "change_freeze_end": (now + timedelta(minutes=5)).isoformat(),
                    "change_freeze_override_reason": "incident commander approved emergency hotfix",
                    "runbook_url": "https://wiki.company.internal/runbooks/checkout-release",
                    "post_deploy_verification_url": "https://checkout.company.internal/readyz",
                    "release_owner": "checkout-release-team",
                    "abort_criteria": "rollback if checkout error rate exceeds 5% for 5 minutes",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "production",
                            "approval_gate": "manual",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                            "health_check_path": "/readyz",
                        },
                    }
                ],
            ),
            current=SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=()),
            db=db,
        )
    )

    assert response.ready is True
    freeze_check = next(check for check in response.checks if check["check_id"] == "change.freeze")
    assert freeze_check["status"] == "warning"
    freeze_action = next(
        action for action in response.next_actions if action["check_id"] == "change.freeze"
    )
    assert freeze_action["severity"] == "warning"
    assert freeze_action["label"] == "Review Change freeze"


def test_release_readiness_blocks_production_live_without_runbook(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout production release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "approval_granted": True,
                    "approval_granted_by": "lead@example.com",
                    "approval_reason": "approved production release",
                    "approval_granted_at": datetime.now(UTC).isoformat(),
                    "change_ticket": "CHG-123",
                    "release_window_override_reason": "incident commander approved immediate release",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "production",
                            "approval_gate": "manual",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=()),
            db=db,
        )
    )

    assert response.ready is False
    assert any("runbook_url" in item for item in response.blockers)
    runbook_check = next(check for check in response.checks if check["check_id"] == "runbook.sop")
    assert runbook_check["status"] == "blocked"


def test_release_readiness_blocks_production_placeholder_runbook_url(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout production release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "approval_granted": True,
                    "approval_granted_by": "lead@example.com",
                    "approval_reason": "approved production release",
                    "approval_granted_at": datetime.now(UTC).isoformat(),
                    "change_ticket": "CHG-123",
                    "release_window_override_reason": "incident commander approved immediate release",
                    "runbook_url": "https://wiki.example.com/runbooks/checkout-release",
                    "release_owner": "checkout-release-team",
                    "abort_criteria": "rollback if checkout error rate exceeds 5% for 5 minutes",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "production",
                            "approval_gate": "manual",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                            "health_check_path": "/readyz",
                        },
                    }
                ],
            ),
            current=SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=()),
            db=db,
        )
    )

    assert response.ready is False
    assert any("live https runbook_url" in item for item in response.blockers)
    runbook_check = next(check for check in response.checks if check["check_id"] == "runbook.sop")
    assert runbook_check["status"] == "blocked"


def test_release_readiness_blocks_production_live_without_owner_contact(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout production release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "approval_granted": True,
                    "approval_granted_by": "lead@example.com",
                    "approval_reason": "approved production release",
                    "approval_granted_at": datetime.now(UTC).isoformat(),
                    "change_ticket": "CHG-123",
                    "release_window_override_reason": "incident commander approved immediate release",
                    "runbook_url": "https://wiki.company.internal/runbooks/checkout-release",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "production",
                            "approval_gate": "manual",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=()),
            db=db,
        )
    )

    assert response.ready is False
    assert any("release_owner or oncall_contact" in item for item in response.blockers)
    assert response.impact["live_side_effects"] is True
    assert response.impact["production_target_count"] == 1
    assert response.impact["production_targets"] == ["Checkout"]
    owner_check = next(check for check in response.checks if check["check_id"] == "owner.contact")
    assert owner_check["status"] == "blocked"
    owner_action = next(
        action for action in response.next_actions if action["check_id"] == "owner.contact"
    )
    assert owner_action["severity"] == "blocked"
    assert owner_action["label"] == "Resolve Owner contact"


def test_release_readiness_blocks_production_live_without_verification_evidence(
    monkeypatch,
) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout production release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "approval_granted": True,
                    "approval_granted_by": "lead@example.com",
                    "approval_reason": "approved production release",
                    "approval_granted_at": datetime.now(UTC).isoformat(),
                    "change_ticket": "CHG-123",
                    "release_window_override_reason": "incident commander approved immediate release",
                    "runbook_url": "https://wiki.company.internal/runbooks/checkout-release",
                    "release_owner": "checkout-release-team",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "production",
                            "approval_gate": "manual",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=()),
            db=db,
        )
    )

    assert response.ready is False
    assert any("post_deploy_verification_url" in item for item in response.blockers)
    verification_check = next(
        check for check in response.checks if check["check_id"] == "verification.plan"
    )
    assert verification_check["status"] == "blocked"


def test_release_readiness_blocks_production_http_verification_url(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout production release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "approval_granted": True,
                    "approval_granted_by": "lead@example.com",
                    "approval_reason": "approved production release",
                    "approval_granted_at": datetime.now(UTC).isoformat(),
                    "change_ticket": "CHG-123",
                    "release_window_override_reason": "incident commander approved immediate release",
                    "runbook_url": "https://wiki.company.internal/runbooks/checkout-release",
                    "release_owner": "checkout-release-team",
                    "post_deploy_verification_url": "http://checkout.company.internal/readyz",
                    "abort_criteria": "rollback if checkout error rate exceeds 5% for 5 minutes",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "production",
                            "approval_gate": "manual",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=()),
            db=db,
        )
    )

    assert response.ready is False
    assert any("live https post_deploy_verification_url" in item for item in response.blockers)
    verification_check = next(
        check for check in response.checks if check["check_id"] == "verification.plan"
    )
    assert verification_check["status"] == "blocked"


def test_release_readiness_blocks_when_production_verification_is_bypassed(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout production release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "approval_granted": True,
                    "approval_granted_by": "lead@example.com",
                    "approval_reason": "approved production release",
                    "approval_granted_at": datetime.now(UTC).isoformat(),
                    "change_ticket": "CHG-123",
                    "release_window_override_reason": "incident commander approved immediate release",
                    "runbook_url": "https://wiki.company.internal/runbooks/checkout-release",
                    "release_owner": "checkout-release-team",
                    "verification_override_reason": "synthetic monitor is temporarily owned by incident command",
                    "abort_criteria": "rollback if checkout error rate exceeds 5% for 5 minutes",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "production",
                            "approval_gate": "manual",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=()),
            db=db,
        )
    )

    assert response.ready is False
    assert any("post_deploy_verification_url" in item for item in response.blockers)
    verification_check = next(
        check for check in response.checks if check["check_id"] == "verification.plan"
    )
    assert verification_check["status"] == "blocked"


def test_release_readiness_blocks_production_live_without_abort_criteria(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout production release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "approval_granted": True,
                    "approval_granted_by": "lead@example.com",
                    "approval_reason": "approved production release",
                    "approval_granted_at": datetime.now(UTC).isoformat(),
                    "change_ticket": "CHG-123",
                    "release_window_override_reason": "incident commander approved immediate release",
                    "runbook_url": "https://wiki.company.internal/runbooks/checkout-release",
                    "release_owner": "checkout-release-team",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "production",
                            "approval_gate": "manual",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                            "health_check_path": "/readyz",
                        },
                    }
                ],
            ),
            current=SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=()),
            db=db,
        )
    )

    assert response.ready is False
    assert any("rollback_trigger" in item for item in response.blockers)
    criteria_check = next(
        check for check in response.checks if check["check_id"] == "rollback.abort_criteria"
    )
    assert criteria_check["status"] == "blocked"


def test_release_readiness_warns_when_abort_criteria_is_bypassed(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout production release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "approval_granted": True,
                    "approval_granted_by": "lead@example.com",
                    "approval_reason": "approved production release",
                    "approval_granted_at": datetime.now(UTC).isoformat(),
                    "change_ticket": "CHG-123",
                    "release_window_override_reason": "incident commander approved immediate release",
                    "runbook_url": "https://wiki.company.internal/runbooks/checkout-release",
                    "post_deploy_verification_url": "https://checkout.company.internal/readyz",
                    "release_owner": "checkout-release-team",
                    "abort_criteria_override_reason": "incident commander will decide rollback criteria manually",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "production",
                            "approval_gate": "manual",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                            "health_check_path": "/readyz",
                        },
                    }
                ],
            ),
            current=SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=()),
            db=db,
        )
    )

    assert response.ready is True
    criteria_check = next(
        check for check in response.checks if check["check_id"] == "rollback.abort_criteria"
    )
    assert criteria_check["status"] == "warning"
    criteria_action = next(
        action
        for action in response.next_actions
        if action["check_id"] == "rollback.abort_criteria"
    )
    assert criteria_action["severity"] == "warning"


def test_release_readiness_blocks_unregistered_application(monkeypatch) -> None:
    db = ReleaseReadinessApplicationDb(
        channels=[{"channel_id": "chan-a", "enabled": True}],
        applications={},
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout release",
                settings={"runtime_mode": "demo", "approval_policy": "auto_safe"},
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any("Application checkout is not registered" in item for item in response.blockers)
    assert any(check["check_id"] == "plan.application_context" for check in response.checks)


def test_release_readiness_uses_registered_application_context(monkeypatch) -> None:
    db = ReleaseReadinessApplicationDb(
        channels=[{"channel_id": "chan-a", "enabled": True}],
        applications={
            "checkout": {
                "repo_ref": "org/checkout",
                "branch": "main",
                "manifest_path": "deploy/app.yaml",
                "cluster_id": "target",
            }
        },
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout release",
                settings={"runtime_mode": "demo", "approval_policy": "auto_safe"},
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is True
    assert response.blockers == []


def test_release_readiness_accepts_created_safe_pr_evidence(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    application = {
        "repo_ref": "org/checkout",
        "branch": "main",
        "manifest_path": "deploy/app.yaml",
        "cluster_id": "target",
    }
    plan = {
        "name": "Checkout release",
        "settings": {"runtime_mode": "live", "approval_policy": "auto_safe"},
        "steps": [
            {
                "application_id": "checkout",
                "name": "Checkout",
                "position": 0,
                "config": {
                    "environment": "sandbox",
                    "approval_gate": "safe_pr",
                    "safe_pr_workflow_run_id": "workflow-safe-pr-1",
                    "commit_sha": "abc1234",
                    "image": "ghcr.io/example/checkout:v2",
                },
            }
        ],
    }
    step = plan["steps"][0]
    assert isinstance(step, dict)
    expected_manifest_path = release_router.generated_safe_pr_manifest_path(plan, step, application)
    expected_patch_sha = release_router.generated_safe_pr_patch_sha256(
        plan, step, application, workspace_id="workspace-a"
    )
    db = ReleaseReadinessSafePrDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ],
        applications={"checkout": application},
        safe_pr={
            "workflow_run_id": "workflow-safe-pr-1",
            "pr_url": "https://github.example/org/checkout/pull/7",
            "provider": "github",
            "repo_ref": "org/checkout",
            "base_branch": "main",
            "environment": "sandbox",
            "manifest_path": expected_manifest_path,
            "commit_sha": "abc1234",
            "patch_sha256": expected_patch_sha,
            "created_at": datetime.now(UTC).isoformat(),
        },
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(**plan),
            current=current,
            db=db,
        )
    )

    assert response.ready is True
    assert response.blockers == []
    assert db.safe_pr_lookups == [("workspace-a", "workflow-safe-pr-1", "checkout")]


def test_release_readiness_selects_matching_safe_pr_candidate(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    application = {
        "repo_ref": "org/checkout",
        "branch": "main",
        "manifest_path": "deploy/app.yaml",
        "cluster_id": "target",
    }
    plan = {
        "name": "Checkout release",
        "settings": {"runtime_mode": "live", "approval_policy": "auto_safe"},
        "steps": [
            {
                "application_id": "checkout",
                "name": "Checkout",
                "position": 0,
                "config": {
                    "environment": "sandbox",
                    "approval_gate": "safe_pr",
                    "safe_pr_workflow_run_id": "workflow-safe-pr-1",
                    "commit_sha": "abc1234",
                    "image": "ghcr.io/example/checkout:v2",
                },
            }
        ],
    }
    step = plan["steps"][0]
    assert isinstance(step, dict)
    expected_manifest_path = release_router.generated_safe_pr_manifest_path(plan, step, application)
    expected_patch_sha = release_router.generated_safe_pr_patch_sha256(
        plan, step, application, workspace_id="workspace-a"
    )
    matching_evidence = {
        "workflow_run_id": "workflow-safe-pr-1",
        "pr_url": "https://github.example/org/checkout/pull/8",
        "provider": "github",
        "repo_ref": "org/checkout",
        "base_branch": "main",
        "environment": "sandbox",
        "manifest_path": expected_manifest_path,
        "commit_sha": "abc1234",
        "patch_sha256": expected_patch_sha,
        "created_at": datetime.now(UTC).isoformat(),
    }
    db = ReleaseReadinessSafePrDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ],
        applications={"checkout": application},
        safe_pr=[
            {
                **matching_evidence,
                "pr_url": "https://github.example/org/other-service/pull/12",
                "repo_ref": "org/other-service",
            },
            matching_evidence,
        ],
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(**plan),
            current=current,
            db=db,
        )
    )

    assert response.ready is True
    assert response.blockers == []
    assert db.safe_pr_lookups == [("workspace-a", "workflow-safe-pr-1", "checkout")]


def test_release_readiness_matches_generated_manifest_safe_pr_evidence(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    application = {
        "application_id": "checkout",
        "name": "checkout-api",
        "repo_ref": "org/checkout",
        "branch": "main",
        "manifest_path": "deploy/k8s/kustomization.yaml",
        "cluster_id": "target",
        "metadata": {"source_type": "kustomize"},
    }
    plan = {
        "name": "Checkout release",
        "settings": {"runtime_mode": "live", "approval_policy": "auto_safe"},
        "steps": [
            {
                "application_id": "checkout",
                "name": "Checkout",
                "position": 0,
                "config": {
                    "environment": "sandbox",
                    "approval_gate": "safe_pr",
                    "commit_sha": "abc1234",
                    "image": "ghcr.io/example/checkout:v2",
                },
            }
        ],
    }
    step = plan["steps"][0]
    assert isinstance(step, dict)
    rendered = release_router.render_release_step_manifest(plan, 0, application)
    safe_pr = release_router.generated_manifest_safe_pr_body(
        plan,
        step,
        application,
        rendered,
        None,
        None,
        "workspace-a",
    )
    db = ReleaseReadinessSafePrDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ],
        applications={"checkout": application},
        safe_pr={
            "workflow_run_id": safe_pr.workflow_run_id,
            "pr_url": "https://github.example/org/checkout/pull/8",
            "provider": safe_pr.provider,
            "repo_ref": "org/checkout",
            "base_branch": "main",
            "environment": safe_pr.environment,
            "manifest_path": safe_pr.manifest_path,
            "commit_sha": safe_pr.commit_sha,
            "patch_sha256": safe_pr.patch_sha256,
            "created_at": datetime.now(UTC).isoformat(),
        },
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(**plan),
            current=current,
            db=db,
        )
    )

    assert response.ready is True
    assert response.blockers == []
    assert safe_pr.manifest_path == "deploy/k8s/generated/checkout-api.generated.yaml"
    assert db.safe_pr_lookups[-1] == ("workspace-a", safe_pr.workflow_run_id, "checkout")


def test_release_readiness_blocks_safe_pr_gate_without_created_evidence(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessSafePrDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ],
        applications={
            "checkout": {
                "repo_ref": "org/checkout",
                "branch": "main",
                "manifest_path": "deploy/app.yaml",
                "cluster_id": "target",
            }
        },
        safe_pr=None,
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout release",
                settings={"runtime_mode": "live", "approval_policy": "auto_safe"},
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "sandbox",
                            "approval_gate": "safe_pr",
                            "safe_pr_workflow_run_id": "workflow-safe-pr-1",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any("requires a ready Safe PR" in blocker for blocker in response.blockers)
    assert any("no safe_pr.created event was found" in blocker for blocker in response.blockers)


def test_release_readiness_rejects_production_safe_pr_without_rollback_source(
    monkeypatch,
) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    now = datetime.now(UTC)
    application = {
        "repo_ref": "org/checkout",
        "branch": "main",
        "manifest_path": "deploy/app.yaml",
        "cluster_id": "target",
    }
    plan = {
        "name": "Checkout production release",
        "settings": {
            "runtime_mode": "live",
            "approval_policy": "auto_safe",
            "approval_granted": True,
            "approval_granted_by": "lead@example.com",
            "approval_reason": "approved production release",
            "approval_granted_at": now.isoformat(),
            "change_ticket": "CHG-123",
            "release_window_start": (now - timedelta(hours=1)).isoformat(),
            "release_window_end": (now + timedelta(hours=1)).isoformat(),
            "runbook_url": "https://wiki.company.internal/runbooks/checkout-release",
            "release_owner": "checkout-release-team",
            "abort_criteria": "rollback if checkout error rate exceeds 5% for 5 minutes",
        },
        "steps": [
            {
                "application_id": "checkout",
                "name": "Checkout",
                "position": 0,
                "config": {
                    "environment": "production",
                    "namespace": "production",
                    "approval_gate": "safe_pr",
                    "safe_pr_workflow_run_id": "workflow-safe-pr-1",
                    "commit_sha": "abc1234",
                    "image": "ghcr.io/example/checkout:v2",
                    "health_check_path": "/readyz",
                    "post_deploy_verification_url": "https://checkout.company.internal/readyz",
                },
            }
        ],
    }
    step = plan["steps"][0]
    assert isinstance(step, dict)
    expected_patch_sha = release_router.generated_safe_pr_patch_sha256(
        plan,
        step,
        application,
        workspace_id="workspace-a",
    )
    db = ReleaseReadinessSafePrDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": now.isoformat(),
            }
        ],
        applications={"checkout": application},
        safe_pr={
            "workflow_run_id": "workflow-safe-pr-1",
            "pr_url": "https://github.example/org/checkout/pull/7",
            "provider": "github",
            "repo_ref": "org/checkout",
            "base_branch": "main",
            "environment": "production",
            "manifest_path": release_router.generated_safe_pr_manifest_path(
                plan, step, application
            ),
            "commit_sha": "abc1234",
            "patch_sha256": expected_patch_sha,
            "created_at": now.isoformat(),
        },
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(**plan),
            current=SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=()),
            db=db,
        )
    )

    assert response.ready is False
    assert any("requires a ready Safe PR" in blocker for blocker in response.blockers)


def test_release_readiness_does_not_trust_user_supplied_safe_pr_ready(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    db = ReleaseReadinessSafePrDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ],
        applications={
            "checkout": {
                "repo_ref": "org/checkout",
                "branch": "main",
                "manifest_path": "deploy/app.yaml",
                "cluster_id": "target",
            }
        },
        safe_pr=None,
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                name="Checkout release",
                settings={
                    "runtime_mode": "live",
                    "approval_policy": "auto_safe",
                    "safe_pr_ready": True,
                    "safe_pr_url": "https://github.example/org/checkout/pull/7",
                },
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "environment": "sandbox",
                            "approval_gate": "safe_pr",
                            "safe_pr_workflow_run_id": "workflow-safe-pr-1",
                            "safe_pr_ready": True,
                            "safe_pr_url": "https://github.example/org/checkout/pull/7",
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert ("workspace-a", "workflow-safe-pr-1", "checkout") in db.safe_pr_lookups
    assert any("requires a ready Safe PR" in blocker for blocker in response.blockers)
    assert any("no safe_pr.created event was found" in blocker for blocker in response.blockers)


@pytest.mark.parametrize(
    ("field", "bad_value"),
    [
        ("provider", "gitlab"),
        ("repo_ref", "org/other-repo"),
        ("base_branch", "stale-release"),
        ("environment", "production"),
        ("manifest_path", "deploy/other.yaml"),
        ("commit_sha", "def5678"),
        ("patch_sha256", "patch-stale"),
    ],
)
def test_release_readiness_rejects_mismatched_safe_pr_evidence(
    monkeypatch,
    field: str,
    bad_value: str,
) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    application = {
        "repo_ref": "org/checkout",
        "branch": "main",
        "manifest_path": "deploy/app.yaml",
        "cluster_id": "target",
    }
    plan = {
        "name": "Checkout release",
        "settings": {"runtime_mode": "live", "approval_policy": "auto_safe"},
        "steps": [
            {
                "application_id": "checkout",
                "name": "Checkout",
                "position": 0,
                "config": {
                    "environment": "sandbox",
                    "approval_gate": "safe_pr",
                    "safe_pr_workflow_run_id": "workflow-safe-pr-1",
                    "commit_sha": "abc1234",
                    "image": "ghcr.io/example/checkout:v2",
                },
            }
        ],
    }
    step = plan["steps"][0]
    assert isinstance(step, dict)
    safe_pr = {
        "workflow_run_id": "workflow-safe-pr-1",
        "pr_url": "https://github.example/org/checkout/pull/7",
        "provider": "github",
        "repo_ref": "org/checkout",
        "base_branch": "main",
        "manifest_path": release_router.generated_safe_pr_manifest_path(plan, step, application),
        "commit_sha": "abc1234",
        "patch_sha256": release_router.generated_safe_pr_patch_sha256(
            plan, step, application, workspace_id="workspace-a"
        ),
        "created_at": datetime.now(UTC).isoformat(),
    }
    safe_pr[field] = bad_value
    db = ReleaseReadinessSafePrDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ],
        applications={"checkout": application},
        safe_pr=safe_pr,
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(**plan),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any("requires a ready Safe PR" in blocker for blocker in response.blockers)


def test_release_readiness_explains_safe_pr_evidence_mismatch(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    application = {
        "repo_ref": "org/checkout",
        "branch": "main",
        "manifest_path": "deploy/app.yaml",
        "cluster_id": "target",
    }
    plan = {
        "name": "Checkout release",
        "settings": {"runtime_mode": "live", "approval_policy": "auto_safe"},
        "steps": [
            {
                "application_id": "checkout",
                "name": "Checkout",
                "position": 0,
                "config": {
                    "environment": "sandbox",
                    "approval_gate": "safe_pr",
                    "safe_pr_workflow_run_id": "workflow-safe-pr-1",
                    "commit_sha": "abc1234",
                    "image": "ghcr.io/example/checkout:v2",
                },
            }
        ],
    }
    step = plan["steps"][0]
    assert isinstance(step, dict)
    db = ReleaseReadinessSafePrDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ],
        applications={"checkout": application},
        safe_pr={
            "workflow_run_id": "workflow-safe-pr-1",
            "pr_url": "https://github.example/org/checkout/pull/7",
            "provider": "github",
            "repo_ref": "org/checkout",
            "base_branch": "main",
            "environment": "sandbox",
            "manifest_path": release_router.generated_safe_pr_manifest_path(
                plan, step, application
            ),
            "commit_sha": "abc1234",
            "patch_sha256": "bad-digest",
            "created_at": datetime.now(UTC).isoformat(),
        },
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(**plan),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any("none matched" in blocker for blocker in response.blockers)
    assert any("patch_sha256 expected" in blocker for blocker in response.blockers)


@pytest.mark.parametrize(
    "missing_field",
    ["provider", "repo_ref", "base_branch", "environment", "commit_sha", "patch_sha256"],
)
def test_release_readiness_rejects_safe_pr_evidence_missing_required_identity(
    monkeypatch,
    missing_field: str,
) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    application = {
        "repo_ref": "org/checkout",
        "branch": "main",
        "manifest_path": "deploy/app.yaml",
        "cluster_id": "target",
    }
    plan = {
        "name": "Checkout release",
        "settings": {"runtime_mode": "live", "approval_policy": "auto_safe"},
        "steps": [
            {
                "application_id": "checkout",
                "name": "Checkout",
                "position": 0,
                "config": {
                    "environment": "sandbox",
                    "approval_gate": "safe_pr",
                    "safe_pr_workflow_run_id": "workflow-safe-pr-1",
                    "commit_sha": "abc1234",
                    "image": "ghcr.io/example/checkout:v2",
                },
            }
        ],
    }
    step = plan["steps"][0]
    assert isinstance(step, dict)
    safe_pr = {
        "workflow_run_id": "workflow-safe-pr-1",
        "pr_url": "https://github.example/org/checkout/pull/7",
        "provider": "github",
        "repo_ref": "org/checkout",
        "base_branch": "main",
        "environment": "sandbox",
        "manifest_path": release_router.generated_safe_pr_manifest_path(plan, step, application),
        "commit_sha": "abc1234",
        "patch_sha256": release_router.generated_safe_pr_patch_sha256(
            plan, step, application, workspace_id="workspace-a"
        ),
        "created_at": datetime.now(UTC).isoformat(),
    }
    safe_pr.pop(missing_field)
    db = ReleaseReadinessSafePrDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ],
        applications={"checkout": application},
        safe_pr=safe_pr,
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(**plan),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any("requires a ready Safe PR" in blocker for blocker in response.blockers)
    assert any(f"{missing_field} expected" in blocker for blocker in response.blockers)


def test_release_readiness_ignores_user_supplied_safe_pr_patch_digest(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    application = {
        "repo_ref": "org/checkout",
        "branch": "main",
        "manifest_path": "deploy/app.yaml",
        "cluster_id": "target",
    }
    plan = {
        "name": "Checkout release",
        "settings": {"runtime_mode": "live", "approval_policy": "auto_safe"},
        "steps": [
            {
                "application_id": "checkout",
                "name": "Checkout",
                "position": 0,
                "config": {
                    "environment": "sandbox",
                    "approval_gate": "safe_pr",
                    "safe_pr_workflow_run_id": "workflow-safe-pr-1",
                    "safe_pr_patch_sha256": "attacker-digest",
                    "commit_sha": "abc1234",
                    "image": "ghcr.io/example/checkout:v2",
                },
            }
        ],
    }
    step = plan["steps"][0]
    assert isinstance(step, dict)
    assert (
        release_router.generated_safe_pr_patch_sha256(
            plan, step, application, workspace_id="workspace-a"
        )
        != "attacker-digest"
    )
    db = ReleaseReadinessSafePrDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ],
        applications={"checkout": application},
        safe_pr={
            "workflow_run_id": "workflow-safe-pr-1",
            "pr_url": "https://github.example/org/checkout/pull/7",
            "provider": "github",
            "repo_ref": "org/checkout",
            "base_branch": "main",
            "environment": "sandbox",
            "manifest_path": release_router.generated_safe_pr_manifest_path(
                plan, step, application
            ),
            "commit_sha": "abc1234",
            "patch_sha256": "attacker-digest",
            "created_at": datetime.now(UTC).isoformat(),
        },
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(**plan),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any("requires a ready Safe PR" in blocker for blocker in response.blockers)


def test_release_readiness_rejects_safe_pr_evidence_with_unexpected_pr_url(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    application = {
        "repo_ref": "org/checkout",
        "branch": "main",
        "manifest_path": "deploy/app.yaml",
        "cluster_id": "target",
    }
    plan = {
        "name": "Checkout release",
        "settings": {"runtime_mode": "live", "approval_policy": "auto_safe"},
        "steps": [
            {
                "application_id": "checkout",
                "name": "Checkout",
                "position": 0,
                "config": {
                    "environment": "sandbox",
                    "approval_gate": "safe_pr",
                    "safe_pr_workflow_run_id": "workflow-safe-pr-1",
                    "safe_pr_url": "https://github.example/org/checkout/pull/7",
                    "commit_sha": "abc1234",
                    "image": "ghcr.io/example/checkout:v2",
                },
            }
        ],
    }
    step = plan["steps"][0]
    assert isinstance(step, dict)
    db = ReleaseReadinessSafePrDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ],
        applications={"checkout": application},
        safe_pr={
            "workflow_run_id": "workflow-safe-pr-1",
            "pr_url": "https://github.example/org/checkout/pull/99",
            "provider": "github",
            "repo_ref": "org/checkout",
            "base_branch": "main",
            "environment": "sandbox",
            "manifest_path": release_router.generated_safe_pr_manifest_path(
                plan, step, application
            ),
            "commit_sha": "abc1234",
            "patch_sha256": release_router.generated_safe_pr_patch_sha256(
                plan, step, application, workspace_id="workspace-a"
            ),
            "created_at": datetime.now(UTC).isoformat(),
        },
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(**plan),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any("requires a ready Safe PR" in blocker for blocker in response.blockers)


def test_release_readiness_rejects_safe_pr_evidence_pr_url_for_other_repo(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    application = {
        "repo_ref": "org/checkout",
        "branch": "main",
        "manifest_path": "deploy/app.yaml",
        "cluster_id": "target",
    }
    plan = {
        "name": "Checkout release",
        "settings": {"runtime_mode": "live", "approval_policy": "auto_safe"},
        "steps": [
            {
                "application_id": "checkout",
                "name": "Checkout",
                "position": 0,
                "config": {
                    "environment": "sandbox",
                    "approval_gate": "safe_pr",
                    "safe_pr_workflow_run_id": "workflow-safe-pr-1",
                    "commit_sha": "abc1234",
                    "image": "ghcr.io/example/checkout:v2",
                },
            }
        ],
    }
    step = plan["steps"][0]
    assert isinstance(step, dict)
    db = ReleaseReadinessSafePrDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ],
        applications={"checkout": application},
        safe_pr={
            "workflow_run_id": "workflow-safe-pr-1",
            "pr_url": "https://github.example/org/other-service/pull/7",
            "provider": "github",
            "repo_ref": "org/checkout",
            "base_branch": "main",
            "environment": "sandbox",
            "manifest_path": release_router.generated_safe_pr_manifest_path(
                plan, step, application
            ),
            "commit_sha": "abc1234",
            "patch_sha256": release_router.generated_safe_pr_patch_sha256(
                plan, step, application, workspace_id="workspace-a"
            ),
            "created_at": datetime.now(UTC).isoformat(),
        },
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(**plan),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any("requires a ready Safe PR" in blocker for blocker in response.blockers)


def test_release_readiness_rejects_stale_safe_pr_evidence(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    stale_created_at = (datetime.now(UTC) - timedelta(hours=49)).isoformat()
    application = {
        "repo_ref": "org/checkout",
        "branch": "main",
        "manifest_path": "deploy/app.yaml",
        "cluster_id": "target",
    }
    plan = {
        "name": "Checkout release",
        "settings": {"runtime_mode": "live", "approval_policy": "auto_safe"},
        "steps": [
            {
                "application_id": "checkout",
                "name": "Checkout",
                "position": 0,
                "config": {
                    "environment": "sandbox",
                    "approval_gate": "safe_pr",
                    "safe_pr_workflow_run_id": "workflow-safe-pr-1",
                    "commit_sha": "abc1234",
                    "image": "ghcr.io/example/checkout:v2",
                },
            }
        ],
    }
    step = plan["steps"][0]
    assert isinstance(step, dict)
    db = ReleaseReadinessSafePrDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ],
        applications={"checkout": application},
        safe_pr={
            "workflow_run_id": "workflow-safe-pr-1",
            "pr_url": "https://github.example/org/checkout/pull/7",
            "provider": "github",
            "repo_ref": "org/checkout",
            "base_branch": "main",
            "environment": "sandbox",
            "manifest_path": release_router.generated_safe_pr_manifest_path(
                plan, step, application
            ),
            "commit_sha": "abc1234",
            "patch_sha256": release_router.generated_safe_pr_patch_sha256(
                plan, step, application, workspace_id="workspace-a"
            ),
            "created_at": stale_created_at,
        },
    )
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(**plan),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any("requires a ready Safe PR" in blocker for blocker in response.blockers)


def test_release_readiness_blocks_saved_plan_with_active_run(monkeypatch) -> None:
    db = ReleaseReadinessApplicationDb(
        channels=[{"channel_id": "chan-a", "enabled": True}],
        applications={
            "checkout": {
                "repo_ref": "org/checkout",
                "branch": "main",
                "manifest_path": "deploy/app.yaml",
                "cluster_id": "target",
            }
        },
    )
    db.active_plan_ids.add("plan-a")
    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=())
    response = asyncio.run(
        release_router.check_release_readiness(
            release_router.ReleasePlanUpsertRequest(
                plan_id="plan-a",
                name="Checkout release",
                settings={"runtime_mode": "demo", "approval_policy": "auto_safe"},
                steps=[
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "position": 0,
                        "config": {
                            "commit_sha": "abc1234",
                            "image": "ghcr.io/example/checkout:v2",
                        },
                    }
                ],
            ),
            current=current,
            db=db,
        )
    )

    assert response.ready is False
    assert any("already has an active run" in item for item in response.blockers)
    assert any(check["check_id"] == "plan.active_run_lock" for check in response.checks)


def test_release_run_event_serialization_redacts_sensitive_details() -> None:
    event = serialize_release_run_event(
        {
            "audit_id": "audit-1",
            "run_id": "run-a",
            "event_type": "workflow.run.failed",
            "message": "failed",
            "details": {
                "password": "secret-password",
                "nested": {"api_key": "secret-api-key", "reason": "safe"},
            },
            "created_at": None,
        }
    )

    assert event["details"] == {
        "password": "<redacted>",
        "nested": {"api_key": "<redacted>", "reason": "safe"},
    }


def test_release_run_serialization_includes_attention_reasons() -> None:
    run = serialize_release_run(
        {
            "run_id": "run-attention",
            "status": "running",
            "settings": {},
            "github": {},
            "rollback": {},
            "health": {},
        },
        steps=[
            {
                "run_step_id": "step-1",
                "application_id": "checkout",
                "name": "Checkout",
                "status": "failed",
                "health": {"status": "unhealthy"},
            }
        ],
    )

    assert run["derived_status"] == "failed"
    assert run["attention"] == {
        "required": True,
        "reasons": [
            "Release run has failed steps.",
            "Release health is unhealthy.",
            "Checkout failed.",
            "Checkout health is unhealthy.",
        ],
        "stale": False,
        "age_minutes": 0,
        "timeout_minutes": 0,
    }


def test_release_run_serialization_marks_stale_active_run() -> None:
    run = serialize_release_run(
        {
            "run_id": "run-stale",
            "status": "running",
            "settings": {"health_timeout_seconds": 60},
            "github": {},
            "rollback": {},
            "health": {},
            "updated_at": datetime.now(UTC) - timedelta(minutes=5),
        },
        steps=[
            {
                "run_step_id": "step-1",
                "application_id": "checkout",
                "name": "Checkout",
                "status": "running",
                "health": {"status": "progressing", "timeout_seconds": 60},
            }
        ],
    )

    assert run["attention"]["stale"] is True
    assert run["attention"]["age_minutes"] >= 5
    assert run["attention"]["timeout_minutes"] == 1
    assert "No release progress recorded" in run["attention"]["reasons"][0]


def test_release_run_summary_counts_derived_statuses() -> None:
    old_verification = (datetime.now(UTC) - timedelta(minutes=20)).isoformat()
    summary = release_router.release_run_summary_from_runs(
        [
            {
                "run_id": "run-1",
                "plan_id": "plan-a",
                "status": "running",
                "health": {"status": "progressing"},
            },
            {
                "run_id": "run-2",
                "plan_id": "plan-a",
                "status": "running",
                "derived_status": "failed",
                "settings": {"runtime_mode": "live"},
                "health": {"status": "unhealthy"},
                "attention": {"required": True, "reasons": ["Checkout failed."]},
                "steps": [
                    {
                        "details": {
                            "release_guard": {
                                "change_freeze": {
                                    "active": True,
                                    "override_reason": "incident commander approved emergency hotfix",
                                    "production_targets": ["checkout"],
                                },
                                "runbook": {
                                    "override_reason": "incident commander accepted runbook follow-up",
                                },
                                "verification_jobs": {
                                    "jobs": [
                                        {
                                            "job_id": "release-verification-a",
                                            "kind": "http_probe",
                                            "status": "failed",
                                        }
                                    ]
                                },
                            }
                        }
                    }
                ],
            },
            {
                "run_id": "run-3",
                "plan_id": "plan-b",
                "status": "succeeded",
                "steps": [{"details": {"side_effects": True}}],
            },
            {"run_id": "run-4", "plan_id": "plan-c", "status": "rollback_requested"},
            {"run_id": "run-5", "plan_id": "plan-c", "status": "waiting_for_approval"},
            {
                "run_id": "run-6",
                "plan_id": "plan-d",
                "status": "running",
                "attention": {"required": True, "stale": True, "reasons": ["No progress."]},
            },
            {
                "run_id": "run-7",
                "plan_id": "plan-e",
                "status": "running",
                "steps": [
                    {
                        "name": "Payments",
                        "details": {
                            "release_guard": {
                                "verification_jobs": {
                                    "jobs": [
                                        {
                                            "job_id": "release-verification-timeout",
                                            "kind": "http_probe",
                                            "status": "pending",
                                            "queued_at": old_verification,
                                            "timeout_minutes": 5,
                                        }
                                    ]
                                }
                            }
                        },
                    }
                ],
            },
            {"run_id": "run-8", "plan_id": "plan-f", "status": "paused"},
            {"run_id": "run-9", "plan_id": "plan-g", "status": "cancelled"},
        ]
    )

    assert summary["total_runs"] == 9
    assert summary["status_breakdown"] == {
        "running": 3,
        "failed": 1,
        "paused": 1,
        "cancelled": 1,
        "succeeded": 1,
        "rollback_requested": 1,
        "waiting_for_approval": 1,
    }
    assert summary["plan_breakdown"] == {
        "plan-a": 2,
        "plan-b": 1,
        "plan-c": 2,
        "plan-d": 1,
        "plan-e": 1,
        "plan-f": 1,
        "plan-g": 1,
    }
    assert summary["active_runs"] == 5
    assert summary["succeeded_runs"] == 1
    assert summary["cancelled_runs"] == 1
    assert summary["attention_required_runs"] == 5
    assert summary["failed_runs"] == 1
    assert summary["paused_runs"] == 1
    assert summary["rollback_requested_runs"] == 1
    assert summary["waiting_for_approval_runs"] == 1
    assert summary["live_runs"] == 2
    assert summary["unhealthy_runs"] == 1
    assert summary["verification_failed_runs"] == 1
    assert summary["verification_pending_timeout_runs"] == 1
    assert summary["policy_override_runs"] == 1
    assert summary["policy_override_breakdown"] == {
        "Change freeze": 1,
        "Runbook": 1,
    }
    assert summary["active_change_freeze_runs"] == 1
    assert summary["change_freeze_override_runs"] == 1
    assert summary["stale_runs"] == 1
    assert summary["last_run_status"] == "running"
    assert summary["recent_runs"][1] == {
        "run_id": "run-2",
        "plan_id": "plan-a",
        "status": "failed",
        "attention_reasons": ["Checkout failed."],
    }


def test_release_run_handoff_blocks_timed_out_verification_job() -> None:
    old_verification = (datetime.now(UTC) - timedelta(minutes=20)).isoformat()
    handoff = release_router.release_run_handoff(
        {
            "run_id": "run-timeout",
            "plan_id": "plan-a",
            "plan_name": "Checkout",
            "status": "running",
            "current_wave": 1,
            "total_waves": 1,
            "steps": [
                {
                    "name": "Checkout",
                    "status": "succeeded",
                    "details": {
                        "release_guard": {
                            "verification": {
                                "evidence_present": True,
                                "health_check_paths": ["/readyz"],
                                "verification_urls": [],
                                "production_targets": ["checkout"],
                            },
                            "verification_jobs": {
                                "jobs": [
                                    {
                                        "job_id": "release-verification-timeout",
                                        "application_id": "checkout",
                                        "name": "Checkout",
                                        "kind": "kubernetes_health_check",
                                        "status": "pending",
                                        "queued_at": old_verification,
                                        "timeout_minutes": 5,
                                        "target": {"path": "/readyz"},
                                    }
                                ]
                            },
                        }
                    },
                }
            ],
        }
    )

    assert handoff["verification"]["status"] == "blocked"
    assert handoff["verification"]["timed_out_jobs"][0]["job_id"] == "release-verification-timeout"
    verification_check = next(
        check for check in handoff["checks"] if check["name"] == "verification"
    )
    assert verification_check["status"] == "blocked"


def test_release_run_filter_supports_attention_stale_live_and_status() -> None:
    old_verification = (datetime.now(UTC) - timedelta(minutes=20)).isoformat()
    runs = [
        {
            "run_id": "run-live",
            "status": "running",
            "settings": {"runtime_mode": "live"},
            "attention": {"required": False},
            "steps": [
                {
                    "details": {
                        "release_guard": {
                            "change_freeze": {
                                "active": True,
                                "override_reason": "incident commander approved emergency hotfix",
                            },
                            "diagnostics": {
                                "override_reason": "diagnostics temporarily waived by incident command",
                            },
                        }
                    }
                }
            ],
        },
        {
            "run_id": "run-stale",
            "status": "running",
            "attention": {"required": True, "stale": True},
            "steps": [],
        },
        {
            "run_id": "run-failed",
            "status": "running",
            "derived_status": "failed",
            "attention": {"required": True},
            "steps": [{"details": {"side_effects": True}}],
        },
        {
            "run_id": "run-verification-failed",
            "status": "running",
            "attention": {"required": True},
            "steps": [
                {
                    "details": {
                        "release_guard": {
                            "verification_jobs": {
                                "jobs": [
                                    {
                                        "job_id": "release-verification-a",
                                        "status": "failed",
                                    }
                                ]
                            }
                        }
                    }
                }
            ],
        },
        {
            "run_id": "run-verification-status-timeout",
            "status": "running",
            "steps": [
                {
                    "details": {
                        "release_guard": {
                            "verification_jobs": {
                                "jobs": [
                                    {
                                        "job_id": "release-verification-status-timeout",
                                        "status": "timeout",
                                    }
                                ]
                            }
                        }
                    }
                }
            ],
        },
        {
            "run_id": "run-verification-timeout",
            "status": "running",
            "steps": [
                {
                    "details": {
                        "release_guard": {
                            "verification_jobs": {
                                "jobs": [
                                    {
                                        "job_id": "release-verification-timeout",
                                        "status": "pending",
                                        "queued_at": old_verification,
                                        "timeout_minutes": 5,
                                    }
                                ]
                            }
                        }
                    }
                }
            ],
        },
        {
            "run_id": "run-rollback-requested",
            "status": "rollback_requested",
            "steps": [],
        },
        {
            "run_id": "run-paused",
            "status": "paused",
            "steps": [],
        },
        {
            "run_id": "run-unhealthy",
            "status": "running",
            "health": {"status": "unhealthy"},
            "steps": [],
        },
        {
            "run_id": "run-step-unhealthy",
            "status": "running",
            "steps": [{"health": {"status": "unhealthy"}}],
        },
        {
            "run_id": "run-succeeded",
            "status": "succeeded",
            "steps": [],
        },
        {
            "run_id": "run-cancelled",
            "status": "cancelled",
            "steps": [],
        },
    ]

    assert [run["run_id"] for run in release_router.filter_release_runs(runs, status="failed")] == [
        "run-failed"
    ]
    assert [
        run["run_id"] for run in release_router.filter_release_runs(runs, status="succeeded")
    ] == ["run-succeeded"]
    assert [
        run["run_id"] for run in release_router.filter_release_runs(runs, status="cancelled")
    ] == ["run-cancelled"]
    assert [
        run["run_id"] for run in release_router.filter_release_runs(runs, attention_only=True)
    ] == ["run-stale", "run-failed", "run-verification-failed"]
    assert [run["run_id"] for run in release_router.filter_release_runs(runs, stale_only=True)] == [
        "run-stale"
    ]
    assert [
        run["run_id"] for run in release_router.filter_release_runs(runs, active_only=True)
    ] == [
        "run-live",
        "run-stale",
        "run-verification-failed",
        "run-verification-status-timeout",
        "run-verification-timeout",
        "run-paused",
        "run-unhealthy",
        "run-step-unhealthy",
    ]
    assert [run["run_id"] for run in release_router.filter_release_runs(runs, live_only=True)] == [
        "run-live",
        "run-failed",
    ]
    assert [
        run["run_id"]
        for run in release_router.filter_release_runs(runs, status="rollback_requested")
    ] == ["run-rollback-requested"]
    assert [run["run_id"] for run in release_router.filter_release_runs(runs, status="paused")] == [
        "run-paused"
    ]
    assert [
        run["run_id"] for run in release_router.filter_release_runs(runs, unhealthy_only=True)
    ] == ["run-unhealthy", "run-step-unhealthy"]
    assert [
        run["run_id"]
        for run in release_router.filter_release_runs(runs, verification_failed_only=True)
    ] == ["run-verification-failed", "run-verification-status-timeout"]
    assert [
        run["run_id"]
        for run in release_router.filter_release_runs(runs, verification_pending_timeout_only=True)
    ] == ["run-verification-timeout"]
    assert [
        run["run_id"]
        for run in release_router.filter_release_runs(runs, active_change_freeze_only=True)
    ] == ["run-live"]
    assert [
        run["run_id"] for run in release_router.filter_release_runs(runs, policy_override_only=True)
    ] == ["run-live"]
    assert [
        run["run_id"]
        for run in release_router.filter_release_runs(runs, policy_override_source="Diagnostics")
    ] == ["run-live"]
    assert [
        run["run_id"]
        for run in release_router.filter_release_runs(runs, policy_override_source="change-freeze")
    ] == ["run-live"]
    assert [
        run["run_id"]
        for run in release_router.filter_release_runs(runs, policy_override_source="Runbook")
    ] == []
    assert [
        run["run_id"]
        for run in release_router.filter_release_runs(runs, change_freeze_override_only=True)
    ] == ["run-live"]


class ReleaseDispatchDb:
    def __init__(self, *, channels: list[dict[str, object]] | None = None) -> None:
        self.dispatched: list[dict[str, object]] = []
        self.active_plan_ids: set[str] = set()
        self.channels = channels or []

    def get_application(self, _workspace_id: str, _application_id: str) -> dict[str, object]:
        return {
            "repo_ref": "org/app-a",
            "branch": "main",
            "cluster_id": "target",
            "manifest_path": "deploy/app.yaml",
        }

    def mark_release_run_step_dispatched(self, *args: object, **kwargs: object) -> None:
        self.dispatched.append({"args": args, **kwargs})

    def has_active_release_runs(self, _workspace_id: str, plan_id: str) -> bool:
        return plan_id in self.active_plan_ids

    def list_alert_channels(
        self, _workspace_id: str, *, only_enabled: bool = False
    ) -> list[dict[str, object]]:
        if only_enabled:
            return [channel for channel in self.channels if channel.get("enabled", True)]
        return self.channels


class MissingApplicationDispatchDb(ReleaseDispatchDb):
    def get_application(self, _workspace_id: str, _application_id: str) -> None:
        return None


class FailingEventGateway:
    def __init__(self) -> None:
        self.calls = 0

    async def accept_body(self, *_args: object, **_kwargs: object) -> object:
        self.calls += 1
        raise AssertionError("demo release dispatch must not publish real events")


class AcceptingEventGateway:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def accept_body(self, body: object, actor: object) -> object:
        self.calls.append({"body": body, "actor": actor})
        event = SimpleNamespace(
            event_id="evt-live",
            correlation_id="corr-live",
            to_dict=lambda: {
                "event_id": "evt-live",
                "correlation_id": "corr-live",
                "subject": "git.webhook.received",
            },
        )
        return SimpleNamespace(event=event)


class ReleaseRunActionDb:
    def __init__(
        self,
        *,
        rollback_policy: str = "manual",
        verification_job_status: str = "passed",
        verification_queued_at: str | None = None,
        verification_timeout_minutes: int | None = None,
        step_health_status: str = "healthy",
        recent_notify_minutes: int | None = None,
    ) -> None:
        self.requested_rollback = False
        self.updated: list[dict[str, object]] = []
        self.recorded_events: list[dict[str, object]] = []
        self.rollback_policy = rollback_policy
        self.verification_job_status = verification_job_status
        self.verification_queued_at = verification_queued_at
        self.verification_timeout_minutes = verification_timeout_minutes
        self.step_health_status = step_health_status
        self.recent_notify_minutes = recent_notify_minutes

    def get_release_run(self, _workspace_id: str, _run_id: str) -> dict[str, object]:
        events: list[dict[str, object]] = []
        if self.recent_notify_minutes is not None:
            events.append(
                {
                    "event_type": "release.notify.previous",
                    "created_at": (
                        datetime.now(UTC) - timedelta(minutes=self.recent_notify_minutes)
                    ).isoformat(),
                }
            )
        events.extend(self.recorded_events)
        return {
            "run_id": "release-run-1",
            "status": "running",
            "current_wave": 1,
            "total_waves": 1,
            "plan_name": "Checkout release",
            "settings": {"rollback_policy": self.rollback_policy},
            "rollback": {"policy": self.rollback_policy},
            "attention": {"required": True, "reasons": ["Release run is paused by an operator."]},
            "events": events,
            "steps": [
                {
                    "application_id": "checkout",
                    "name": "Checkout",
                    "wave": 1,
                    "status": "succeeded",
                    "approval_id": "approval-checkout-1",
                    "health": {"status": self.step_health_status},
                    "details": {
                        "cluster_id": "target",
                        "namespace": "sandbox",
                        "environment": "staging",
                        "gate": "manual",
                        "approval": {
                            "approval_id": "approval-checkout-1",
                            "decision": "granted",
                            "reason": "SRE approved production rollout",
                        },
                        "config": {
                            "repo_ref": "org/checkout",
                            "commit_sha": "abc123",
                            "manifest_path": "deploy/app.yaml",
                        },
                        "side_effects": True,
                        "release_guard": {
                            "verification": {
                                "evidence_present": True,
                                "override_reason": None,
                                "production_targets": ["checkout"],
                                "health_check_paths": ["/readyz"],
                                "verification_urls": [],
                            },
                            "verification_jobs": {
                                "scheduled": True,
                                "job_count": 1,
                                "jobs": [
                                    {
                                        "job_id": "release-verification-fixture",
                                        "application_id": "checkout",
                                        "name": "Checkout",
                                        "kind": "kubernetes_health_check",
                                        "status": self.verification_job_status,
                                        **(
                                            {"queued_at": self.verification_queued_at}
                                            if self.verification_queued_at
                                            else {}
                                        ),
                                        **(
                                            {"timeout_minutes": self.verification_timeout_minutes}
                                            if self.verification_timeout_minutes is not None
                                            else {}
                                        ),
                                        "evidence_key": "release-run-1:wave-1:checkout:post-deploy-verification",
                                        "target": {
                                            "cluster_id": "target",
                                            "namespace": "sandbox",
                                            "service_name": "checkout",
                                            "path": "/readyz",
                                        },
                                    }
                                ],
                            },
                            "abort_criteria": {
                                "criteria": [
                                    "rollback if checkout error rate exceeds 5% for 5 minutes"
                                ],
                                "override_reason": None,
                                "production_targets": ["checkout"],
                            },
                            "change_freeze": {
                                "start": "2026-07-09T09:00:00Z",
                                "end": "2026-07-09T11:00:00Z",
                                "active": True,
                                "override_reason": "incident commander approved emergency hotfix",
                                "production_targets": ["checkout"],
                            },
                            "readiness": {
                                "impact": {
                                    "production_targets": ["checkout"],
                                }
                            },
                        },
                    },
                }
            ],
        }

    def update_release_run_status(self, *args: object, **kwargs: object) -> dict[str, object]:
        self.updated.append({"args": args, **kwargs})
        return self.get_release_run("workspace-a", "release-run-1")

    def record_release_run_event(
        self,
        _workspace_id: str,
        _run_id: str,
        event_type: str,
        message: str,
        *,
        actor: str | None = None,
        details: dict[str, object] | None = None,
    ) -> dict[str, object]:
        self.recorded_events.append(
            {
                "event_type": event_type,
                "message": message,
                "actor": actor,
                "details": details or {},
                "created_at": datetime.now(UTC).isoformat(),
            }
        )
        return self.get_release_run("workspace-a", "release-run-1")

    def request_release_run_rollback(self, *args: object, **kwargs: object) -> dict[str, object]:
        self.requested_rollback = True
        run = self.get_release_run("workspace-a", "release-run-1")
        run["status"] = "rollback_requested"
        return run


class ReleaseRunReportDb(ReleaseRunActionDb):
    def __init__(self) -> None:
        super().__init__()
        self.filters: dict[str, object] = {}

    def get_release_run(self, workspace_id: str, run_id: str) -> dict[str, object]:
        run = super().get_release_run(workspace_id, run_id)
        steps = run.get("steps")
        if isinstance(steps, list) and steps and isinstance(steps[0], dict):
            steps[0]["workflow_run_id"] = "workflow-checkout-1"
        return run

    def list_release_audit_events(
        self,
        _workspace_id: str,
        *,
        plan_id: str | None,
        run_id: str | None,
        event_type: str | None,
        limit: int,
    ) -> list[dict[str, object]]:
        self.filters = {
            "plan_id": plan_id,
            "run_id": run_id,
            "event_type": event_type,
            "limit": limit,
        }
        return [
            {
                "audit_id": "audit-report-1",
                "workspace_id": "workspace-a",
                "run_id": "release-run-1",
                "plan_id": "release-plan-1",
                "plan_name": "Checkout release",
                "run_status": "failed",
                "event_type": "workflow.run.failed",
                "message": "checkout rollout failed",
                "actor": "operator",
                "details": {
                    "reason": "rollout health failed",
                    "token": "raw-token",
                    "nested": {"client_secret": "super-secret", "safe": "visible"},
                },
                "application_ids": ["checkout"],
                "created_at": "2026-07-09T10:00:00Z",
                "_steps": [{"application_id": "checkout"}],
            }
        ]


class ReleaseRetryDb:
    def __init__(self, *, previous_retry: bool = False) -> None:
        self.retry_marks: list[dict[str, object]] = []
        self.dispatched: list[str] = []
        self.previous_retry = previous_retry
        self.status = "failed"

    def get_release_run(self, _workspace_id: str, _run_id: str) -> dict[str, object]:
        events: list[dict[str, object]] = []
        if self.previous_retry:
            events.append({"event_type": "release.retry.wave.1.attempt.1.running"})
        return {
            "run_id": "release-run-retry",
            "plan_id": "release-plan-a",
            "plan_name": "Checkout release",
            "status": self.status,
            "derived_status": self.status,
            "current_wave": 1,
            "total_waves": 1,
            "settings": {"runtime_mode": "demo", "retry_attempts": 1},
            "events": events,
            "steps": [
                {
                    "application_id": "checkout",
                    "name": "Checkout",
                    "wave": 1,
                    "status": "failed",
                    "health": {"status": "unhealthy"},
                    "details": {
                        "config": {
                            "branch": "main",
                            "commit_sha": "abc123",
                            "image": "ghcr.io/example/checkout:v2",
                            "manifest_path": "deploy/app.yaml",
                            "cluster_id": "target",
                            "environment": "sandbox",
                        }
                    },
                },
                {
                    "application_id": "billing",
                    "name": "Billing",
                    "wave": 1,
                    "status": "succeeded",
                    "health": {"status": "healthy"},
                    "details": {
                        "config": {
                            "branch": "main",
                            "commit_sha": "abc123",
                            "image": "ghcr.io/example/billing:v2",
                        }
                    },
                },
            ],
        }

    def get_application(self, _workspace_id: str, application_id: str) -> dict[str, object]:
        return {
            "repo_ref": f"org/{application_id}",
            "branch": "main",
            "cluster_id": "target",
            "manifest_path": "deploy/app.yaml",
        }

    def mark_release_run_retry(
        self,
        _workspace_id: str,
        _run_id: str,
        wave: int,
        attempt: int,
        status: str,
        **kwargs: object,
    ) -> dict[str, object]:
        self.status = status
        self.retry_marks.append({"wave": wave, "attempt": attempt, "status": status, **kwargs})
        return self.get_release_run("workspace-a", "release-run-retry")

    def mark_release_run_step_dispatched(
        self,
        _workspace_id: str,
        _run_id: str,
        application_id: str,
        **_kwargs: object,
    ) -> None:
        self.dispatched.append(application_id)


class ReleaseAuditDb:
    def __init__(self) -> None:
        self.filters: dict[str, object] = {}

    def list_release_audit_events(
        self,
        _workspace_id: str,
        *,
        plan_id: str | None,
        run_id: str | None,
        event_type: str | None,
        limit: int,
    ) -> list[dict[str, object]]:
        self.filters = {
            "plan_id": plan_id,
            "run_id": run_id,
            "event_type": event_type,
            "limit": limit,
        }
        return [
            {
                "audit_id": "audit-1",
                "workspace_id": "workspace-a",
                "run_id": "run-a",
                "plan_id": "plan-a",
                "plan_name": "Checkout release",
                "run_status": "failed",
                "event_type": "workflow.run.failed",
                "message": "checkout rollout failed",
                "actor": "operator",
                "details": {
                    "reason": "rollout health failed",
                    "token": "raw-token",
                    "nested": {"client_secret": "super-secret", "safe": "visible"},
                },
                "application_ids": ["checkout"],
                "created_at": "2026-07-09T10:00:00Z",
                "_steps": [{"application_id": "checkout"}],
            }
        ]


class ReleaseReadinessDb:
    def __init__(self, *, channels: list[dict[str, object]]) -> None:
        self.channels = channels

    def list_alert_channels(
        self,
        _workspace_id: str,
        *,
        only_enabled: bool = False,
    ) -> list[dict[str, object]]:
        if only_enabled:
            return [channel for channel in self.channels if channel.get("enabled", True)]
        return self.channels


class ReleaseReadinessApplicationDb(ReleaseReadinessDb):
    def __init__(
        self,
        *,
        channels: list[dict[str, object]],
        applications: dict[str, dict[str, object]],
    ) -> None:
        super().__init__(channels=channels)
        self.applications = applications
        self.active_plan_ids: set[str] = set()

    def get_application(
        self,
        _workspace_id: str,
        application_id: str,
    ) -> dict[str, object] | None:
        return self.applications.get(application_id)

    def has_active_release_runs(self, _workspace_id: str, plan_id: str) -> bool:
        return plan_id in self.active_plan_ids


class ReleaseReadinessSafePrDb(ReleaseReadinessApplicationDb):
    def __init__(
        self,
        *,
        channels: list[dict[str, object]],
        applications: dict[str, dict[str, object]],
        safe_pr: dict[str, object] | list[dict[str, object]] | None,
    ) -> None:
        super().__init__(channels=channels, applications=applications)
        self.safe_pr = safe_pr
        self.safe_pr_lookups: list[tuple[str, str, str | None]] = []

    def find_release_safe_pr_evidence(
        self,
        workspace_id: str,
        workflow_run_id: str,
        *,
        application_id: str | None = None,
    ) -> dict[str, object] | None:
        self.safe_pr_lookups.append((workspace_id, workflow_run_id, application_id))
        safe_pr = self._safe_pr_items(workflow_run_id)
        if not safe_pr:
            return None
        return safe_pr[0]

    def list_release_safe_pr_evidence(
        self,
        workspace_id: str,
        workflow_run_id: str,
        *,
        application_id: str | None = None,
        limit: int = 20,
    ) -> list[dict[str, object]]:
        self.safe_pr_lookups.append((workspace_id, workflow_run_id, application_id))
        return self._safe_pr_items(workflow_run_id)[:limit]

    def _safe_pr_items(self, workflow_run_id: str) -> list[dict[str, object]]:
        if not self.safe_pr:
            return []
        items = self.safe_pr if isinstance(self.safe_pr, list) else [self.safe_pr]
        return [item for item in items if item.get("workflow_run_id") == workflow_run_id]


def test_yaml_diagnostics_reports_parser_location() -> None:
    diagnostics = yaml_diagnostics(
        "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: checkout\nspec:\n  replicas: [\n"
    )

    first = diagnostics[0]
    assert first.code == "yaml.syntax"
    assert first.severity == "error"
    assert first.line >= 1
    assert first.column >= 1


def test_yaml_diagnostics_warns_for_mutable_deployment_image() -> None:
    diagnostics = yaml_diagnostics(
        """
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-api
  namespace: sandbox
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: checkout-api
          image: ghcr.io/example/checkout-api:latest
""",
        {"namespace": "sandbox"},
    )

    assert "k8s.image_tag_mutable" in codes(diagnostics)


def test_yaml_diagnostics_reports_operational_risk_diff() -> None:
    previous = """
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-api
  namespace: sandbox
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: checkout-api
          image: ghcr.io/example/checkout-api:v1.4.2
          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080
          resources:
            limits:
              memory: 512Mi
---
apiVersion: v1
kind: Service
metadata:
  name: checkout-api
  namespace: sandbox
spec:
  selector:
    app: checkout-api
  ports:
    - port: 80
      targetPort: 8080
"""
    current = """
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-api
  namespace: sandbox
spec:
  replicas: 0
  template:
    spec:
      containers:
        - name: checkout-api
          image: ghcr.io/example/checkout-api:latest
          securityContext:
            privileged: true
---
apiVersion: v1
kind: Service
metadata:
  name: checkout-api
  namespace: sandbox
spec:
  selector:
    app: checkout-v2
  ports:
    - port: 80
      targetPort: 9000
"""

    diagnostics = yaml_diagnostics(current, {"namespace": "sandbox", "previous_content": previous})

    assert {
        "risk.replicas_zero",
        "risk.replicas_scaled_to_zero",
        "risk.privileged_enabled",
        "risk.resource_limits_removed",
        "risk.readiness_probe_removed",
        "risk.service_selector_changed",
        "risk.service_target_port_changed",
    } <= codes(diagnostics)


def test_settings_diagnostics_catches_bad_form_values() -> None:
    diagnostics = settings_diagnostics(
        {
            "repo_ref": "missing-owner",
            "branch": "",
            "manifest_path": "deploy.txt",
            "namespace": "Bad_Namespace",
            "replicas": -1,
        }
    )

    assert {
        "settings.repo_ref_format",
        "settings.branch_required",
        "settings.manifest_path_shape",
        "settings.namespace_format",
        "settings.replicas_range",
    } <= codes(diagnostics)


def test_settings_diagnostics_catches_bad_runtime_modes() -> None:
    diagnostics = settings_diagnostics(
        {
            "runtime_mode": "pretend-live",
            "provider_mode": "fake-provider",
        }
    )

    assert {
        "release.runtime_mode_choice",
        "release.provider_mode_choice",
    } <= codes(diagnostics)


def test_release_execution_profile_defaults_to_demo_without_side_effects() -> None:
    profile = execution_profile({"settings": {}})

    assert profile.runtime_mode == "demo"
    assert profile.provider_mode == "dry_run"
    assert profile.side_effects is False
    assert profile.to_body()["label"] == "Demo mode"
    assert dry_run_event_id(None, "app-a", 1).startswith("dry-run-")


def test_release_execution_profile_live_enables_side_effects() -> None:
    profile = execution_profile({"settings": {"runtime_mode": "live"}})

    assert profile.runtime_mode == "live"
    assert profile.provider_mode == "live"
    assert profile.side_effects is True


def test_live_release_blockers_require_backend_allowlist_and_approval(monkeypatch) -> None:
    monkeypatch.delenv("RELEASE_FLOW_LIVE_ENABLED", raising=False)
    plan = {
        "settings": {
            "runtime_mode": "live",
            "approval_policy": "manual_each_step",
        },
        "steps": [
            {
                "application_id": "app-a",
                "config": {"environment": "sandbox"},
            }
        ],
    }
    preview = build_release_plan_preview(plan)

    blockers = release_execution_blockers(plan, preview, 1, workspace_id="workspace-a")

    assert any("Live release dispatch is disabled" in item for item in blockers)
    assert any("requires approval" in item for item in blockers)

    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    approved = {
        **plan,
        "settings": {
            **plan["settings"],
            "approval_granted": True,
        },
    }

    assert (
        release_execution_blockers(
            approved, build_release_plan_preview(approved), 1, workspace_id="workspace-a"
        )
        == []
    )


def test_live_release_blockers_require_external_ticket_and_safe_pr(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "*")
    plan = {
        "settings": {
            "runtime_mode": "live",
            "approval_policy": "external_change_ticket",
        },
        "steps": [
            {
                "application_id": "app-a",
                "config": {"approval_gate": "safe_pr", "environment": "production"},
            }
        ],
    }
    preview = build_release_plan_preview(plan)

    blockers = release_execution_blockers(plan, preview, 1, workspace_id="workspace-a")

    assert any("external change ticket" in item for item in blockers)
    assert any("ready Safe PR" in item for item in blockers)

    ready = {
        **plan,
        "settings": {
            **plan["settings"],
            "change_ticket": "CHG-123",
            "safe_pr_url": "https://github.example/pull/1",
        },
    }
    blockers = release_execution_blockers(
        ready, build_release_plan_preview(ready), 1, workspace_id="workspace-a"
    )
    assert any("ready Safe PR" in item for item in blockers)

    ready_with_evidence = {
        **plan,
        "settings": {
            **plan["settings"],
            "change_ticket": "CHG-123",
        },
        "steps": [
            {
                "application_id": "app-a",
                "config": {
                    "approval_gate": "safe_pr",
                    "environment": "production",
                    "safe_pr_ready": True,
                    "safe_pr_url": "https://github.example/pull/1",
                    "safe_pr_evidence": {
                        "event_id": "event-safe-pr-created",
                        "workflow_run_id": "workflow-safe-pr-1",
                        "pr_url": "https://github.example/pull/1",
                        "created_at": datetime.now(UTC).isoformat(),
                    },
                },
            }
        ],
    }
    assert (
        release_execution_blockers(
            ready_with_evidence,
            build_release_plan_preview(ready_with_evidence),
            1,
            workspace_id="workspace-a",
        )
        == []
    )


def test_settings_diagnostics_compares_against_previous_settings() -> None:
    diagnostics = settings_diagnostics(
        {
            "repo_ref": "owner/new",
            "branch": "release",
            "manifest_path": "deploy/new.yaml",
            "namespace": "production",
            "replicas": 0,
        },
        {
            "previous_settings": {
                "repo_ref": "owner/old",
                "branch": "main",
                "manifest_path": "deploy/app.yaml",
                "namespace": "sandbox",
                "replicas": 2,
            }
        },
    )

    assert {
        "risk.settings_replicas_zero",
        "risk.settings_replicas_scaled_to_zero",
        "risk.settings_repo_changed",
        "risk.settings_branch_changed",
        "risk.settings_manifest_path_changed",
        "risk.settings_namespace_changed",
        "risk.settings_production_namespace",
    } <= codes(diagnostics)


def test_release_plan_diagnostics_catches_duplicate_and_cycle() -> None:
    diagnostics = release_plan_diagnostics(
        {
            "name": "bad flow",
            "steps": [
                {
                    "application_id": "app-a",
                    "depends_on": ["app-b"],
                    "config": {"branch": "main", "manifest_path": "deploy.yaml"},
                },
                {
                    "application_id": "app-b",
                    "depends_on": ["app-a"],
                    "config": {"branch": "main", "manifest_path": "deploy.yaml"},
                },
                {
                    "application_id": "app-a",
                    "depends_on": [],
                    "config": {"branch": "main", "manifest_path": "deploy.yaml"},
                },
            ],
        }
    )

    assert "release.duplicate_application" in codes(diagnostics)
    assert "release.dependency_cycle" in codes(diagnostics)


def test_release_plan_diagnostics_uses_step_baselines() -> None:
    diagnostics = release_plan_diagnostics(
        {
            "name": "risk flow",
            "steps": [
                {
                    "application_id": "app-a",
                    "depends_on": [],
                    "config": {
                        "branch": "main",
                        "manifest_path": "deploy.yaml",
                        "namespace": "sandbox",
                        "replicas": 0,
                    },
                }
            ],
        },
        {"previous_settings_by_application": {"app-a": {"replicas": 2, "namespace": "sandbox"}}},
    )

    assert "risk.settings_replicas_scaled_to_zero" in codes(diagnostics)
    assert diagnostics[0].path is None or "steps[0]" in "".join(
        item.path or "" for item in diagnostics
    )


def test_release_plan_diagnostics_catches_advanced_policy_risks() -> None:
    diagnostics = release_plan_diagnostics(
        {
            "name": "prod flow",
            "settings": {
                "execution_mode": "sequential_apply",
                "approval_policy": "auto_safe",
                "failure_policy": "continue_independent",
                "rollback_policy": "disabled",
                "environment_order": ["sandbox", "production"],
                "default_strategy": "canary",
            },
            "steps": [
                {
                    "application_id": "app-a",
                    "depends_on": [],
                    "config": {
                        "branch": "main",
                        "manifest_path": "deploy.yaml",
                        "environment": "production",
                        "namespace": "production",
                        "strategy": "canary",
                        "canary_percent": 0,
                        "approval_gate": "auto",
                        "health_check_path": "readyz",
                    },
                }
            ],
        }
    )

    assert {
        "risk.release_auto_approval_production",
        "risk.release_rollback_disabled_production",
        "risk.release_continue_without_rollback",
        "release.canary_percent_range",
        "release.health_check_path_format",
        "risk.release_step_auto_gate_production",
    } <= codes(diagnostics)


def test_release_plan_preview_groups_dependency_waves() -> None:
    preview = build_release_plan_preview(
        {
            "plan_id": "plan-a",
            "settings": {"approval_policy": "manual_each_step", "default_strategy": "rolling"},
            "steps": [
                {"application_id": "app-a", "name": "A", "depends_on": [], "position": 0},
                {"application_id": "app-b", "name": "B", "depends_on": ["app-a"], "position": 1},
                {"application_id": "app-c", "name": "C", "depends_on": ["app-a"], "position": 2},
            ],
        }
    )

    assert preview["executable"] is True
    assert preview["waves"] == [
        {"wave": 1, "step_ids": ["preview-step-0"], "applications": ["app-a"]},
        {
            "wave": 2,
            "step_ids": ["preview-step-1", "preview-step-2"],
            "applications": ["app-b", "app-c"],
        },
    ]
    assert preview["steps"][0]["gate"] == "manual_each_step"


def test_release_plan_preview_reports_blockers() -> None:
    preview = build_release_plan_preview(
        {
            "steps": [
                {"application_id": "app-a", "depends_on": ["app-b"]},
                {"application_id": "app-b", "depends_on": ["app-a"]},
            ],
        }
    )

    assert preview["executable"] is False
    assert preview["waves"] == []
    assert "cycle" in preview["blockers"][0]


def test_release_dispatch_builds_gitops_webhook_for_selected_wave() -> None:
    plan = {
        "settings": {"environment_order": ["sandbox", "production"]},
        "steps": [
            {
                "application_id": "app-a",
                "depends_on": [],
                "config": {
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "environment": "sandbox",
                    "namespace": "sandbox",
                    "replicas": 3,
                },
            },
            {
                "application_id": "app-b",
                "depends_on": ["app-a"],
                "config": {
                    "commit_sha": "def456",
                    "image": "ghcr.io/example/app-b:v2",
                },
            },
        ],
    }
    preview = build_release_plan_preview(plan)

    selected = steps_for_wave(plan, preview, 1)
    request = dispatch_request_for_step(
        plan,
        selected[0],
        {
            "repo_ref": "org/app-a",
            "branch": "main",
            "cluster_id": "target",
            "manifest_path": "deploy/app.yaml",
        },
        "workspace-a",
    )

    assert [step["application_id"] for step in selected] == ["app-a"]
    assert request.commit_sha == "abc123"
    assert request.image == "ghcr.io/example/app-a:v2"
    assert request.replicas == 3
    assert request.repo_ref == "org/app-a"
    assert request.manifest_path == "deploy/app.yaml"
    assert request.force is True
    assert request.workflow_run_id != DEFAULT_WORKFLOW_RUN_ID


def test_dispatch_wave_steps_defaults_to_dry_run_without_publishing(monkeypatch) -> None:
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {},
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb()
    events = FailingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))
    monkeypatch.setattr(release_router, "require_cluster_access", lambda *_args, **_kwargs: None)

    async def run() -> list[dict[str, object]]:
        return await release_router.dispatch_wave_steps(
            plan,
            preview,
            1,
            "workspace-a",
            current,
            db,
            events,
            run_id="run-a",
        )

    accepted = asyncio.run(run())

    assert events.calls == 0
    assert accepted[0]["event_id"] == dry_run_event_id("run-a", "app-a", 1)
    assert accepted[0]["event"]["dry_run"] is True
    assert accepted[0]["event"]["execution_profile"]["side_effects"] is False
    assert db.dispatched[0]["details"]["runtime_mode"] == "demo"
    assert db.dispatched[0]["details"]["side_effects"] is False


def test_dispatch_wave_steps_blocks_unregistered_application(monkeypatch) -> None:
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {},
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "missing-app",
                "name": "checkout",
                "config": {
                    "branch": "main",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                    "health_check_path": "/readyz",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = MissingApplicationDispatchDb()
    events = FailingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))
    monkeypatch.setattr(release_router, "require_cluster_access", lambda *_args, **_kwargs: None)

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            release_router.dispatch_wave_steps(
                plan,
                preview,
                1,
                "workspace-a",
                current,
                db,
                events,
                run_id="run-a",
            )
        )

    assert raised.value.status_code == 409
    assert any(
        "Application missing-app is not registered" in blocker
        for blocker in raised.value.detail["blockers"]
    )
    assert events.calls == 0
    assert db.dispatched == []


def test_dispatch_wave_steps_blocks_live_without_backend_gate(monkeypatch) -> None:
    monkeypatch.delenv("RELEASE_FLOW_LIVE_ENABLED", raising=False)
    monkeypatch.delenv("RELEASE_FLOW_LIVE_WORKSPACES", raising=False)
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {"runtime_mode": "live", "approval_policy": "auto_safe"},
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb()
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            release_router.dispatch_wave_steps(
                plan,
                preview,
                1,
                "workspace-a",
                current,
                db,
                events,
                run_id="run-a",
            )
        )

    assert raised.value.status_code == 409
    assert any(
        "Live release dispatch is disabled" in blocker
        for blocker in raised.value.detail["blockers"]
    )
    assert events.calls == []
    assert db.dispatched == []


def test_dispatch_wave_steps_blocks_live_without_alert_channel(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {"runtime_mode": "live", "approval_policy": "auto_safe"},
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb()
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            release_router.dispatch_wave_steps(
                plan,
                preview,
                1,
                "workspace-a",
                current,
                db,
                events,
                run_id="run-a",
            )
        )

    assert raised.value.status_code == 409
    assert any(
        "requires at least one enabled alert channel" in blocker
        for blocker in raised.value.detail["blockers"]
    )
    assert events.calls == []
    assert db.dispatched == []


def test_dispatch_wave_steps_blocks_live_with_critical_only_alert_channel(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {"runtime_mode": "live", "approval_policy": "auto_safe"},
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb(
        channels=[{"channel_id": "chan-critical", "enabled": True, "min_severity": "critical"}]
    )
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            release_router.dispatch_wave_steps(
                plan,
                preview,
                1,
                "workspace-a",
                current,
                db,
                events,
                run_id="run-a",
            )
        )

    assert raised.value.status_code == 409
    assert any(
        "warning-or-higher release events" in blocker for blocker in raised.value.detail["blockers"]
    )
    assert events.calls == []
    assert db.dispatched == []


def test_dispatch_wave_steps_blocks_live_with_unvalidated_warning_alert_channel(
    monkeypatch,
) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {"runtime_mode": "live", "approval_policy": "auto_safe"},
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "failed",
            }
        ]
    )
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            release_router.dispatch_wave_steps(
                plan,
                preview,
                1,
                "workspace-a",
                current,
                db,
                events,
                run_id="run-a",
            )
        )

    assert raised.value.status_code == 409
    assert any("passing validation test" in blocker for blocker in raised.value.detail["blockers"])
    assert events.calls == []
    assert db.dispatched == []


def test_dispatch_wave_steps_blocks_live_with_stale_alert_validation(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {"runtime_mode": "live", "approval_policy": "auto_safe"},
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb(
        channels=[
            {
                "channel_id": "chan-warning",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": (datetime.now(UTC) - timedelta(hours=25)).isoformat(),
            }
        ]
    )
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            release_router.dispatch_wave_steps(
                plan,
                preview,
                1,
                "workspace-a",
                current,
                db,
                events,
                run_id="run-a",
            )
        )

    assert raised.value.status_code == 409
    assert any("within 24 hour(s)" in blocker for blocker in raised.value.detail["blockers"])
    assert events.calls == []
    assert db.dispatched == []


def test_dispatch_wave_steps_does_not_trust_user_supplied_safe_pr_ready(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {
            "runtime_mode": "live",
            "approval_policy": "safe_pr",
            "safe_pr_ready": True,
            "safe_pr_url": "https://github.example/org/app-a/pull/7",
        },
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                    "safe_pr_ready": True,
                    "safe_pr_url": "https://github.example/org/app-a/pull/7",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb(
        channels=[
            {
                "channel_id": "chan-a",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            release_router.dispatch_wave_steps(
                plan,
                preview,
                1,
                "workspace-a",
                current,
                db,
                events,
                run_id="run-a",
            )
        )

    assert raised.value.status_code == 409
    assert any("requires a ready Safe PR" in blocker for blocker in raised.value.detail["blockers"])
    assert events.calls == []
    assert db.dispatched == []


def test_dispatch_wave_steps_blocks_live_when_diagnostics_do_not_pass(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {
            "runtime_mode": "live",
            "approval_policy": "auto_safe",
            "require_diagnostics_pass": True,
        },
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "environment": "production",
                    "approval_gate": "auto",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb(
        channels=[
            {
                "channel_id": "chan-a",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            release_router.dispatch_wave_steps(
                plan,
                preview,
                1,
                "workspace-a",
                current,
                db,
                events,
                run_id="run-a",
            )
        )

    assert raised.value.status_code == 409
    assert any(
        "risk.release_step_auto_gate_production" in blocker
        for blocker in raised.value.detail["blockers"]
    )
    assert events.calls == []
    assert db.dispatched == []


def test_dispatch_wave_steps_blocks_live_diagnostics_bypass_without_reason(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {
            "runtime_mode": "live",
            "approval_policy": "auto_safe",
            "require_diagnostics_pass": False,
        },
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb(
        channels=[
            {
                "channel_id": "chan-a",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            release_router.dispatch_wave_steps(
                plan,
                preview,
                1,
                "workspace-a",
                current,
                db,
                events,
                run_id="run-a",
            )
        )

    assert raised.value.status_code == 409
    assert any(
        "diagnostics override reason" in blocker for blocker in raised.value.detail["blockers"]
    )
    assert events.calls == []
    assert db.dispatched == []


def test_dispatch_wave_steps_blocks_live_when_rollback_disabled_without_reason(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {
            "runtime_mode": "live",
            "approval_policy": "auto_safe",
            "rollback_policy": "disabled",
        },
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb(
        channels=[
            {
                "channel_id": "chan-a",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            release_router.dispatch_wave_steps(
                plan,
                preview,
                1,
                "workspace-a",
                current,
                db,
                events,
                run_id="run-a",
            )
        )

    assert raised.value.status_code == 409
    assert any("rollback override reason" in blocker for blocker in raised.value.detail["blockers"])
    assert events.calls == []
    assert db.dispatched == []


def test_dispatch_wave_steps_blocks_production_live_without_change_ticket(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {
            "runtime_mode": "live",
            "approval_policy": "auto_safe",
            "approval_granted": True,
            "release_window_override_reason": "incident commander approved immediate release",
        },
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "environment": "production",
                    "approval_gate": "manual",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                    "health_check_path": "/readyz",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb(
        channels=[
            {
                "channel_id": "chan-a",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            release_router.dispatch_wave_steps(
                plan,
                preview,
                1,
                "workspace-a",
                current,
                db,
                events,
                run_id="run-a",
            )
        )

    assert raised.value.status_code == 409
    assert any("change ticket" in blocker for blocker in raised.value.detail["blockers"])
    assert events.calls == []
    assert db.dispatched == []


def test_dispatch_wave_steps_blocks_production_placeholder_change_ticket(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {
            "runtime_mode": "live",
            "approval_policy": "auto_safe",
            "approval_granted": True,
            "approval_granted_by": "lead@example.com",
            "approval_reason": "approved production release",
            "approval_granted_at": datetime.now(UTC).isoformat(),
            "change_ticket": "CHG-PREFLIGHT",
            "release_window_override_reason": "incident commander approved immediate release",
            "runbook_url": "https://wiki.company.internal/runbooks/storefront-release",
            "post_deploy_verification_url": "https://storefront.company.internal/readyz",
            "release_owner": "storefront-release-team",
            "abort_criteria": "rollback if checkout error rate exceeds 5% for 5 minutes",
        },
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "environment": "production",
                    "approval_gate": "manual",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                    "health_check_path": "/readyz",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb(
        channels=[
            {
                "channel_id": "chan-a",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            release_router.dispatch_wave_steps(
                plan,
                preview,
                1,
                "workspace-a",
                current,
                db,
                events,
                run_id="run-a",
            )
        )

    assert raised.value.status_code == 409
    assert any(
        "must not use placeholder change ticket CHG-PREFLIGHT" in blocker
        for blocker in raised.value.detail["blockers"]
    )
    assert events.calls == []
    assert db.dispatched == []


def test_dispatch_wave_steps_blocks_production_live_without_release_window(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {
            "runtime_mode": "live",
            "approval_policy": "auto_safe",
            "approval_granted": True,
            "change_ticket": "CHG-123",
        },
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "environment": "production",
                    "approval_gate": "manual",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                    "health_check_path": "/readyz",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb(
        channels=[
            {
                "channel_id": "chan-a",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            release_router.dispatch_wave_steps(
                plan,
                preview,
                1,
                "workspace-a",
                current,
                db,
                events,
                run_id="run-a",
            )
        )

    assert raised.value.status_code == 409
    assert any("release_window_start" in blocker for blocker in raised.value.detail["blockers"])
    assert events.calls == []
    assert db.dispatched == []


def test_dispatch_wave_steps_blocks_production_live_during_change_freeze(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    now = datetime.now(UTC)
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {
            "runtime_mode": "live",
            "approval_policy": "auto_safe",
            "approval_granted": True,
            "approval_granted_by": "lead@example.com",
            "approval_reason": "approved production release",
            "approval_granted_at": now.isoformat(),
            "change_ticket": "CHG-123",
            "release_window_start": (now - timedelta(hours=1)).isoformat(),
            "release_window_end": (now + timedelta(hours=1)).isoformat(),
            "change_freeze_start": (now - timedelta(minutes=5)).isoformat(),
            "change_freeze_end": (now + timedelta(minutes=5)).isoformat(),
            "runbook_url": "https://wiki.company.internal/runbooks/storefront-release",
            "release_owner": "storefront-release-team",
            "abort_criteria": "rollback if checkout error rate exceeds 5% for 5 minutes",
        },
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "environment": "production",
                    "approval_gate": "manual",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                    "health_check_path": "/readyz",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb(
        channels=[
            {
                "channel_id": "chan-a",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": now.isoformat(),
            }
        ]
    )
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            release_router.dispatch_wave_steps(
                plan,
                preview,
                1,
                "workspace-a",
                current,
                db,
                events,
                run_id="run-a",
            )
        )

    assert raised.value.status_code == 409
    assert any("change freeze window" in blocker for blocker in raised.value.detail["blockers"])
    assert events.calls == []
    assert db.dispatched == []


def test_dispatch_wave_steps_blocks_production_live_without_approval_evidence(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {
            "runtime_mode": "live",
            "approval_policy": "auto_safe",
            "approval_granted": True,
            "change_ticket": "CHG-123",
            "release_window_override_reason": "incident commander approved immediate release",
        },
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "environment": "production",
                    "approval_gate": "manual",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb(
        channels=[
            {
                "channel_id": "chan-a",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            release_router.dispatch_wave_steps(
                plan,
                preview,
                1,
                "workspace-a",
                current,
                db,
                events,
                run_id="run-a",
            )
        )

    assert raised.value.status_code == 409
    assert any("approval evidence" in blocker for blocker in raised.value.detail["blockers"])
    assert events.calls == []
    assert db.dispatched == []


def test_dispatch_wave_steps_blocks_production_live_without_verification_evidence(
    monkeypatch,
) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {
            "runtime_mode": "live",
            "approval_policy": "auto_safe",
            "approval_granted": True,
            "approval_granted_by": "lead@example.com",
            "approval_reason": "approved production release",
            "approval_granted_at": datetime.now(UTC).isoformat(),
            "change_ticket": "CHG-123",
            "release_window_override_reason": "incident commander approved immediate release",
            "runbook_url": "https://wiki.company.internal/runbooks/storefront-release",
            "release_owner": "storefront-release-team",
            "abort_criteria": "rollback if checkout error rate exceeds 5% for 5 minutes",
        },
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "environment": "production",
                    "approval_gate": "manual",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb(
        channels=[
            {
                "channel_id": "chan-a",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            release_router.dispatch_wave_steps(
                plan,
                preview,
                1,
                "workspace-a",
                current,
                db,
                events,
                run_id="run-a",
            )
        )

    assert raised.value.status_code == 409
    assert any(
        "post_deploy_verification_url" in blocker for blocker in raised.value.detail["blockers"]
    )
    assert events.calls == []
    assert db.dispatched == []


def test_dispatch_wave_steps_blocks_production_live_without_abort_criteria(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {
            "runtime_mode": "live",
            "approval_policy": "auto_safe",
            "approval_granted": True,
            "approval_granted_by": "lead@example.com",
            "approval_reason": "approved production release",
            "approval_granted_at": datetime.now(UTC).isoformat(),
            "change_ticket": "CHG-123",
            "release_window_override_reason": "incident commander approved immediate release",
            "runbook_url": "https://wiki.company.internal/runbooks/storefront-release",
            "release_owner": "storefront-release-team",
        },
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "environment": "production",
                    "approval_gate": "manual",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                    "health_check_path": "/readyz",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb(
        channels=[
            {
                "channel_id": "chan-a",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            release_router.dispatch_wave_steps(
                plan,
                preview,
                1,
                "workspace-a",
                current,
                db,
                events,
                run_id="run-a",
            )
        )

    assert raised.value.status_code == 409
    assert any("rollback_trigger" in blocker for blocker in raised.value.detail["blockers"])
    assert events.calls == []
    assert db.dispatched == []


def test_dispatch_wave_steps_publishes_live_when_backend_gate_allows(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {"runtime_mode": "live", "approval_policy": "auto_safe"},
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb(
        channels=[
            {
                "channel_id": "chan-a",
                "enabled": True,
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))
    monkeypatch.setattr(release_router, "require_cluster_access", lambda *_args, **_kwargs: None)

    accepted = asyncio.run(
        release_router.dispatch_wave_steps(
            plan,
            preview,
            1,
            "workspace-a",
            current,
            db,
            events,
            run_id="run-a",
        )
    )

    assert len(events.calls) == 1
    assert accepted[0]["event_id"] == "evt-live"
    assert accepted[0]["correlation_id"] == "corr-live"
    assert accepted[0]["event"]["subject"] == "git.webhook.received"
    assert db.dispatched[0]["details"]["runtime_mode"] == "live"
    assert db.dispatched[0]["details"]["side_effects"] is True
    guard = db.dispatched[0]["details"]["release_guard"]
    assert guard["runtime_mode"] == "live"
    assert guard["side_effects"] is True
    assert guard["readiness"]["ready"] is True
    assert guard["readiness"]["checked_wave"] == 1
    assert guard["readiness"]["impact"]["applications"] == ["app-a"]
    assert guard["readiness"]["selected_wave_steps"][0]["application_id"] == "app-a"
    assert guard["readiness"]["warnings"] == []
    assert guard["diagnostics"] == {
        "required": True,
        "bypassed": False,
        "override_reason": None,
        "blocking_count": 0,
        "blocking_codes": [],
    }
    assert guard["alerts"]["validated_count"] == 1
    assert guard["alerts"]["validated_channels"][0]["channel_id"] == "chan-a"
    assert guard["rollback"] == {
        "policy": "manual",
        "disabled": False,
        "override_reason": None,
    }
    assert guard["change_management"] == {
        "change_ticket_present": False,
        "production_targets": [],
        "production_override_reason": None,
    }


def test_dispatch_wave_steps_records_diagnostics_override_reason(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {
            "runtime_mode": "live",
            "approval_policy": "auto_safe",
            "require_diagnostics_pass": False,
            "diagnostics_override_reason": "approved emergency release",
            "rollback_policy": "disabled",
            "rollback_override_reason": "external rollback owner assigned",
        },
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb(
        channels=[
            {
                "channel_id": "chan-a",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))
    monkeypatch.setattr(release_router, "require_cluster_access", lambda *_args, **_kwargs: None)

    accepted = asyncio.run(
        release_router.dispatch_wave_steps(
            plan,
            preview,
            1,
            "workspace-a",
            current,
            db,
            events,
            run_id="run-a",
        )
    )

    assert accepted[0]["event_id"] == "evt-live"
    guard = db.dispatched[0]["details"]["release_guard"]
    assert guard["diagnostics"]["required"] is False
    assert guard["diagnostics"]["bypassed"] is True
    assert guard["diagnostics"]["override_reason"] == "approved emergency release"
    assert guard["rollback"] == {
        "policy": "disabled",
        "disabled": True,
        "override_reason": "external rollback owner assigned",
    }


def test_dispatch_wave_steps_records_production_change_override(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {
            "runtime_mode": "live",
            "approval_policy": "auto_safe",
            "approval_granted": True,
            "approval_granted_by": "lead@example.com",
            "approval_reason": "approved production release",
            "approval_granted_at": datetime.now(UTC).isoformat(),
            "production_change_override_reason": "emergency production fix approved",
            "release_window_override_reason": "incident commander approved immediate release",
            "change_freeze_start": (datetime.now(UTC) - timedelta(minutes=5)).isoformat(),
            "change_freeze_end": (datetime.now(UTC) + timedelta(minutes=5)).isoformat(),
            "change_freeze_override_reason": "incident commander approved emergency hotfix",
            "runbook_url": "https://wiki.company.internal/runbooks/storefront-release",
            "runbook_override_reason": "legacy operator note should not bypass production",
            "release_owner": "storefront-release-team",
            "post_deploy_verification_url": "https://storefront.company.internal/readyz",
            "verification_override_reason": "legacy monitor note should not bypass production",
            "abort_criteria": "rollback if checkout error rate exceeds 5% for 5 minutes",
        },
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "environment": "production",
                    "approval_gate": "manual",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb(
        channels=[
            {
                "channel_id": "chan-a",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))
    monkeypatch.setattr(release_router, "require_cluster_access", lambda *_args, **_kwargs: None)

    accepted = asyncio.run(
        release_router.dispatch_wave_steps(
            plan,
            preview,
            1,
            "workspace-a",
            current,
            db,
            events,
            run_id="run-a",
        )
    )

    assert accepted[0]["event_id"] == "evt-live"
    guard = db.dispatched[0]["details"]["release_guard"]
    assert guard["change_management"] == {
        "change_ticket_present": False,
        "production_targets": ["app-a"],
        "production_override_reason": "emergency production fix approved",
    }
    assert guard["release_window"]["production_targets"] == ["app-a"]
    assert (
        guard["release_window"]["override_reason"]
        == "incident commander approved immediate release"
    )
    assert guard["change_freeze"]["production_targets"] == ["app-a"]
    assert guard["change_freeze"]["active"] is True
    assert (
        guard["change_freeze"]["override_reason"] == "incident commander approved emergency hotfix"
    )
    assert guard["readiness"]["warnings"] == [
        "Production change ticket gate is bypassed with an operator reason.",
        "Production release window is bypassed with an operator reason.",
        "Production change freeze is bypassed with an operator reason.",
    ]
    assert [action["check_id"] for action in guard["readiness"]["next_actions"]] == [
        "change.ticket",
        "release.window",
        "change.freeze",
    ]
    assert guard["runbook"] == {
        "url": "https://wiki.company.internal/runbooks/storefront-release",
        "url_present": True,
        "override_reason": None,
        "production_targets": ["app-a"],
    }
    assert guard["owner"] == {
        "release_owner": "storefront-release-team",
        "oncall_contact": None,
        "contact_present": True,
        "production_targets": ["app-a"],
    }
    assert guard["verification"] == {
        "evidence_present": True,
        "override_reason": None,
        "production_targets": ["app-a"],
        "health_check_paths": [],
        "verification_urls": ["https://storefront.company.internal/readyz"],
    }
    assert guard["verification_jobs"] == {
        "scheduled": True,
        "job_count": 1,
        "jobs": [
            {
                "application_id": "app-a",
                "evidence_key": "plan-a:wave-1:app-a:post-deploy-verification",
                "job_id": guard["verification_jobs"]["jobs"][0]["job_id"],
                "kind": "http_probe",
                "name": "checkout",
                "queued_at": guard["verification_jobs"]["jobs"][0]["queued_at"],
                "status": "pending",
                "target": {"url": "https://storefront.company.internal/readyz"},
                "timeout_minutes": 15,
            }
        ],
    }
    assert guard["abort_criteria"] == {
        "criteria": ["rollback if checkout error rate exceeds 5% for 5 minutes"],
        "override_reason": None,
        "production_targets": ["app-a"],
    }


def test_dispatch_wave_steps_records_active_production_release_window(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-a")
    start = datetime.now(UTC) - timedelta(hours=1)
    end = datetime.now(UTC) + timedelta(hours=1)
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {
            "runtime_mode": "live",
            "approval_policy": "auto_safe",
            "approval_granted": True,
            "approval_granted_by": "lead@example.com",
            "approval_reason": "approved production release",
            "approval_granted_at": datetime.now(UTC).isoformat(),
            "change_ticket": "CHG-123",
            "release_window_start": start.isoformat(),
            "release_window_end": end.isoformat(),
            "runbook_url": "https://wiki.company.internal/runbooks/storefront-release",
            "post_deploy_verification_url": "https://storefront.company.internal/readyz",
            "release_owner": "storefront-release-team",
            "abort_criteria": "rollback if checkout error rate exceeds 5% for 5 minutes",
        },
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/app-a",
                    "branch": "main",
                    "environment": "production",
                    "approval_gate": "manual",
                    "commit_sha": "abc123",
                    "image": "ghcr.io/example/app-a:v2",
                    "manifest_path": "deploy/app.yaml",
                    "health_check_path": "/readyz",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)
    db = ReleaseDispatchDb(
        channels=[
            {
                "channel_id": "chan-a",
                "enabled": True,
                "min_severity": "warning",
                "last_test_status": "passed",
                "last_tested_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    events = AcceptingEventGateway()
    current = SimpleNamespace(user_id="user-a", roles=("operator",))
    monkeypatch.setattr(release_router, "require_cluster_access", lambda *_args, **_kwargs: None)

    accepted = asyncio.run(
        release_router.dispatch_wave_steps(
            plan,
            preview,
            1,
            "workspace-a",
            current,
            db,
            events,
            run_id="run-a",
        )
    )

    assert accepted[0]["event_id"] == "evt-live"
    guard = db.dispatched[0]["details"]["release_guard"]
    assert guard["readiness"]["impact"]["production_target_count"] == 1
    assert guard["readiness"]["impact"]["production_targets"] == ["checkout"]
    assert guard["readiness"]["selected_wave_steps"][0]["environment"] == "production"
    assert guard["change_management"]["change_ticket_present"] is True
    assert guard["verification"]["health_check_paths"] == ["/readyz"]
    assert guard["verification"]["evidence_present"] is True
    assert guard["verification_jobs"]["scheduled"] is True
    assert guard["verification_jobs"]["job_count"] == 2
    assert guard["verification_jobs"]["jobs"][0]["kind"] == "kubernetes_health_check"
    assert guard["verification_jobs"]["jobs"][0]["status"] == "pending"
    assert guard["verification_jobs"]["jobs"][0]["timeout_minutes"] == 15
    assert (
        release_router.parse_release_window_time(guard["verification_jobs"]["jobs"][0]["queued_at"])
        is not None
    )
    assert guard["verification_jobs"]["jobs"][0]["target"] == {
        "cluster_id": "",
        "namespace": "",
        "service_name": "app-a",
        "path": "/readyz",
    }
    assert guard["verification_jobs"]["jobs"][1]["kind"] == "http_probe"
    assert guard["verification_jobs"]["jobs"][1]["target"] == {
        "url": "https://storefront.company.internal/readyz",
    }
    assert guard["abort_criteria"] == {
        "criteria": ["rollback if checkout error rate exceeds 5% for 5 minutes"],
        "override_reason": None,
        "production_targets": ["app-a"],
    }
    assert guard["release_window"]["production_targets"] == ["app-a"]
    assert guard["release_window"]["start"].endswith("Z")
    assert guard["release_window"]["end"].endswith("Z")


def test_release_run_steps_capture_wave_health_and_github_metadata() -> None:
    plan = {
        "plan_id": "plan-a",
        "name": "storefront",
        "settings": {"rollback_policy": "safe_pr", "release_tag": "v2.0.0"},
        "steps": [
            {
                "step_id": "step-a",
                "application_id": "app-a",
                "name": "checkout",
                "config": {
                    "repo_ref": "org/checkout",
                    "branch": "main",
                    "commit_sha": "abc123",
                    "health_check_path": "/readyz",
                    "strategy": "canary",
                    "environment": "production",
                },
            }
        ],
    }
    preview = build_release_plan_preview(plan)

    steps = release_run_steps_from_plan("workspace-a", "run-a", plan, preview)
    github = github_release_metadata(plan)

    assert steps[0]["wave"] == 1
    assert steps[0]["status"] == "pending"
    assert steps[0]["health"]["path"] == "/readyz"
    assert steps[0]["rollback"]["safe_pr_ready"] is True
    assert steps[0]["details"]["runtime_mode"] == "demo"
    assert steps[0]["details"]["provider_mode"] == "dry_run"
    assert steps[0]["details"]["side_effects"] is False
    assert (
        steps[0]["details"]["github"]["commit_url"]
        == "https://github.com/org/checkout/commit/abc123"
    )
    assert github["release_url"] == "https://github.com/org/checkout/releases/tag/v2.0.0"


def test_release_plan_ids_are_stable_and_workspace_scoped() -> None:
    payload = {"workspace_id": "workspace-a", "name": "storefront"}
    assert derive_release_plan_id(payload) == derive_release_plan_id(dict(payload))
    assert derive_release_plan_id(payload) != derive_release_plan_id(
        {"workspace_id": "workspace-b", "name": "storefront"}
    )
    assert derive_release_plan_id({**payload, "plan_id": "plan-explicit"}) == "plan-explicit"


def test_release_step_values_normalize_dependency_and_config_fields() -> None:
    values = release_step_values(
        "workspace-a",
        "plan-a",
        {
            "application_id": "app-a",
            "depends_on": ["app-base", 123],
            "config": {"branch": "main"},
        },
        2,
    )

    assert values["step_id"].startswith("release-step-")
    assert values["position"] == 2
    assert values["depends_on"] == ["app-base", "123"]
    assert values["config"] == {"branch": "main"}

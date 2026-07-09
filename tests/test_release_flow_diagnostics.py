"""Unit coverage for release-flow plans and editor diagnostics."""

from __future__ import annotations

import asyncio
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
    release_run_steps_from_plan,
    release_step_values,
)
from domains.release_flow.router import dispatch_request_for_step, steps_for_wave
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.responses import DiagnosticItem
from packages.contracts.gitops import DEFAULT_WORKFLOW_RUN_ID


def codes(items: list[DiagnosticItem]) -> set[str]:
    return {item.code for item in items}


def test_release_run_summary_route_precedes_dynamic_run_route() -> None:
    paths = [
        route.path
        for route in release_router.router.routes
        if "GET" in getattr(route, "methods", set())
    ]

    assert paths.index(gateway_routes.RELEASE_RUN_SUMMARY_PATH) < paths.index(
        gateway_routes.RELEASE_RUN_PATH
    )


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

    current = SimpleNamespace(workspace_id="workspace-a", user_id="operator", roles=("release_operator",))
    response = asyncio.run(
        release_router.advance_release_run("release-run-1", current=current, db=db, events=object())
    )

    assert seen == [("workspace-a", "checkout")]
    assert response.run["run_id"] == "release-run-1"
    assert db.updated


def test_rollback_release_run_checks_access_before_mutating(monkeypatch) -> None:
    db = ReleaseRunActionDb()

    def deny_manage(*_args: object, **_kwargs: object) -> None:
        raise HTTPException(status_code=403, detail="denied")

    monkeypatch.setattr(release_router, "require_plan_application_manage_access", deny_manage)

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


def test_release_run_summary_counts_derived_statuses() -> None:
    summary = release_router.release_run_summary_from_runs(
        [
            {"run_id": "run-1", "plan_id": "plan-a", "status": "running", "health": {"status": "progressing"}},
            {
                "run_id": "run-2",
                "plan_id": "plan-a",
                "status": "running",
                "derived_status": "failed",
                "settings": {"runtime_mode": "live"},
                "health": {"status": "unhealthy"},
            },
            {
                "run_id": "run-3",
                "plan_id": "plan-b",
                "status": "succeeded",
                "steps": [{"details": {"side_effects": True}}],
            },
            {"run_id": "run-4", "plan_id": "plan-c", "status": "rollback_requested"},
            {"run_id": "run-5", "plan_id": "plan-c", "status": "waiting_for_approval"},
        ]
    )

    assert summary["total_runs"] == 5
    assert summary["status_breakdown"] == {
        "running": 1,
        "failed": 1,
        "succeeded": 1,
        "rollback_requested": 1,
        "waiting_for_approval": 1,
    }
    assert summary["plan_breakdown"] == {"plan-a": 2, "plan-b": 1, "plan-c": 2}
    assert summary["active_runs"] == 2
    assert summary["attention_required_runs"] == 3
    assert summary["failed_runs"] == 1
    assert summary["rollback_requested_runs"] == 1
    assert summary["waiting_for_approval_runs"] == 1
    assert summary["live_runs"] == 2
    assert summary["unhealthy_runs"] == 1
    assert summary["last_run_status"] == "running"
    assert summary["recent_runs"][1] == {
        "run_id": "run-2",
        "plan_id": "plan-a",
        "status": "failed",
    }


class ReleaseDispatchDb:
    def __init__(self) -> None:
        self.dispatched: list[dict[str, object]] = []

    def get_application(self, _workspace_id: str, _application_id: str) -> dict[str, object]:
        return {
            "repo_ref": "org/app-a",
            "branch": "main",
            "cluster_id": "target",
            "manifest_path": "deploy/app.yaml",
        }

    def mark_release_run_step_dispatched(self, *args: object, **kwargs: object) -> None:
        self.dispatched.append({"args": args, **kwargs})


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
    def __init__(self) -> None:
        self.requested_rollback = False
        self.updated: list[dict[str, object]] = []

    def get_release_run(self, _workspace_id: str, _run_id: str) -> dict[str, object]:
        return {
            "run_id": "release-run-1",
            "status": "running",
            "current_wave": 1,
            "total_waves": 1,
            "settings": {},
            "steps": [
                {
                    "application_id": "checkout",
                    "wave": 1,
                    "status": "succeeded",
                    "details": {},
                }
            ],
        }

    def update_release_run_status(self, *args: object, **kwargs: object) -> dict[str, object]:
        self.updated.append({"args": args, **kwargs})
        return self.get_release_run("workspace-a", "release-run-1")

    def request_release_run_rollback(self, *args: object, **kwargs: object) -> dict[str, object]:
        self.requested_rollback = True
        run = self.get_release_run("workspace-a", "release-run-1")
        run["status"] = "rollback_requested"
        return run


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

    assert release_execution_blockers(approved, build_release_plan_preview(approved), 1, workspace_id="workspace-a") == []


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
    assert release_execution_blockers(ready, build_release_plan_preview(ready), 1, workspace_id="workspace-a") == []


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
    assert diagnostics[0].path is None or "steps[0]" in "".join(item.path or "" for item in diagnostics)


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
        {"wave": 2, "step_ids": ["preview-step-1", "preview-step-2"], "applications": ["app-b", "app-c"]},
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
    db = ReleaseDispatchDb()
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
    assert steps[0]["details"]["github"]["commit_url"] == "https://github.com/org/checkout/commit/abc123"
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

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "release_flow_smoke.py"


def load_smoke_module() -> Any:
    spec = importlib.util.spec_from_file_location("release_flow_smoke", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["release_flow_smoke"] = module
    spec.loader.exec_module(module)
    return module


class FakeClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, object] | None]] = []
        self.release_run_status = "running"

    def request(
        self,
        method: str,
        path: str,
        payload: dict[str, object] | None = None,
        *,
        expected: tuple[int, ...] = (200,),
    ) -> dict[str, object]:
        self.calls.append((method, path, payload))
        if path == "/healthz":
            return {"status": "ok"}
        if path == "/readyz":
            return {"status": "ready"}
        if path == "/auth/session":
            return {"authenticated": True}
        if path == "/applications":
            return {
                "applications": [
                    {
                        "application_id": "checkout",
                        "name": "Checkout",
                        "repo_ref": "org/checkout",
                        "branch": "main",
                        "manifest_path": "deploy/app.yaml",
                        "cluster_id": "target",
                    },
                    {
                        "application_id": "cart",
                        "name": "Cart",
                        "repo_ref": "org/cart",
                        "branch": "main",
                        "manifest_path": "deploy/cart.yaml",
                        "cluster_id": "target",
                    },
                ]
            }
        if path == "/release-plans":
            return {"plans": []}
        if path == "/release-runs/summary":
            return {
                "total_runs": 0,
                "status_breakdown": {},
                "plan_breakdown": {},
                "active_runs": 0,
                "attention_required_runs": 0,
                "failed_runs": 0,
                "rollback_requested_runs": 0,
                "waiting_for_approval_runs": 0,
                "live_runs": 0,
                "unhealthy_runs": 0,
                "last_run_status": None,
                "recent_runs": [],
            }
        if path == "/release-plans/preview":
            return {"preview": {"executable": True, "summary": "2 steps can run"}}
        if path == "/release-readiness":
            return {
                "ready": True,
                "blockers": [],
                "checks": [{"check_id": "live.dispatch_gate", "status": "passed"}],
            }
        if path == "/alert-channels":
            return {
                "channels": [
                    {
                        "channel_id": "chan-release-warning",
                        "name": "Release warning",
                        "kind": "webhook",
                        "url": "https://hooks.example/release",
                        "min_severity": "warning",
                        "enabled": True,
                    },
                    {
                        "channel_id": "chan-critical",
                        "name": "Critical only",
                        "kind": "webhook",
                        "url": "https://hooks.example/critical",
                        "min_severity": "critical",
                        "enabled": True,
                    },
                ]
            }
        if path == "/alert-channels/test":
            return {
                "valid": True,
                "delivered": True,
                "detail": "test alert delivered",
            }
        if path == "/release-plans/start":
            self.release_run_status = "running"
            return {
                "run": {
                    "run_id": "release-run-smoke",
                    "status": self.release_run_status,
                    "steps": [{"details": {"side_effects": False}}],
                }
            }
        if path == "/release-runs/release-run-smoke/pause":
            self.release_run_status = "paused"
            return {"run": {"run_id": "release-run-smoke", "status": self.release_run_status}}
        if path == "/release-runs/release-run-smoke/notify":
            return {
                "accepted": True,
                "event": {"event_id": "alert-1", "subject": "alert.requested"},
                "run": {"run_id": "release-run-smoke", "status": self.release_run_status},
            }
        if path == "/release-runs/release-run-smoke/resume":
            self.release_run_status = "running"
            return {"run": {"run_id": "release-run-smoke", "status": self.release_run_status}}
        if path == "/release-runs/release-run-smoke/cancel":
            self.release_run_status = "cancelled"
            return {"run": {"run_id": "release-run-smoke", "status": self.release_run_status}}
        if path == "/release-runs/release-run-smoke":
            return {"run": {"run_id": "release-run-smoke", "status": self.release_run_status}}
        return {}


def test_build_demo_plan_is_demo_only() -> None:
    smoke = load_smoke_module()

    plan = smoke.build_demo_plan(
        [
            {"application_id": "checkout", "name": "Checkout", "branch": "main"},
            {"application_id": "cart", "name": "Cart", "branch": "main"},
        ]
    )

    assert plan["settings"]["runtime_mode"] == "demo"
    assert plan["settings"]["provider_mode"] == "dry_run"
    assert plan["steps"][1]["depends_on"] == ["checkout"]
    assert plan["steps"][0]["config"]["commit_sha"] == "release-flow-smoke"


def test_smoke_default_does_not_start_release_run() -> None:
    smoke = load_smoke_module()
    client = FakeClient()

    results = smoke.run_smoke(client, "ops@example.com", "password", demo_run=False)

    assert all(result.ok for result in results)
    assert ("POST", "/release-plans/start", None) not in client.calls
    assert [path for _method, path, _payload in client.calls].count("/release-plans/preview") == 1
    assert "/alert-channels/test" not in [path for _method, path, _payload in client.calls]


def test_smoke_demo_run_starts_and_fetches_tracked_run() -> None:
    smoke = load_smoke_module()
    client = FakeClient()

    results = smoke.run_smoke(client, "ops@example.com", "password", demo_run=True)

    assert all(result.ok for result in results)
    paths = [path for _method, path, _payload in client.calls]
    assert "/release-plans/start" in paths
    assert "/release-runs/release-run-smoke" in paths


def test_smoke_ops_rehearsal_exercises_safe_operator_actions() -> None:
    smoke = load_smoke_module()
    client = FakeClient()

    results = smoke.run_smoke(client, "ops@example.com", "password", demo_run=False, ops_rehearsal=True)

    assert all(result.ok for result in results)
    paths = [path for _method, path, _payload in client.calls]
    assert "/release-plans/start" in paths
    assert paths.index("/release-runs/release-run-smoke/pause") < paths.index("/release-runs/release-run-smoke/resume")
    assert "/release-runs/release-run-smoke/notify" in paths
    assert paths[-1] == "/release-runs/release-run-smoke"
    assert client.release_run_status == "cancelled"


def test_smoke_live_preflight_checks_readiness_without_starting_run() -> None:
    smoke = load_smoke_module()
    client = FakeClient()
    args = smoke.parse_args(["--live-preflight"])

    results = smoke.run_smoke(
        client,
        "ops@example.com",
        "password",
        demo_run=False,
        live_preflight=True,
        args=args,
    )

    assert all(result.ok for result in results)
    paths = [path for _method, path, _payload in client.calls]
    assert "/release-readiness" in paths
    assert "/release-plans/start" not in paths
    readiness_payload = next(
        payload for _method, path, payload in client.calls if path == "/release-readiness"
    )
    assert readiness_payload is not None
    assert readiness_payload["settings"]["runtime_mode"] == "live"
    assert readiness_payload["settings"]["provider_mode"] == "live"
    assert readiness_payload["settings"]["approval_granted_by"] == "release-operator"
    assert readiness_payload["settings"]["approval_reason"] == "live preflight approval evidence"
    assert readiness_payload["settings"]["approval_granted_at"].endswith("Z")
    assert readiness_payload["settings"]["change_ticket"] == "CHG-PREFLIGHT"
    assert readiness_payload["settings"]["release_window_start"].endswith("Z")
    assert readiness_payload["settings"]["release_window_end"].endswith("Z")
    assert readiness_payload["settings"]["runbook_url"].startswith("https://")
    assert readiness_payload["steps"][0]["config"]["environment"] == "production"
    assert readiness_payload["steps"][0]["config"]["namespace"] == "production"
    assert readiness_payload["steps"][0]["config"]["approval_gate"] == "manual"


def test_smoke_alert_preflight_tests_warning_capable_channel() -> None:
    smoke = load_smoke_module()
    client = FakeClient()
    args = smoke.parse_args(["--alert-preflight"])

    results = smoke.run_smoke(
        client,
        "ops@example.com",
        "password",
        demo_run=False,
        alert_preflight=True,
        args=args,
    )

    assert all(result.ok for result in results)
    paths = [path for _method, path, _payload in client.calls]
    assert "/alert-channels" in paths
    assert paths.count("/alert-channels/test") == 1
    payload = next(payload for _method, path, payload in client.calls if path == "/alert-channels/test")
    assert payload is not None
    assert payload["channel_id"] == "chan-release-warning"
    assert payload["severity"] == "warning"
    assert payload["message"] == "release-flow alert channel preflight"

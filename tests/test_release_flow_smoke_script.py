from __future__ import annotations

import importlib.util
import json
import sys
import xml.etree.ElementTree as ET
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
        self.verification_failed_runs = 0
        self.verification_pending_timeout_runs = 0
        self.policy_override_runs = 0
        self.policy_override_breakdown: dict[str, int] = {}
        self.active_change_freeze_runs = 0
        self.change_freeze_override_runs = 0
        self.attention_required_runs = 0
        self.stale_runs = 0
        self.failed_runs = 0
        self.rollback_requested_runs = 0
        self.waiting_for_approval_runs = 0
        self.unhealthy_runs = 0

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
                "attention_required_runs": self.attention_required_runs,
                "failed_runs": self.failed_runs,
                "rollback_requested_runs": self.rollback_requested_runs,
                "waiting_for_approval_runs": self.waiting_for_approval_runs,
                "live_runs": 0,
                "unhealthy_runs": self.unhealthy_runs,
                "stale_runs": self.stale_runs,
                "verification_failed_runs": self.verification_failed_runs,
                "verification_pending_timeout_runs": self.verification_pending_timeout_runs,
                "policy_override_runs": self.policy_override_runs,
                "policy_override_breakdown": self.policy_override_breakdown,
                "active_change_freeze_runs": self.active_change_freeze_runs,
                "change_freeze_override_runs": self.change_freeze_override_runs,
                "last_run_status": None,
                "recent_runs": [],
            }
        if path.startswith("/release-runs?"):
            if "verification_failed_only=true" in path:
                return {"runs": [{"run_id": "run-verification-failed", "status": "running"}]}
            if "verification_pending_timeout_only=true" in path:
                return {"runs": [{"run_id": "run-verification-timeout", "status": "running"}]}
            if "policy_override_only=true" in path:
                return {"runs": [{"run_id": "run-policy-override", "status": "running"}]}
            if "active_change_freeze_only=true" in path:
                return {"runs": [{"run_id": "run-active-freeze", "status": "running"}]}
            if "change_freeze_override_only=true" in path:
                return {"runs": [{"run_id": "run-freeze-override", "status": "running"}]}
            if "attention_only=true" in path:
                return {"runs": [{"run_id": "run-needs-attention", "status": "failed"}]}
            if "stale_only=true" in path:
                return {"runs": [{"run_id": "run-stale", "status": "running"}]}
            return {"runs": []}
        if path == "/release-plans/preview":
            return {"preview": {"executable": True, "summary": "2 steps can run"}}
        if path == "/release-plans/render-manifest":
            assert payload
            assert isinstance(payload.get("plan"), dict)
            assert payload.get("step_index") == 0
            return {
                "manifest": "apiVersion: apps/v1\nkind: Deployment\n",
                "files": [
                    {
                        "path": "deploy/app.yaml",
                        "content": "apiVersion: apps/v1\nkind: Deployment\n",
                        "action": "upsert",
                        "description": "Generated manifest",
                    }
                ],
                "resources": [
                    {
                        "api_version": "apps/v1",
                        "kind": "Deployment",
                        "namespace": "sandbox",
                        "name": "checkout",
                    }
                ],
                "resource_count": 1,
                "diagnostics": [],
                "warnings": [],
                "summary": "Generated 1 Kubernetes resource(s).",
            }
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


class FakeHttpResponse:
    def __init__(self, status: int, body: str) -> None:
        self.status = status
        self.body = body

    def __enter__(self) -> FakeHttpResponse:
        return self

    def __exit__(self, _exc_type: object, _exc: object, _traceback: object) -> None:
        return None

    def read(self) -> bytes:
        return self.body.encode()


class FakeHttpErrorBody:
    def __init__(self, body: str) -> None:
        self.body = body

    def read(self) -> bytes:
        return self.body.encode()

    def close(self) -> None:
        return None


class SequencedOpener:
    def __init__(self, responses: list[object]) -> None:
        self.responses = responses
        self.calls = 0

    def open(self, _request: object, timeout: float) -> object:
        assert timeout > 0
        self.calls += 1
        response = self.responses.pop(0)
        if isinstance(response, BaseException):
            raise response
        return response


def http_error(smoke: Any, status: int, body: str = '{"error":"busy"}') -> Exception:
    return smoke.urllib.error.HTTPError(
        "https://example.com/api/healthz",
        status,
        "busy",
        {},
        FakeHttpErrorBody(body),
    )


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


def test_api_client_retries_safe_get_transient_http_errors() -> None:
    smoke = load_smoke_module()
    client = smoke.ApiClient("https://example.com/api", retry_attempts=2, retry_delay_seconds=0)
    opener = SequencedOpener(
        [
            http_error(smoke, 503),
            FakeHttpResponse(200, '{"status":"ok"}'),
        ]
    )
    client.opener = opener

    assert client.request("GET", "/healthz") == {"status": "ok"}
    assert opener.calls == 2


def test_api_client_does_not_retry_side_effect_post_errors() -> None:
    smoke = load_smoke_module()
    client = smoke.ApiClient("https://example.com/api", retry_attempts=3, retry_delay_seconds=0)
    opener = SequencedOpener(
        [
            http_error(smoke, 503),
            FakeHttpResponse(200, '{"run":{"run_id":"duplicate-risk"}}'),
        ]
    )
    client.opener = opener

    try:
        client.request("POST", "/release-plans/start", {"name": "release"})
    except smoke.ApiError as exc:
        assert exc.status == 503
    else:
        raise AssertionError("POST release start must not be retried")
    assert opener.calls == 1


def test_smoke_report_writer_persists_json_artifact(tmp_path: Path) -> None:
    smoke = load_smoke_module()
    report_path = tmp_path / "artifacts" / "release-smoke.json"
    payload = smoke.smoke_report_payload(
        True,
        "https://example.com/api",
        [smoke.SmokeResult("healthz", True, "ok")],
    )

    smoke.write_json_report(str(report_path), payload)

    assert json.loads(report_path.read_text(encoding="utf-8")) == {
        "ok": True,
        "api_base_url": "https://example.com/api",
        "checks": [{"name": "healthz", "ok": True, "detail": "ok"}],
    }


def test_smoke_report_payload_redacts_sensitive_details() -> None:
    smoke = load_smoke_module()

    payload = smoke.smoke_report_payload(
        False,
        "https://example.com/api",
        [
            smoke.SmokeResult(
                "auth.session",
                False,
                'password="raw-password", token=raw-token, Authorization: Bearer raw-bearer',
            )
        ],
    )

    detail = payload["checks"][0]["detail"]
    assert "raw-password" not in detail
    assert "raw-token" not in detail
    assert "raw-bearer" not in detail
    assert detail.count("<redacted>") == 3


def test_smoke_junit_writer_persists_ci_report(tmp_path: Path) -> None:
    smoke = load_smoke_module()
    junit_path = tmp_path / "artifacts" / "release-smoke.xml"

    smoke.write_junit_report(
        str(junit_path),
        [
            smoke.SmokeResult("healthz", True, "ok"),
            smoke.SmokeResult(
                "release-runs.policy-override-preflight", False, "run-policy-override"
            ),
        ],
    )

    suite = ET.parse(junit_path).getroot()
    assert suite.tag == "testsuite"
    assert suite.attrib["tests"] == "2"
    assert suite.attrib["failures"] == "1"
    failures = suite.findall(".//failure")
    assert len(failures) == 1
    assert failures[0].attrib["message"] == "run-policy-override"


def test_smoke_junit_writer_redacts_sensitive_failure_details(tmp_path: Path) -> None:
    smoke = load_smoke_module()
    junit_path = tmp_path / "artifacts" / "release-smoke.xml"

    smoke.write_junit_report(
        str(junit_path),
        [smoke.SmokeResult("auth.session", False, "secret=raw-secret")],
        error='{"api_key":"raw-api-key"}',
    )

    body = junit_path.read_text(encoding="utf-8")
    assert "raw-secret" not in body
    assert "raw-api-key" not in body
    assert "&lt;redacted&gt;" in body


def test_smoke_markdown_writer_persists_handoff_report(tmp_path: Path) -> None:
    smoke = load_smoke_module()
    markdown_path = tmp_path / "artifacts" / "release-smoke.md"

    smoke.write_markdown_report(
        str(markdown_path),
        ok=False,
        api_base_url="https://example.com/api",
        results=[
            smoke.SmokeResult("healthz", True, "ok"),
            smoke.SmokeResult(
                "release-runs.policy-override-preflight", False, "run|policy\nreview"
            ),
        ],
    )

    body = markdown_path.read_text(encoding="utf-8")
    assert "# Release Flow Smoke Report" in body
    assert "- Result: failed" in body
    assert "| `release-runs.policy-override-preflight` | fail | run\\|policy<br>review |" in body


def test_smoke_markdown_writer_redacts_sensitive_values(tmp_path: Path) -> None:
    smoke = load_smoke_module()
    markdown_path = tmp_path / "artifacts" / "release-smoke.md"

    smoke.write_markdown_report(
        str(markdown_path),
        ok=False,
        api_base_url="https://example.com/api",
        results=[smoke.SmokeResult("auth.session", False, "set-cookie=session-token")],
        error="private_key=raw-private-key",
    )

    body = markdown_path.read_text(encoding="utf-8")
    assert "session-token" not in body
    assert "raw-private-key" not in body
    assert "<redacted>" in body


def test_smoke_github_step_summary_appends_markdown(tmp_path: Path, monkeypatch: Any) -> None:
    smoke = load_smoke_module()
    summary_path = tmp_path / "github-step-summary.md"
    summary_path.write_text("## Existing summary\n\n", encoding="utf-8")
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary_path))

    smoke.append_github_step_summary(
        True,
        ok=True,
        api_base_url="https://example.com/api",
        results=[smoke.SmokeResult("healthz", True, "ok")],
    )

    body = summary_path.read_text(encoding="utf-8")
    assert body.startswith("## Existing summary")
    assert "# Release Flow Smoke Report" in body
    assert "- Result: passed" in body
    assert "| `healthz` | pass | ok |" in body


def test_smoke_github_output_appends_machine_readable_values(
    tmp_path: Path, monkeypatch: Any
) -> None:
    smoke = load_smoke_module()
    output_path = tmp_path / "github-output.txt"
    monkeypatch.setenv("GITHUB_OUTPUT", str(output_path))

    smoke.append_github_output(
        True,
        ok=False,
        api_base_url="https://example.com/api",
        results=[
            smoke.SmokeResult("healthz", True, "ok"),
            smoke.SmokeResult("release-runs.policy-override-preflight", False, "token=raw-token"),
        ],
        error="password=raw-password",
    )

    body = output_path.read_text(encoding="utf-8")
    assert "release_smoke_ok=false" in body
    assert "release_smoke_failed_count=2" in body
    assert "release_smoke_failed_checks=release-runs.policy-override-preflight" in body
    assert "release_smoke_error=password=<redacted>" in body
    assert "raw-token" not in body
    assert "raw-password" not in body


def test_smoke_github_annotations_emit_redacted_errors(capsys: Any) -> None:
    smoke = load_smoke_module()

    smoke.emit_github_annotations(
        True,
        results=[
            smoke.SmokeResult("healthz", True, "ok"),
            smoke.SmokeResult(
                "release-runs.policy-override-preflight", False, "token=raw-token\nreview"
            ),
        ],
        error="password=raw-password",
    )

    captured = capsys.readouterr()
    assert (
        "::error title=Release smoke failed%3A release-runs.policy-override-preflight::"
        in captured.err
    )
    assert "::error title=Release smoke error::" in captured.err
    assert "token=<redacted>%0Areview" in captured.err
    assert "password=<redacted>" in captured.err
    assert "raw-token" not in captured.err
    assert "raw-password" not in captured.err


def test_smoke_ci_defaults_enable_standard_artifacts_and_github_integrations(
    tmp_path: Path, monkeypatch: Any
) -> None:
    smoke = load_smoke_module()
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(tmp_path / "summary.md"))
    monkeypatch.setenv("GITHUB_OUTPUT", str(tmp_path / "output.txt"))
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    artifact_dir = tmp_path / "release-artifacts"
    args = smoke.parse_args(["--ci", "--ci-artifacts-dir", str(artifact_dir)])

    smoke.apply_ci_defaults(args)

    assert args.report_path == str(artifact_dir / "release-flow-smoke.json")
    assert args.junit_path == str(artifact_dir / "release-flow-smoke.junit.xml")
    assert args.markdown_path == str(artifact_dir / "release-flow-smoke.md")
    assert args.github_step_summary is True
    assert args.github_output is True
    assert args.github_annotations is True


def test_smoke_ci_defaults_preserve_explicit_artifact_paths(tmp_path: Path) -> None:
    smoke = load_smoke_module()
    explicit_report = tmp_path / "custom.json"
    args = smoke.parse_args(
        [
            "--ci",
            "--ci-artifacts-dir",
            str(tmp_path / "release-artifacts"),
            "--report-path",
            str(explicit_report),
        ]
    )

    smoke.apply_ci_defaults(args)

    assert args.report_path == str(explicit_report)
    assert args.junit_path == str(tmp_path / "release-artifacts" / "release-flow-smoke.junit.xml")


def test_smoke_main_writes_report_when_credentials_are_missing(
    tmp_path: Path, monkeypatch: Any
) -> None:
    smoke = load_smoke_module()
    for name in ("API_BASE_URL", "BASE_URL", "AUTH_EMAIL", "AUTH_PASSWORD"):
        monkeypatch.delenv(name, raising=False)
    report_path = tmp_path / "missing-credentials.json"
    junit_path = tmp_path / "missing-credentials.xml"
    markdown_path = tmp_path / "missing-credentials.md"
    step_summary_path = tmp_path / "github-step-summary.md"
    github_output_path = tmp_path / "github-output.txt"
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(step_summary_path))
    monkeypatch.setenv("GITHUB_OUTPUT", str(github_output_path))

    exit_code = smoke.main(
        [
            "--report-path",
            str(report_path),
            "--junit-path",
            str(junit_path),
            "--markdown-path",
            str(markdown_path),
            "--github-step-summary",
            "--github-output",
            "--github-annotations",
        ]
    )

    assert exit_code == 2
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    assert payload["ok"] is False
    assert "AUTH_EMAIL" in payload["error"]
    suite = ET.parse(junit_path).getroot()
    assert suite.attrib["failures"] == "1"
    assert "AUTH_EMAIL" in suite.find(".//failure").attrib["message"]
    assert "AUTH_EMAIL" in markdown_path.read_text(encoding="utf-8")
    assert "AUTH_EMAIL" in step_summary_path.read_text(encoding="utf-8")
    github_output = github_output_path.read_text(encoding="utf-8")
    assert "release_smoke_ok=false" in github_output
    assert "release_smoke_failed_count=1" in github_output
    assert "AUTH_EMAIL" in github_output


def test_smoke_default_does_not_start_release_run() -> None:
    smoke = load_smoke_module()
    client = FakeClient()

    results = smoke.run_smoke(client, "ops@example.com", "password", demo_run=False)

    assert all(result.ok for result in results)
    assert ("POST", "/release-plans/start", None) not in client.calls
    assert [path for _method, path, _payload in client.calls].count("/release-plans/preview") == 1
    assert [path for _method, path, _payload in client.calls].count(
        "/release-plans/render-manifest"
    ) == 1
    assert any(result.name == "release-plans.generated-manifest" for result in results)
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

    results = smoke.run_smoke(
        client, "ops@example.com", "password", demo_run=False, ops_rehearsal=True
    )

    assert all(result.ok for result in results)
    paths = [path for _method, path, _payload in client.calls]
    assert "/release-plans/start" in paths
    assert paths.index("/release-runs/release-run-smoke/pause") < paths.index(
        "/release-runs/release-run-smoke/resume"
    )
    assert "/release-runs/release-run-smoke/notify" in paths
    assert paths[-1] == "/release-runs/release-run-smoke"
    assert client.release_run_status == "cancelled"


def test_smoke_live_preflight_checks_readiness_without_starting_run() -> None:
    smoke = load_smoke_module()
    client = FakeClient()
    args = smoke.parse_args(
        [
            "--live-preflight",
            "--live-change-ticket",
            "CHG-12345",
            "--live-runbook-url",
            "https://wiki.company.internal/runbooks/release-flow",
            "--live-verification-url",
            "https://ops.company.internal/verify/release-flow",
            "--live-release-owner",
            "release-team",
            "--live-oncall-contact",
            "release-oncall@company.internal",
            "--live-image",
            "ghcr.io/acme/checkout-api:2026.07.10",
        ]
    )

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
    assert readiness_payload["settings"]["change_ticket"] == "CHG-12345"
    assert readiness_payload["settings"]["release_window_start"].endswith("Z")
    assert readiness_payload["settings"]["release_window_end"].endswith("Z")
    assert readiness_payload["settings"]["runbook_url"].startswith("https://")
    assert readiness_payload["settings"]["release_owner"] == "release-team"
    assert readiness_payload["settings"]["oncall_contact"] == "release-oncall@company.internal"
    assert (
        readiness_payload["steps"][0]["config"]["post_deploy_verification_url"]
        == "https://ops.company.internal/verify/release-flow"
    )
    assert readiness_payload["steps"][0]["config"]["environment"] == "production"
    assert readiness_payload["steps"][0]["config"]["namespace"] == "production"
    assert (
        readiness_payload["steps"][0]["config"]["image"] == "ghcr.io/acme/checkout-api:2026.07.10"
    )
    assert readiness_payload["steps"][0]["config"]["approval_gate"] == "manual"


def test_smoke_live_preflight_can_exercise_safe_pr_gate() -> None:
    smoke = load_smoke_module()
    client = FakeClient()
    args = smoke.parse_args(
        [
            "--live-preflight",
            "--live-approval-gate",
            "safe_pr",
            "--live-safe-pr-workflow-run-id",
            "workflow-safe-pr-1",
            "--live-safe-pr-url",
            "https://github.example/org/checkout/pull/7",
            "--live-change-ticket",
            "CHG-12345",
            "--live-runbook-url",
            "https://wiki.company.internal/runbooks/release-flow",
            "--live-verification-url",
            "https://ops.company.internal/verify/release-flow",
            "--live-release-owner",
            "release-team",
            "--live-image",
            "ghcr.io/acme/checkout-api:2026.07.10",
        ]
    )

    results = smoke.run_smoke(
        client,
        "ops@example.com",
        "password",
        demo_run=False,
        live_preflight=True,
        args=args,
    )

    assert all(result.ok for result in results)
    readiness_payload = next(
        payload for _method, path, payload in client.calls if path == "/release-readiness"
    )
    assert readiness_payload is not None
    config = readiness_payload["steps"][0]["config"]
    assert config["approval_gate"] == "safe_pr"
    assert config["safe_pr_workflow_run_id"] == "workflow-safe-pr-1"
    assert config["safe_pr_url"] == "https://github.example/org/checkout/pull/7"
    assert "safe_pr_ready" not in config


def test_smoke_live_preflight_rejects_production_placeholders_before_payload() -> None:
    smoke = load_smoke_module()
    args = smoke.parse_args(
        [
            "--live-preflight",
            "--live-change-ticket",
            "CHG-12345",
            "--live-runbook-url",
            "https://wiki.company.internal/runbooks/release-flow",
            "--live-verification-url",
            "https://ops.company.internal/verify/release-flow",
            "--live-release-owner",
            "release-team",
            "--live-image",
            "ghcr.io/example/release-flow-smoke:live-preflight",
        ]
    )

    try:
        smoke.validate_live_preflight_inputs(args)
    except ValueError as exc:
        message = str(exc)
    else:
        raise AssertionError("expected production live preflight placeholder rejection")

    assert (
        "live_image must not use production placeholder value "
        "ghcr.io/example/release-flow-smoke:live-preflight"
    ) in message


def test_smoke_live_preflight_rejects_invalid_safe_pr_evidence_inputs() -> None:
    smoke = load_smoke_module()
    cases = [
        ("http://github.internal/org/repo/pull/1", "live_safe_pr_url must use https"),
        (
            "https://localhost/pull/1",
            "live_safe_pr_url must not use localhost or example hosts placeholder value",
        ),
        (
            "https://example.com/pull/1",
            "live_safe_pr_url must not use localhost or example hosts placeholder value",
        ),
        (
            "https://github.example.test/org/repo/pull/1",
            "live_safe_pr_url must not use localhost or example hosts placeholder value",
        ),
    ]
    for url, expected_message in cases:
        args = smoke.parse_args(
            ["--live-preflight", "--live-approval-gate", "safe_pr", "--live-safe-pr-url", url]
        )

        try:
            smoke.validate_live_preflight_inputs(args)
        except ValueError as exc:
            message = str(exc)
        else:
            raise AssertionError("expected invalid Safe PR URL rejection")

        assert expected_message in message


def test_smoke_live_preflight_requires_safe_pr_evidence_before_readiness_call() -> None:
    smoke = load_smoke_module()
    args = smoke.parse_args(["--live-preflight", "--live-approval-gate", "safe_pr"])

    try:
        smoke.validate_live_preflight_inputs(args)
    except ValueError as exc:
        message = str(exc)
    else:
        raise AssertionError("expected missing Safe PR workflow id rejection")

    assert "live_safe_pr_workflow_run_id is required when live_approval_gate is safe_pr" in message

    args = smoke.parse_args(
        [
            "--live-preflight",
            "--live-approval-gate",
            "safe_pr",
            "--live-safe-pr-workflow-run-id",
            "workflow-safe-pr-1",
        ]
    )

    try:
        smoke.validate_live_preflight_inputs(args)
    except ValueError as exc:
        message = str(exc)
    else:
        raise AssertionError("expected missing Safe PR URL rejection")

    assert "live_safe_pr_url is required when live_approval_gate is safe_pr" in message


def test_smoke_live_preflight_requires_explicit_production_inputs() -> None:
    smoke = load_smoke_module()
    args = smoke.parse_args(["--live-preflight"])

    try:
        smoke.validate_live_preflight_inputs(args)
    except ValueError as exc:
        message = str(exc)
    else:
        raise AssertionError("expected missing production live preflight input rejection")

    assert "live_change_ticket is required for production live preflight" in message

    args = smoke.parse_args(
        [
            "--live-preflight",
            "--live-change-ticket",
            "CHG-12345",
            "--live-runbook-url",
            "https://wiki.company.internal/runbooks/release-flow",
            "--live-release-owner",
            "release-team",
            "--live-image",
            "ghcr.io/acme/checkout-api:2026.07.10",
        ]
    )

    try:
        smoke.validate_live_preflight_inputs(args)
    except ValueError as exc:
        message = str(exc)
    else:
        raise AssertionError("expected missing production verification URL rejection")

    assert "live_verification_url is required for production live preflight" in message


def test_smoke_live_preflight_rejects_invalid_production_verification_url() -> None:
    smoke = load_smoke_module()
    args = smoke.parse_args(
        [
            "--live-preflight",
            "--live-change-ticket",
            "CHG-12345",
            "--live-runbook-url",
            "https://wiki.company.internal/runbooks/release-flow",
            "--live-verification-url",
            "http://localhost/verify",
            "--live-release-owner",
            "release-team",
            "--live-image",
            "ghcr.io/acme/checkout-api:2026.07.10",
        ]
    )

    try:
        smoke.validate_live_preflight_inputs(args)
    except ValueError as exc:
        message = str(exc)
    else:
        raise AssertionError("expected invalid production verification URL rejection")

    assert "live_verification_url must use https" in message


def test_smoke_live_preflight_rejects_invalid_production_runbook_url() -> None:
    smoke = load_smoke_module()
    args = smoke.parse_args(
        [
            "--live-preflight",
            "--live-change-ticket",
            "CHG-12345",
            "--live-runbook-url",
            "http://ops.internal/runbooks/release-flow",
            "--live-release-owner",
            "release-team",
            "--live-oncall-contact",
            "release-oncall@company.internal",
            "--live-image",
            "ghcr.io/acme/checkout-api:2026.07.10",
            "--live-verification-url",
            "https://ops.company.internal/verify/release-flow",
        ]
    )

    try:
        smoke.validate_live_preflight_inputs(args)
    except ValueError as exc:
        message = str(exc)
    else:
        raise AssertionError("expected invalid production runbook URL rejection")

    assert "live_runbook_url must use https" in message


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
    payload = next(
        payload for _method, path, payload in client.calls if path == "/alert-channels/test"
    )
    assert payload is not None
    assert payload["channel_id"] == "chan-release-warning"
    assert payload["severity"] == "warning"
    assert payload["message"] == "release-flow alert channel preflight"


def test_smoke_verification_preflight_passes_when_summary_is_clean() -> None:
    smoke = load_smoke_module()
    client = FakeClient()
    args = smoke.parse_args(["--verification-preflight"])

    results = smoke.run_smoke(
        client,
        "ops@example.com",
        "password",
        demo_run=False,
        verification_preflight=True,
        args=args,
    )

    assert all(result.ok for result in results)
    paths = [path for _method, path, _payload in client.calls]
    assert "/release-runs/summary" in paths
    assert not any(path.startswith("/release-runs?") for path in paths)


def test_smoke_verification_preflight_flags_failed_and_timed_out_runs() -> None:
    smoke = load_smoke_module()
    client = FakeClient()
    client.verification_failed_runs = 1
    client.verification_pending_timeout_runs = 1
    args = smoke.parse_args(["--verification-preflight", "--verification-plan-id", "plan-1"])

    results = smoke.run_smoke(
        client,
        "ops@example.com",
        "password",
        demo_run=False,
        verification_preflight=True,
        args=args,
    )

    assert not all(result.ok for result in results)
    paths = [path for _method, path, _payload in client.calls]
    assert "/release-runs?plan_id=plan-1&limit=20&verification_failed_only=true" in paths
    assert "/release-runs?plan_id=plan-1&limit=20&verification_pending_timeout_only=true" in paths
    failed = next(result for result in results if result.name == "release-runs.verification-failed")
    timed_out = next(
        result for result in results if result.name == "release-runs.verification-timeout"
    )
    assert "run-verification-failed" in failed.detail
    assert "run-verification-timeout" in timed_out.detail


def test_smoke_policy_override_preflight_passes_when_summary_is_clean() -> None:
    smoke = load_smoke_module()
    client = FakeClient()
    args = smoke.parse_args(["--policy-override-preflight"])

    results = smoke.run_smoke(
        client,
        "ops@example.com",
        "password",
        demo_run=False,
        policy_override_preflight=True,
        args=args,
    )

    assert all(result.ok for result in results)
    paths = [path for _method, path, _payload in client.calls]
    assert "/release-runs/summary" in paths
    assert not any(path.startswith("/release-runs?") for path in paths)


def test_smoke_policy_override_preflight_flags_override_runs() -> None:
    smoke = load_smoke_module()
    client = FakeClient()
    client.policy_override_runs = 1
    client.policy_override_breakdown = {"Change freeze": 1}
    args = smoke.parse_args(
        [
            "--policy-override-preflight",
            "--policy-override-plan-id",
            "plan-1",
            "--policy-override-source",
            "Change freeze",
        ]
    )

    results = smoke.run_smoke(
        client,
        "ops@example.com",
        "password",
        demo_run=False,
        policy_override_preflight=True,
        args=args,
    )

    assert not all(result.ok for result in results)
    paths = [path for _method, path, _payload in client.calls]
    assert (
        "/release-runs?plan_id=plan-1&limit=20&policy_override_source=Change+freeze&policy_override_only=true"
        in paths
    )
    preflight = next(
        result for result in results if result.name == "release-runs.policy-override-preflight"
    )
    assert "run-policy-override" in preflight.detail
    assert "Change freeze=1" in preflight.detail


def test_smoke_change_freeze_preflight_passes_when_summary_is_clean() -> None:
    smoke = load_smoke_module()
    client = FakeClient()
    args = smoke.parse_args(["--change-freeze-preflight"])

    results = smoke.run_smoke(
        client,
        "ops@example.com",
        "password",
        demo_run=False,
        change_freeze_preflight=True,
        args=args,
    )

    assert all(result.ok for result in results)
    paths = [path for _method, path, _payload in client.calls]
    assert "/release-runs/summary" in paths
    assert not any(path.startswith("/release-runs?") for path in paths)


def test_smoke_change_freeze_preflight_flags_active_and_override_runs() -> None:
    smoke = load_smoke_module()
    client = FakeClient()
    client.active_change_freeze_runs = 1
    client.change_freeze_override_runs = 1
    args = smoke.parse_args(["--change-freeze-preflight", "--change-freeze-plan-id", "plan-1"])

    results = smoke.run_smoke(
        client,
        "ops@example.com",
        "password",
        demo_run=False,
        change_freeze_preflight=True,
        args=args,
    )

    assert not all(result.ok for result in results)
    paths = [path for _method, path, _payload in client.calls]
    assert "/release-runs?plan_id=plan-1&limit=20&active_change_freeze_only=true" in paths
    assert "/release-runs?plan_id=plan-1&limit=20&change_freeze_override_only=true" in paths
    preflight = next(
        result for result in results if result.name == "release-runs.change-freeze-preflight"
    )
    assert "active_change_freeze_runs=1" in preflight.detail
    assert "change_freeze_override_runs=1" in preflight.detail
    assert "run-active-freeze" in preflight.detail
    assert "run-freeze-override" in preflight.detail


def test_smoke_production_preflight_enables_all_release_guards() -> None:
    smoke = load_smoke_module()
    client = FakeClient()
    args = smoke.parse_args(["--production-preflight"])
    smoke.apply_production_preflight_flags(args)

    assert args.run_health_preflight is True
    assert args.verification_preflight is True
    assert args.policy_override_preflight is True
    assert args.change_freeze_preflight is True

    results = smoke.run_smoke(
        client,
        "ops@example.com",
        "password",
        demo_run=False,
        run_health_preflight=args.run_health_preflight,
        verification_preflight=args.verification_preflight,
        policy_override_preflight=args.policy_override_preflight,
        change_freeze_preflight=args.change_freeze_preflight,
        args=args,
    )

    assert all(result.ok for result in results)
    result_names = {result.name for result in results}
    assert {
        "release-runs.run-health-preflight",
        "release-runs.verification-preflight",
        "release-runs.policy-override-preflight",
        "release-runs.change-freeze-preflight",
    } <= result_names


def test_smoke_production_preflight_applies_shared_scope_to_release_guards() -> None:
    smoke = load_smoke_module()
    client = FakeClient()
    client.attention_required_runs = 1
    client.verification_failed_runs = 1
    client.policy_override_runs = 1
    client.active_change_freeze_runs = 1
    args = smoke.parse_args(
        [
            "--production-preflight",
            "--production-preflight-plan-id",
            "plan-prod",
            "--production-preflight-run-limit",
            "7",
        ]
    )
    smoke.apply_production_preflight_flags(args)

    results = smoke.run_smoke(
        client,
        "ops@example.com",
        "password",
        demo_run=False,
        run_health_preflight=args.run_health_preflight,
        verification_preflight=args.verification_preflight,
        policy_override_preflight=args.policy_override_preflight,
        change_freeze_preflight=args.change_freeze_preflight,
        args=args,
    )

    assert not all(result.ok for result in results)
    paths = [path for _method, path, _payload in client.calls]
    assert "/release-runs?plan_id=plan-prod&limit=7&attention_only=true" in paths
    assert "/release-runs?plan_id=plan-prod&limit=7&verification_failed_only=true" in paths
    assert "/release-runs?plan_id=plan-prod&limit=7&policy_override_only=true" in paths
    assert "/release-runs?plan_id=plan-prod&limit=7&active_change_freeze_only=true" in paths


def test_smoke_run_health_preflight_passes_when_summary_is_clean() -> None:
    smoke = load_smoke_module()
    client = FakeClient()
    args = smoke.parse_args(["--run-health-preflight"])

    results = smoke.run_smoke(
        client,
        "ops@example.com",
        "password",
        demo_run=False,
        run_health_preflight=True,
        args=args,
    )

    assert all(result.ok for result in results)
    paths = [path for _method, path, _payload in client.calls]
    assert "/release-runs/summary" in paths
    assert not any(path.startswith("/release-runs?") for path in paths)


def test_smoke_run_health_preflight_flags_attention_and_stale_runs() -> None:
    smoke = load_smoke_module()
    client = FakeClient()
    client.attention_required_runs = 1
    client.stale_runs = 1
    client.failed_runs = 1
    args = smoke.parse_args(["--run-health-preflight", "--run-health-plan-id", "plan-1"])

    results = smoke.run_smoke(
        client,
        "ops@example.com",
        "password",
        demo_run=False,
        run_health_preflight=True,
        args=args,
    )

    assert not all(result.ok for result in results)
    paths = [path for _method, path, _payload in client.calls]
    assert "/release-runs?plan_id=plan-1&limit=20&attention_only=true" in paths
    assert "/release-runs?plan_id=plan-1&limit=20&stale_only=true" in paths
    health = next(
        result for result in results if result.name == "release-runs.run-health-preflight"
    )
    assert "attention_required_runs=1" in health.detail
    assert "failed_runs=1" in health.detail
    assert "run-needs-attention" in health.detail
    assert "run-stale" in health.detail

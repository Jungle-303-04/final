from __future__ import annotations

import json
import urllib.error
from collections import deque
from pathlib import Path

import scripts.validate_release_flow_production_readiness as readiness
from scripts.validate_release_flow_production_readiness import main, validate_readiness


def set_live_runtime_env(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "1")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "workspace-production")


def test_python_call_contract_is_independent_of_formatter_line_breaks() -> None:
    source = """
validate_live_https_url(
    "live_verification_url",
    verification_url,
    context="for production live preflight",
)
"""

    assert readiness.has_python_call_with_first_literal(
        source, "validate_live_https_url", "live_verification_url"
    )
    assert not readiness.has_python_call_with_first_literal(
        source, "validate_live_https_url", "live_runbook_url"
    )


def test_current_release_flow_production_readiness_static_checks_pass() -> None:
    checks = validate_readiness()

    assert checks
    assert all(check.ok for check in checks)
    assert {check.name for check in checks} >= {
        "workflow.production_readiness.require_runtime_config",
        "workflow.production_readiness.runtime_env",
        "workflow.production_readiness.github_api_base",
        "workflow.production_readiness.failure_report",
        "workflow.smoke.runtime_config_preflight",
        "workflow.smoke.live_verification_url_required",
        "workflow.smoke.live_approval_gate",
        "workflow.smoke.safe_pr_evidence_inputs",
        "workflow.smoke.safe_pr_evidence_required",
        "script.smoke.live_placeholder_guard",
        "script.smoke.live_image_required",
        "script.smoke.live_runbook_url_required",
        "script.smoke.live_verification_url_required",
        "script.smoke.generated_manifest_render",
        "script.smoke.live_approval_gate",
        "script.smoke.production_verification_url_required",
        "script.smoke.safe_pr_evidence_inputs",
        "script.smoke.safe_pr_evidence_required",
        "script.smoke.safe_pr_ready_server_verified",
        "script.smoke.ci_github_summary",
        "docs.production_readiness.operator_guide",
        "worker_topology.deployments",
        "worker_topology.local_startup",
        "gitops.poll_status_recording",
        "gitops.poll_status_api",
        "gitops.poll_status_api_source_lookup",
        "gitops.watch_source_identity_upsert",
        "metrics.api_gateway_endpoint",
        "metrics.api_gateway_scrape_annotations",
        "trace.gateway_request_logs",
        "trace.gateway_event_acceptance_logs",
        "trace.db_write_logs",
        "trace.github_provider_logs",
        "trace.target_agent_result_logs",
        "safe_pr.provider_commits_patches",
        "safe_pr.generated_manifest_rollback_patch",
        "safe_pr.production_generated_manifest_rollback_required",
        "safe_pr.production_evidence_rollback_required",
        "safe_pr.evidence_candidate_matching",
        "safe_pr.evidence_mismatch_diagnostics",
        "safe_pr.dispatch_uses_server_evidence",
        "safe_pr.execution_requires_created_evidence",
        "safe_pr.github_branch_ref_validation",
        "workflow.production_readiness.requires_runtime_config",
        "workflow.production_readiness.github_provider_env",
        "workflow.production_readiness.live_runtime_env",
        "workflow.production_readiness.github_access_preflight",
        "workflow.production_readiness.github_environment_preflight",
        "workflow.production_readiness.api_smoke_preflight",
        "workflow.production_readiness.production_deploy_required",
        "workflow.production_readiness.github_secret_names",
        "workflow.production_gate.fail_closed",
        "workflow.production_gate.production_live_preflight_required",
        "workflow.production_gate.safe_pr_gate_default",
        "workflow.production_gate.safe_pr_evidence_inputs",
        "workflow.production_gate.safe_pr_evidence_required",
        "workflow.production_gate.change_ticket_required",
        "workflow.production_gate.runbook_required",
        "workflow.production_gate.owner_required",
        "workflow.production_gate.image_required",
        "workflow.production_gate.verification_url_required",
        "workflow.production_gate.validates_before_smoke",
        "workflow.production_deploy.required_inputs",
        "workflow.production_deploy.calls_gate",
        "workflow.production_deploy.gates_start",
        "workflow.production_deploy.concurrency",
        "workflow.production_deploy.python_runtime",
        "workflow.production_deploy.starts_release_flow",
        "script.deploy.fetches_saved_plan",
        "script.deploy.api_base_url_guard",
        "script.deploy.plan_id_guard",
        "script.deploy.auth_guard",
        "script.deploy.rollback_guard",
        "script.deploy.gate_input_guard",
        "script.deploy.matches_gate_evidence",
        "script.deploy.requires_live_production_plan",
        "script.deploy.starts_release",
        "script.github_environment_verifier.required_config",
        "script.github_environment_verifier.value_guards",
        "docs.production_readiness.github_environment_verifier",
        "script.evidence_verifier.required_artifacts",
        "script.evidence_verifier.github_artifacts",
        "docs.production_readiness.evidence_verifier",
        "docs.production_readiness.github_evidence_verifier",
        "script.readiness_runner.dispatches_workflow",
        "script.readiness_runner.polls_and_verifies",
        "docs.production_readiness.runner",
        "script.production_signoff_runner.dispatches_readiness_and_deploy",
        "script.production_signoff_runner.validates_live_inputs",
        "script.production_signoff_runner.verifies_final_evidence",
        "script.production_signoff_runner.writes_signoff_report",
        "docs.production_readiness.signoff_runner",
        "script.gate_contract.required_live_inputs",
        "script.gate_contract.literal_url_guard",
        "workflow.gate_contract.static_scan",
        "runtime.github_token",
        "runtime.scm_repo",
        "runtime.github_api_base",
        "runtime.live_enabled",
        "runtime.live_workspaces",
    }


def test_release_flow_production_readiness_requires_runtime_config(monkeypatch) -> None:
    for name in (
        "RELEASE_FLOW_API_BASE_URL",
        "API_BASE_URL",
        "RELEASE_FLOW_AUTH_EMAIL",
        "AUTH_EMAIL",
        "RELEASE_FLOW_AUTH_PASSWORD",
        "AUTH_PASSWORD",
        "GITHUB_TOKEN_REF",
        "GITHUB_TOKEN",
        "SCM_REPO",
        "GITHUB_API_BASE",
        "RELEASE_FLOW_LIVE_ENABLED",
        "RELEASE_FLOW_LIVE_WORKSPACES",
    ):
        monkeypatch.delenv(name, raising=False)

    checks = validate_readiness(require_runtime_config=True)

    failed = {check.name for check in checks if not check.ok}
    assert failed == {
        "runtime.api_base_url",
        "runtime.auth_email",
        "runtime.auth_password",
        "runtime.github_token",
        "runtime.scm_repo",
        "runtime.live_enabled",
        "runtime.live_workspaces",
    }


def test_release_flow_production_readiness_requires_live_release_workers(
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / "deploy" / "management").mkdir(parents=True)
    (tmp_path / "scripts").mkdir()
    (tmp_path / "deploy" / "management" / "services.yaml").write_text(
        "kind: Deployment\nmetadata:\n  name: safe-pr-worker\n  labels:\n    app: safe-pr-worker\n",
        encoding="utf-8",
    )
    (tmp_path / "scripts" / "up.sh").write_text(
        "APP_WORKER_DEPLOYMENTS=(\n  safe-pr-worker\n)\n",
        encoding="utf-8",
    )

    checks = validate_readiness()

    failed = {check.name for check in checks if not check.ok}
    assert {"worker_topology.deployments", "worker_topology.local_startup"} <= failed


def test_release_flow_production_readiness_accepts_runtime_config_aliases(monkeypatch) -> None:
    monkeypatch.setenv("API_BASE_URL", "https://release-flow.internal.test/api")
    monkeypatch.setenv("AUTH_EMAIL", "ops@company.test")
    monkeypatch.setenv("AUTH_PASSWORD", "correct-horse-battery")
    set_live_runtime_env(monkeypatch)
    monkeypatch.setenv("GITHUB_TOKEN_REF", "aws-sm:/myjob/prod/github-token#token")
    monkeypatch.setenv("SCM_REPO", "org/checkout")

    checks = validate_readiness(require_runtime_config=True)

    assert all(check.ok for check in checks)


def test_release_flow_production_readiness_rejects_placeholder_runtime_config(monkeypatch) -> None:
    monkeypatch.setenv("RELEASE_FLOW_API_BASE_URL", "http://localhost:8000")
    monkeypatch.setenv("RELEASE_FLOW_AUTH_EMAIL", "release-oncall@example.com")
    monkeypatch.setenv("RELEASE_FLOW_AUTH_PASSWORD", "secret")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_ENABLED", "false")
    monkeypatch.setenv("RELEASE_FLOW_LIVE_WORKSPACES", "*")
    monkeypatch.setenv("GITHUB_TOKEN_REF", "github-token")
    monkeypatch.setenv("SCM_REPO", "not-a-repo")
    monkeypatch.setenv("GITHUB_API_BASE", "http://example.com/api")

    checks = validate_readiness(require_runtime_config=True)

    failed = {check.name for check in checks if not check.ok}
    assert {
        "runtime.api_base_url",
        "runtime.auth_email",
        "runtime.auth_password",
        "runtime.github_token",
        "runtime.scm_repo",
        "runtime.github_api_base",
        "runtime.live_enabled",
        "runtime.live_workspaces",
    } <= failed
    details = {check.name: check.detail for check in checks}
    assert "must use https" in details["runtime.api_base_url"]
    assert "real operator account" in details["runtime.auth_email"]
    assert "non-placeholder secret" in details["runtime.auth_password"]
    assert "placeholder token ref" in details["runtime.github_token"]
    assert "owner/repo" in details["runtime.scm_repo"]
    assert "must use https" in details["runtime.github_api_base"]
    assert "must be enabled" in details["runtime.live_enabled"]
    assert "wildcard" in details["runtime.live_workspaces"]


def test_release_flow_production_readiness_rejects_example_subdomain_runtime_urls(
    monkeypatch,
) -> None:
    monkeypatch.setenv("RELEASE_FLOW_API_BASE_URL", "https://api.example.com")
    monkeypatch.setenv("RELEASE_FLOW_AUTH_EMAIL", "ops@company.test")
    monkeypatch.setenv("RELEASE_FLOW_AUTH_PASSWORD", "correct-horse-battery")
    set_live_runtime_env(monkeypatch)
    monkeypatch.setenv("GITHUB_TOKEN_REF", "aws-sm:/myjob/prod/github-token#token")
    monkeypatch.setenv("SCM_REPO", "org/checkout")
    monkeypatch.setenv("GITHUB_API_BASE", "https://api.example.com")

    checks = validate_readiness(require_runtime_config=True)

    failed = {check.name for check in checks if not check.ok}
    assert {"runtime.api_base_url", "runtime.github_api_base"} <= failed
    details = {check.name: check.detail for check in checks}
    assert "example hosts" in details["runtime.api_base_url"]
    assert "example hosts" in details["runtime.github_api_base"]


def test_release_flow_production_readiness_github_access_preflight_success(monkeypatch) -> None:
    monkeypatch.setenv("API_BASE_URL", "https://release-flow.internal.test/api")
    monkeypatch.setenv("AUTH_EMAIL", "ops@company.test")
    monkeypatch.setenv("AUTH_PASSWORD", "correct-horse-battery")
    set_live_runtime_env(monkeypatch)
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_" + "a" * 32)
    monkeypatch.setenv("SCM_REPO", "org/checkout")
    monkeypatch.setenv("SCM_BASE_BRANCH", "release/main")
    seen: dict[str, str] = {}
    responses = deque(
        [
            {"permissions": {"push": True, "maintain": False, "admin": False}},
            {"object": {"sha": "abc123"}},
        ]
    )

    class Response:
        def __init__(self, payload: dict[str, object]) -> None:
            self.payload = payload

        def __enter__(self) -> Response:
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def getcode(self) -> int:
            return 200

        def read(self) -> bytes:
            return json.dumps(self.payload).encode("utf-8")

    def fake_urlopen(request: object, *, timeout: int) -> Response:
        assert timeout == 10
        seen["url"] = request.full_url  # type: ignore[attr-defined]
        seen["authorization"] = request.headers["Authorization"]  # type: ignore[attr-defined,index]
        return Response(responses.popleft())

    monkeypatch.setattr(readiness.urllib.request, "urlopen", fake_urlopen)

    checks = validate_readiness(require_runtime_config=True, check_github_access=True)

    access = next(check for check in checks if check.name == "runtime.github_access_preflight")
    assert access.ok is True
    assert seen["url"].endswith("/repos/org/checkout/git/ref/heads/release/main")
    assert seen["authorization"].startswith("Bearer ghp_")
    assert "allows Safe PR writes" in access.detail


def test_release_flow_production_readiness_github_access_preflight_rejects_read_only_token(
    monkeypatch,
) -> None:
    monkeypatch.setenv("API_BASE_URL", "https://release-flow.internal.test/api")
    monkeypatch.setenv("AUTH_EMAIL", "ops@company.test")
    monkeypatch.setenv("AUTH_PASSWORD", "correct-horse-battery")
    set_live_runtime_env(monkeypatch)
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_" + "a" * 32)
    monkeypatch.setenv("SCM_REPO", "org/checkout")

    class Response:
        def __enter__(self) -> Response:
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def getcode(self) -> int:
            return 200

        def read(self) -> bytes:
            return json.dumps({"permissions": {"pull": True, "push": False}}).encode("utf-8")

    monkeypatch.setattr(readiness.urllib.request, "urlopen", lambda *_args, **_kwargs: Response())

    checks = validate_readiness(require_runtime_config=True, check_github_access=True)

    access = next(check for check in checks if check.name == "runtime.github_access_preflight")
    assert access.ok is False
    assert "do not indicate write access" in access.detail


def test_release_flow_production_readiness_github_access_preflight_requires_resolvable_non_env_ref(
    monkeypatch,
) -> None:
    monkeypatch.setenv("API_BASE_URL", "https://release-flow.internal.test/api")
    monkeypatch.setenv("AUTH_EMAIL", "ops@company.test")
    monkeypatch.setenv("AUTH_PASSWORD", "correct-horse-battery")
    set_live_runtime_env(monkeypatch)
    monkeypatch.setenv("GITHUB_TOKEN_REF", "aws-sm:/myjob/prod/github-token#token")
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    monkeypatch.setenv("SCM_REPO", "org/checkout")

    checks = validate_readiness(require_runtime_config=True, check_github_access=True)

    access = next(check for check in checks if check.name == "runtime.github_access_preflight")
    assert access.ok is False
    assert "RELEASE_FLOW_GITHUB_TOKEN" in access.detail
    assert "non-env token refs" in access.detail


def test_release_flow_production_readiness_github_access_preflight_reports_http_failure(
    monkeypatch,
) -> None:
    monkeypatch.setenv("API_BASE_URL", "https://release-flow.internal.test/api")
    monkeypatch.setenv("AUTH_EMAIL", "ops@company.test")
    monkeypatch.setenv("AUTH_PASSWORD", "correct-horse-battery")
    set_live_runtime_env(monkeypatch)
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_" + "a" * 32)
    monkeypatch.setenv("SCM_REPO", "org/missing")

    def fake_urlopen(request: object, *, timeout: int) -> object:
        assert timeout == 10
        raise urllib.error.HTTPError(request.full_url, 404, "not found", hdrs=None, fp=None)  # type: ignore[attr-defined]

    monkeypatch.setattr(readiness.urllib.request, "urlopen", fake_urlopen)

    checks = validate_readiness(require_runtime_config=True, check_github_access=True)

    access = next(check for check in checks if check.name == "runtime.github_access_preflight")
    assert access.ok is False
    assert "HTTP 404" in access.detail
    assert "org/missing@main" in access.detail


def test_release_flow_production_readiness_writes_reports(tmp_path: Path) -> None:
    report_path = tmp_path / "readiness.json"
    markdown_path = tmp_path / "readiness.md"

    exit_code = main(["--report-path", str(report_path), "--markdown-path", str(markdown_path)])

    assert exit_code == 0
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    assert payload["ok"] is True
    assert "# Release Flow Production Readiness" in markdown_path.read_text(encoding="utf-8")


def test_release_flow_production_readiness_can_require_gated_production_deploy() -> None:
    checks = validate_readiness(require_production_deploy=True)

    gate_contract = next(
        check for check in checks if check.name == "workflow.gate_contract.static_scan"
    )
    assert gate_contract.ok is True
    assert gate_contract.detail == "contract passed"

    exit_code = main(["--require-production-deploy"])
    assert exit_code == 0


def test_release_flow_production_readiness_fails_when_gated_deploy_is_missing(
    monkeypatch,
    tmp_path: Path,
) -> None:
    workflows = tmp_path / ".github" / "workflows"
    workflows.mkdir(parents=True)
    monkeypatch.chdir(tmp_path)

    checks = readiness.check_gate_contract_workflow(require_production_deploy=True)

    gate_contract = next(
        check for check in checks if check.name == "workflow.gate_contract.static_scan"
    )
    assert gate_contract.ok is False
    assert "no production deploy jobs were found to validate" in gate_contract.detail

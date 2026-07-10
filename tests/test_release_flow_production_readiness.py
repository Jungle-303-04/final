from __future__ import annotations

import json
from pathlib import Path

from scripts.validate_release_flow_production_readiness import main, validate_readiness


def test_current_release_flow_production_readiness_static_checks_pass() -> None:
    checks = validate_readiness()

    assert checks
    assert all(check.ok for check in checks)
    assert {check.name for check in checks} >= {
        "workflow.smoke.runtime_config_preflight",
        "workflow.smoke.live_approval_gate",
        "workflow.smoke.safe_pr_evidence_inputs",
        "workflow.smoke.safe_pr_evidence_required",
        "script.smoke.live_placeholder_guard",
        "script.smoke.live_image_required",
        "script.smoke.generated_manifest_render",
        "script.smoke.live_approval_gate",
        "script.smoke.safe_pr_evidence_inputs",
        "script.smoke.safe_pr_evidence_required",
        "script.smoke.safe_pr_ready_server_verified",
        "worker_topology.deployments",
        "worker_topology.local_startup",
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
        "workflow.production_gate.fail_closed",
        "workflow.production_gate.safe_pr_gate_default",
        "workflow.production_gate.safe_pr_evidence_inputs",
        "workflow.production_gate.safe_pr_evidence_required",
        "workflow.production_gate.change_ticket_required",
        "workflow.production_gate.runbook_required",
        "workflow.production_gate.owner_required",
        "workflow.production_gate.image_required",
        "workflow.production_gate.validates_before_smoke",
        "workflow.gate_contract.static_scan",
    }


def test_release_flow_production_readiness_requires_runtime_config(monkeypatch) -> None:
    for name in (
        "RELEASE_FLOW_API_BASE_URL",
        "API_BASE_URL",
        "RELEASE_FLOW_AUTH_EMAIL",
        "AUTH_EMAIL",
        "RELEASE_FLOW_AUTH_PASSWORD",
        "AUTH_PASSWORD",
    ):
        monkeypatch.delenv(name, raising=False)

    checks = validate_readiness(require_runtime_config=True)

    failed = {check.name for check in checks if not check.ok}
    assert failed == {"runtime.api_base_url", "runtime.auth_email", "runtime.auth_password"}


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
    monkeypatch.setenv("API_BASE_URL", "https://example.test/api")
    monkeypatch.setenv("AUTH_EMAIL", "ops@example.test")
    monkeypatch.setenv("AUTH_PASSWORD", "secret")

    checks = validate_readiness(require_runtime_config=True)

    assert all(check.ok for check in checks)


def test_release_flow_production_readiness_writes_reports(tmp_path: Path) -> None:
    report_path = tmp_path / "readiness.json"
    markdown_path = tmp_path / "readiness.md"

    exit_code = main(["--report-path", str(report_path), "--markdown-path", str(markdown_path)])

    assert exit_code == 0
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    assert payload["ok"] is True
    assert "# Release Flow Production Readiness" in markdown_path.read_text(encoding="utf-8")

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
        "script.smoke.live_placeholder_guard",
        "script.smoke.live_image_required",
        "script.smoke.live_approval_gate",
        "script.smoke.safe_pr_evidence_inputs",
        "script.smoke.safe_pr_ready_server_verified",
        "workflow.production_gate.fail_closed",
        "workflow.production_gate.safe_pr_gate_default",
        "workflow.production_gate.safe_pr_evidence_inputs",
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

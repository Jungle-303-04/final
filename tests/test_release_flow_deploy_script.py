from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "release_flow_deploy.py"
SCRIPTS_DIR = ROOT / "scripts"


def load_deploy_module() -> Any:
    if str(SCRIPTS_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPTS_DIR))
    spec = importlib.util.spec_from_file_location("release_flow_deploy", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["release_flow_deploy"] = module
    spec.loader.exec_module(module)
    return module


class FakeClient:
    def __init__(
        self, plan: dict[str, object], *, start_run: dict[str, object] | None = None
    ) -> None:
        self.plan = plan
        self.start_run = start_run or {
            "run_id": "run-prod-1",
            "steps": [{"details": {"side_effects": True}}],
        }
        self.api_base_url = "https://release-flow.company.internal/api"
        self.calls: list[tuple[str, str, dict[str, object] | None]] = []

    def request(
        self,
        method: str,
        path: str,
        payload: dict[str, object] | None = None,
        *,
        expected: tuple[int, ...] = (200,),
    ) -> dict[str, object]:
        self.calls.append((method, path, payload))
        if path == "/auth/login":
            return {"ok": True}
        if path == "/auth/session":
            return {"authenticated": True}
        if path == "/release-plans/plan-prod":
            return {"plan": self.plan}
        if path == "/release-plans/start":
            return {"run": self.start_run}
        raise AssertionError(f"unexpected request {method} {path}")


def production_plan() -> dict[str, object]:
    return {
        "plan_id": "plan-prod",
        "name": "Production release",
        "status": "active",
        "settings": {"runtime_mode": "live", "rollback_policy": "safe_pr"},
        "steps": [
            {
                "application_id": "checkout",
                "position": 0,
                "config": {
                    "environment": "production",
                    "change_ticket": "CHG-12345",
                    "runbook_url": "https://wiki.company.internal/runbooks/checkout",
                    "post_deploy_verification_url": "https://checkout.company.internal/readyz",
                    "abort_criteria": "rollback when checkout error rate exceeds 5%",
                    "image": "ghcr.io/company/checkout:2.0.0",
                    "safe_pr_workflow_run_id": "workflow-safe-pr-1",
                    "safe_pr_url": "https://github.company.internal/org/checkout/pull/7",
                },
            }
        ],
    }


def test_release_flow_deploy_starts_valid_production_plan() -> None:
    module = load_deploy_module()
    args = module.parse_args(
        [
            "--api-base-url",
            "https://release-flow.company.internal/api",
            "--email",
            "release@company.internal",
            "--password",
            "deploy-secret-12345",
            "--plan-id",
            "plan-prod",
            "--change-ticket",
            "CHG-12345",
            "--runbook-url",
            "https://wiki.company.internal/runbooks/checkout",
            "--verification-url",
            "https://checkout.company.internal/readyz",
            "--image",
            "ghcr.io/company/checkout:2.0.0",
            "--safe-pr-workflow-run-id",
            "workflow-safe-pr-1",
            "--safe-pr-url",
            "https://github.company.internal/org/checkout/pull/7",
        ]
    )
    client = FakeClient(production_plan())

    results = module.run_deploy(client, args)

    assert all(item.ok for item in results)
    assert client.calls[-1][0:2] == ("POST", "/release-plans/start")
    assert client.calls[-1][2]["plan_id"] == "plan-prod"


def test_release_flow_deploy_refuses_demo_plan_before_start() -> None:
    module = load_deploy_module()
    plan = production_plan()
    plan["settings"] = {"runtime_mode": "demo"}
    args = module.parse_args(
        [
            "--api-base-url",
            "https://release-flow.company.internal/api",
            "--email",
            "release@company.internal",
            "--password",
            "deploy-secret-12345",
            "--plan-id",
            "plan-prod",
        ]
    )
    client = FakeClient(plan)

    results = module.run_deploy(client, args)

    assert results[-1].ok is False
    assert "runtime_mode must be live" in results[-1].detail
    assert all(path != "/release-plans/start" for _method, path, _payload in client.calls)


def test_release_flow_deploy_refuses_non_safe_pr_rollback_before_start() -> None:
    module = load_deploy_module()
    plan = production_plan()
    plan["settings"] = {"runtime_mode": "live", "rollback_policy": "disabled"}
    args = module.parse_args(
        [
            "--api-base-url",
            "https://release-flow.company.internal/api",
            "--email",
            "release@company.internal",
            "--password",
            "deploy-secret-12345",
            "--plan-id",
            "plan-prod",
        ]
    )
    client = FakeClient(plan)

    results = module.run_deploy(client, args)

    assert results[-1].ok is False
    assert "settings.rollback_policy must be safe_pr" in results[-1].detail
    assert all(path != "/release-plans/start" for _method, path, _payload in client.calls)


def test_release_flow_deploy_refuses_plan_that_does_not_match_gate_inputs() -> None:
    module = load_deploy_module()
    args = module.parse_args(
        [
            "--api-base-url",
            "https://release-flow.company.internal/api",
            "--email",
            "release@company.internal",
            "--password",
            "deploy-secret-12345",
            "--plan-id",
            "plan-prod",
            "--change-ticket",
            "CHG-12345",
            "--runbook-url",
            "https://wiki.company.internal/runbooks/checkout",
            "--verification-url",
            "https://checkout.company.internal/readyz",
            "--image",
            "ghcr.io/company/checkout:2.0.0",
            "--safe-pr-workflow-run-id",
            "workflow-safe-pr-expected",
            "--safe-pr-url",
            "https://github.company.internal/org/checkout/pull/99",
        ]
    )
    client = FakeClient(production_plan())

    results = module.run_deploy(client, args)

    assert results[-1].ok is False
    assert "safe_pr_workflow_run_id must match gated deploy input" in results[-1].detail
    assert "safe_pr_url must match gated deploy input" in results[-1].detail
    assert all(path != "/release-plans/start" for _method, path, _payload in client.calls)


def test_release_flow_deploy_refuses_placeholder_production_values_before_start() -> None:
    module = load_deploy_module()
    plan = production_plan()
    config = plan["steps"][0]["config"]
    config["change_ticket"] = "CHG-PREFLIGHT"
    config["runbook_url"] = "https://wiki.example.test/runbooks/checkout"
    config["post_deploy_verification_url"] = "http://checkout.company.test/readyz"
    config["image"] = "ghcr.io/company/checkout:latest"
    args = module.parse_args(
        [
            "--api-base-url",
            "https://release-flow.company.internal/api",
            "--email",
            "release@company.internal",
            "--password",
            "deploy-secret-12345",
            "--plan-id",
            "plan-prod",
        ]
    )
    client = FakeClient(plan)

    results = module.run_deploy(client, args)

    assert results[-1].ok is False
    assert "change_ticket must not use placeholder CHG-PREFLIGHT" in results[-1].detail
    assert "runbook_url must not use localhost or example hosts" in results[-1].detail
    assert "post_deploy_verification_url must use https" in results[-1].detail
    assert "image must not use mutable latest tag" in results[-1].detail
    assert all(path != "/release-plans/start" for _method, path, _payload in client.calls)


def test_release_flow_deploy_refuses_plan_id_mismatch_before_start() -> None:
    module = load_deploy_module()
    plan = production_plan()
    plan["plan_id"] = "plan-other"
    args = module.parse_args(
        [
            "--api-base-url",
            "https://release-flow.company.internal/api",
            "--email",
            "release@company.internal",
            "--password",
            "deploy-secret-12345",
            "--plan-id",
            "plan-prod",
        ]
    )
    client = FakeClient(plan)

    results = module.run_deploy(client, args)

    assert results[-1].ok is False
    assert "plan_id must match requested plan_id" in results[-1].detail
    assert all(path != "/release-plans/start" for _method, path, _payload in client.calls)


def test_release_flow_deploy_treats_incomplete_start_response_as_failed() -> None:
    module = load_deploy_module()
    args = module.parse_args(
        [
            "--api-base-url",
            "https://release-flow.company.internal/api",
            "--email",
            "release@company.internal",
            "--password",
            "deploy-secret-12345",
            "--plan-id",
            "plan-prod",
        ]
    )
    client = FakeClient(
        production_plan(),
        start_run={
            "run_id": "",
            "status": "failed",
            "steps": [{"status": "failed", "details": {"side_effects": False}}],
        },
    )

    results = module.run_deploy(client, args)

    assert results[-1].ok is False
    assert "must include run_id" in results[-1].detail
    assert "status must not be failed" in results[-1].detail
    assert "step 1 status must not be failed" in results[-1].detail
    assert "step 1 must confirm side_effects" in results[-1].detail


def test_release_flow_deploy_refuses_unsafe_plan_id_before_api_calls() -> None:
    module = load_deploy_module()
    args = module.parse_args(
        [
            "--api-base-url",
            "https://release-flow.company.internal/api",
            "--email",
            "release@company.internal",
            "--password",
            "deploy-secret-12345",
            "--plan-id",
            "../plan-prod",
        ]
    )
    client = FakeClient(production_plan())

    results = module.run_deploy(client, args)

    assert results == [
        module.SmokeResult(
            "release-plan.id",
            False,
            "release_plan_id must be path-safe: letters, numbers, dot, underscore, colon, or hyphen only",
        )
    ]
    assert client.calls == []


def test_release_flow_deploy_refuses_non_production_api_url_before_api_calls(
    tmp_path: Path, capsys
) -> None:
    module = load_deploy_module()
    report_path = tmp_path / "deploy.json"

    exit_code = module.main(
        [
            "--api-base-url",
            "http://localhost:8000/api",
            "--email",
            "release@company.internal",
            "--password",
            "deploy-secret-12345",
            "--plan-id",
            "plan-prod",
            "--report-path",
            str(report_path),
        ]
    )

    captured = capsys.readouterr()
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    assert exit_code == 2
    assert "api_base_url must use https" in captured.err
    assert payload["ok"] is False
    assert payload["error"] == "api_base_url must use https for production deploy"


def test_release_flow_deploy_refuses_placeholder_operator_email_before_api_calls(
    tmp_path: Path,
    capsys,
    monkeypatch,
) -> None:
    module = load_deploy_module()
    report_path = tmp_path / "deploy.json"

    def fail_client(*args, **kwargs):
        raise AssertionError("ApiClient should not be constructed for invalid deploy auth")

    monkeypatch.setattr(module, "ApiClient", fail_client)

    exit_code = module.main(
        [
            "--api-base-url",
            "https://release-flow.company.internal/api",
            "--email",
            "release-oncall@example.com",
            "--password",
            "secret",
            "--plan-id",
            "plan-prod",
            "--report-path",
            str(report_path),
        ]
    )

    captured = capsys.readouterr()
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    assert exit_code == 2
    assert "auth email must be a real operator account" in captured.err
    assert payload["ok"] is False
    assert payload["error"] == "release-flow deploy auth email must be a real operator account"


def test_release_flow_deploy_refuses_placeholder_auth_before_api_calls(
    tmp_path: Path, capsys, monkeypatch
) -> None:
    module = load_deploy_module()
    report_path = tmp_path / "deploy.json"

    def fail_client(*args, **kwargs):
        raise AssertionError("ApiClient should not be constructed for invalid deploy auth")

    monkeypatch.setattr(module, "ApiClient", fail_client)

    exit_code = module.main(
        [
            "--api-base-url",
            "https://release-flow.company.internal/api",
            "--email",
            "release@company.internal",
            "--password",
            "secret",
            "--plan-id",
            "plan-prod",
            "--report-path",
            str(report_path),
        ]
    )

    captured = capsys.readouterr()
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    assert exit_code == 2
    assert "auth password must be a non-placeholder secret" in captured.err
    assert payload["ok"] is False
    assert (
        payload["error"]
        == "release-flow deploy auth password must be a non-placeholder secret of at least 12 characters"
    )


def test_release_flow_deploy_refuses_missing_gate_evidence_before_api_calls(
    tmp_path: Path,
    capsys,
    monkeypatch,
) -> None:
    module = load_deploy_module()
    report_path = tmp_path / "deploy.json"

    def fail_client(*args, **kwargs):
        raise AssertionError("ApiClient should not be constructed without gated deploy evidence")

    monkeypatch.setattr(module, "ApiClient", fail_client)

    exit_code = module.main(
        [
            "--api-base-url",
            "https://release-flow.company.internal/api",
            "--email",
            "release@company.internal",
            "--password",
            "deploy-secret-12345",
            "--plan-id",
            "plan-prod",
            "--report-path",
            str(report_path),
        ]
    )

    captured = capsys.readouterr()
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    assert exit_code == 2
    assert "requires gated evidence inputs" in captured.err
    assert payload["ok"] is False
    assert "change ticket" in payload["error"]
    assert "Safe PR URL" in payload["error"]


def test_release_flow_deploy_refuses_placeholder_gate_evidence_before_api_calls(
    tmp_path: Path,
    capsys,
    monkeypatch,
) -> None:
    module = load_deploy_module()
    report_path = tmp_path / "deploy.json"

    def fail_client(*args, **kwargs):
        raise AssertionError("ApiClient should not be constructed with placeholder deploy evidence")

    monkeypatch.setattr(module, "ApiClient", fail_client)

    exit_code = module.main(
        [
            "--api-base-url",
            "https://release-flow.company.internal/api",
            "--email",
            "release@company.internal",
            "--password",
            "deploy-secret-12345",
            "--plan-id",
            "plan-prod",
            "--change-ticket",
            "CHG-PREFLIGHT",
            "--runbook-url",
            "https://wiki.company.internal/runbooks/checkout",
            "--verification-url",
            "https://checkout.company.internal/readyz",
            "--image",
            "ghcr.io/company/checkout:2.0.0",
            "--safe-pr-workflow-run-id",
            "workflow-safe-pr-1",
            "--safe-pr-url",
            "https://github.company.internal/org/checkout/pull/7",
            "--report-path",
            str(report_path),
        ]
    )

    captured = capsys.readouterr()
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    assert exit_code == 2
    assert "change ticket must not use placeholder CHG-PREFLIGHT" in captured.err
    assert payload["ok"] is False
    assert (
        payload["error"]
        == "release-flow deploy change ticket must not use placeholder CHG-PREFLIGHT"
    )

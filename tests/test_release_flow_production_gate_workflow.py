from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "release-flow-production-gate.yml"


def load_workflow() -> dict:
    return yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))


def test_release_flow_production_gate_is_manual_and_reusable() -> None:
    workflow = load_workflow()

    assert workflow["name"] == "Release Flow Production Gate"
    assert workflow["run-name"] == (
        "Release Flow Gate / ${{ inputs.github_environment || 'production' }} / "
        "${{ inputs.release_plan_id || 'all-plans' }}"
    )
    assert set(workflow["on"]) == {"workflow_dispatch", "workflow_call"}
    assert workflow["permissions"] == {"contents": "read"}


def test_release_flow_production_gate_declares_operational_inputs() -> None:
    workflow = load_workflow()
    dispatch_inputs = workflow["on"]["workflow_dispatch"]["inputs"]
    call_inputs = workflow["on"]["workflow_call"]["inputs"]
    call_secrets = workflow["on"]["workflow_call"]["secrets"]

    expected_inputs = {
        "api_base_url",
        "alert_preflight",
        "alert_severity",
        "artifact_retention_days",
        "github_environment",
        "live_change_ticket",
        "live_approval_gate",
        "live_environment",
        "live_image",
        "live_namespace",
        "live_oncall_contact",
        "live_preflight",
        "live_release_owner",
        "live_runbook_url",
        "live_safe_pr_url",
        "live_safe_pr_workflow_run_id",
        "live_verification_url",
        "production_preflight_run_limit",
        "release_plan_id",
        "request_timeout_seconds",
        "retry_attempts",
        "retry_delay_seconds",
    }
    assert set(dispatch_inputs) == expected_inputs
    assert set(call_inputs) == expected_inputs
    assert dispatch_inputs["live_preflight"]["default"] is True
    assert call_inputs["live_preflight"]["default"] is True
    assert dispatch_inputs["live_approval_gate"]["default"] == "safe_pr"
    assert call_inputs["live_approval_gate"]["default"] == "safe_pr"
    assert "default" not in dispatch_inputs["live_change_ticket"]
    assert "default" not in call_inputs["live_change_ticket"]
    assert "default" not in dispatch_inputs["live_runbook_url"]
    assert "default" not in call_inputs["live_runbook_url"]
    assert dispatch_inputs["github_environment"]["default"] == "production"
    assert call_inputs["github_environment"]["default"] == "production"
    assert dispatch_inputs["production_preflight_run_limit"]["default"] == "20"
    assert dispatch_inputs["retry_attempts"]["default"] == "5"
    assert dispatch_inputs["retry_delay_seconds"]["default"] == "2"
    assert set(call_secrets) == {
        "RELEASE_FLOW_API_BASE_URL",
        "RELEASE_FLOW_AUTH_EMAIL",
        "RELEASE_FLOW_AUTH_PASSWORD",
    }


def test_release_flow_production_gate_call_secrets_have_no_case_insensitive_duplicates() -> None:
    secrets = load_workflow()["on"]["workflow_call"]["secrets"]

    normalized = [name.casefold() for name in secrets]

    assert len(normalized) == len(set(normalized))


def test_release_flow_production_gate_calls_smoke_workflow_with_real_guardrails() -> None:
    workflow = load_workflow()
    validate_job = workflow["jobs"]["validate_production_gate_inputs"]
    smoke_job = workflow["jobs"]["release_flow_smoke"]

    validate_step = validate_job["steps"][0]
    assert validate_job["outputs"]["production_gate_inputs_ok"] == (
        "${{ steps.validate.outputs.production_gate_inputs_ok }}"
    )
    assert validate_step["id"] == "validate"
    assert "live_preflight must be true for production release gates" in validate_step["run"]
    assert "live_change_ticket is required for production live_preflight" in validate_step["run"]
    assert "Replace CHG-PREFLIGHT with the real production change ticket" in validate_step["run"]
    assert "live_runbook_url is required for production live_preflight" in validate_step["run"]
    assert "live_runbook_url must use https for production live_preflight" in validate_step["run"]
    assert "live_runbook_url must not use localhost or example hosts" in validate_step["run"]
    assert validate_job["env"]["LIVE_PREFLIGHT_IMAGE"] == "${{ inputs.live_image }}"
    assert "live_image is required for production live_preflight" in validate_step["run"]
    assert (
        "Replace ghcr.io/example/release-flow-smoke:live-preflight with the real production image"
        in validate_step["run"]
    )
    assert (
        validate_job["env"]["LIVE_PREFLIGHT_VERIFICATION_URL"]
        == "${{ inputs.live_verification_url }}"
    )
    assert "live_verification_url is required for production live_preflight" in validate_step["run"]
    assert (
        "live_verification_url must use https for production live_preflight" in validate_step["run"]
    )
    assert "live_verification_url must not use localhost or example hosts" in validate_step["run"]
    assert "live_release_owner or live_oncall_contact is required" in validate_step["run"]
    assert "Replace release-operator with the real production owner" in validate_step["run"]
    assert (
        "Replace release-oncall@example.com with the real on-call contact" in validate_step["run"]
    )
    assert (
        validate_job["env"]["LIVE_PREFLIGHT_APPROVAL_GATE"]
        == "${{ inputs.live_approval_gate || 'safe_pr' }}"
    )
    assert (
        validate_job["env"]["LIVE_PREFLIGHT_SAFE_PR_WORKFLOW_RUN_ID"]
        == "${{ inputs.live_safe_pr_workflow_run_id }}"
    )
    assert validate_job["env"]["LIVE_PREFLIGHT_SAFE_PR_URL"] == "${{ inputs.live_safe_pr_url }}"
    assert (
        "live_safe_pr_workflow_run_id is required when live_approval_gate is safe_pr"
        in validate_step["run"]
    )
    assert "live_safe_pr_url is required when live_approval_gate is safe_pr" in validate_step["run"]
    assert (
        "live_safe_pr_url must use https when live_approval_gate is safe_pr" in validate_step["run"]
    )
    assert (
        "live_safe_pr_url must not use localhost or example hosts when live_approval_gate is safe_pr"
        in validate_step["run"]
    )
    assert "production_gate_inputs_ok=true" in validate_step["run"]
    assert smoke_job["needs"] == "validate_production_gate_inputs"
    assert smoke_job["uses"] == "./.github/workflows/release-flow-smoke.yml"
    assert smoke_job["with"]["production_preflight_plan_id"] == "${{ inputs.release_plan_id }}"
    assert smoke_job["with"]["production_preflight_run_limit"] == (
        "${{ inputs.production_preflight_run_limit || '20' }}"
    )
    assert (
        smoke_job["with"]["github_environment"]
        == "${{ inputs.github_environment || 'production' }}"
    )
    assert (
        smoke_job["with"]["artifact_name"]
        == "release-flow-smoke-${{ inputs.github_environment || 'production' }}"
    )
    assert smoke_job["with"]["alert_preflight"] == "${{ inputs.alert_preflight || false }}"
    assert smoke_job["with"]["live_preflight"] == "${{ inputs.live_preflight }}"
    assert (
        smoke_job["with"]["live_approval_gate"] == "${{ inputs.live_approval_gate || 'safe_pr' }}"
    )
    assert smoke_job["with"]["live_change_ticket"] == "${{ inputs.live_change_ticket }}"
    assert smoke_job["with"]["live_runbook_url"] == "${{ inputs.live_runbook_url }}"
    assert smoke_job["with"]["live_release_owner"] == "${{ inputs.live_release_owner }}"
    assert smoke_job["with"]["live_oncall_contact"] == "${{ inputs.live_oncall_contact }}"
    assert smoke_job["with"]["live_image"] == "${{ inputs.live_image }}"
    assert smoke_job["with"]["live_safe_pr_workflow_run_id"] == (
        "${{ inputs.live_safe_pr_workflow_run_id }}"
    )
    assert smoke_job["with"]["live_safe_pr_url"] == "${{ inputs.live_safe_pr_url }}"
    assert smoke_job["secrets"]["RELEASE_FLOW_API_BASE_URL"] == (
        "${{ secrets.RELEASE_FLOW_API_BASE_URL }}"
    )
    assert smoke_job["secrets"]["RELEASE_FLOW_AUTH_EMAIL"] == (
        "${{ secrets.RELEASE_FLOW_AUTH_EMAIL }}"
    )
    assert smoke_job["secrets"]["RELEASE_FLOW_AUTH_PASSWORD"] == (
        "${{ secrets.RELEASE_FLOW_AUTH_PASSWORD }}"
    )


def test_release_flow_production_gate_fails_deploy_when_smoke_failed() -> None:
    workflow = load_workflow()
    workflow_call = workflow["on"]["workflow_call"]
    gate_job = workflow["jobs"]["production_gate"]
    gate_step = gate_job["steps"][0]

    assert workflow_call["outputs"]["release_gate_ok"]["value"] == (
        "${{ jobs.production_gate.outputs.release_gate_ok }}"
    )
    assert workflow_call["outputs"]["release_smoke_failed_checks"]["value"] == (
        "${{ jobs.release_flow_smoke.outputs.release_smoke_failed_checks }}"
    )
    assert gate_job["needs"] == "release_flow_smoke"
    assert gate_job["if"] == "always()"
    assert (
        gate_job["outputs"]["release_gate_ok"]
        == "${{ steps.production_gate.outputs.release_gate_ok }}"
    )
    assert gate_step["id"] == "production_gate"
    assert (
        gate_step["env"]["RELEASE_SMOKE_OK"]
        == "${{ needs.release_flow_smoke.outputs.release_smoke_ok }}"
    )
    assert "release_gate_ok=true" in gate_step["run"]
    assert "release_gate_ok=false" in gate_step["run"]
    assert "RELEASE_SMOKE_FAILED_CHECKS" in gate_step["run"]
    assert "release-flow production gate failed" in gate_step["run"]
    assert "exit 1" in gate_step["run"]

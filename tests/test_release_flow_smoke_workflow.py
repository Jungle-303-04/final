from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "release-flow-smoke.yml"


def load_workflow() -> dict:
    return yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))


def test_release_flow_smoke_workflow_is_manual_and_read_only() -> None:
    workflow = load_workflow()

    assert workflow["name"] == "Release Flow Smoke"
    assert set(workflow["on"]) == {"workflow_dispatch", "workflow_call"}
    assert workflow["permissions"] == {"contents": "read"}


def test_release_flow_smoke_workflow_declares_operator_inputs_and_secrets_for_dispatch() -> None:
    workflow = load_workflow()
    inputs = workflow["on"]["workflow_dispatch"]["inputs"]
    job = workflow["jobs"]["release_flow_smoke"]

    assert set(inputs) == {
        "api_base_url",
        "alert_preflight",
        "alert_severity",
        "artifact_retention_days",
        "github_environment",
        "live_change_ticket",
        "live_environment",
        "live_image",
        "live_namespace",
        "live_preflight",
        "live_verification_url",
        "production_preflight_plan_id",
        "production_preflight_run_limit",
    }
    assert inputs["production_preflight_run_limit"]["default"] == "20"
    assert inputs["github_environment"]["default"] == "production"
    assert inputs["artifact_retention_days"]["default"] == "30"
    assert inputs["alert_preflight"]["default"] is False
    assert inputs["alert_severity"]["default"] == "warning"
    assert inputs["alert_severity"]["options"] == ["info", "warning", "critical"]
    assert inputs["live_preflight"]["default"] is False
    assert inputs["live_environment"]["default"] == "production"
    assert inputs["live_namespace"]["default"] == "production"
    assert inputs["live_change_ticket"]["default"] == "CHG-PREFLIGHT"
    assert (
        job["env"]["API_BASE_URL"]
        == "${{ inputs.api_base_url || secrets.release_flow_api_base_url || secrets.RELEASE_FLOW_API_BASE_URL }}"
    )
    assert job["env"]["AUTH_EMAIL"] == "${{ secrets.release_flow_auth_email || secrets.RELEASE_FLOW_AUTH_EMAIL }}"
    assert (
        job["env"]["AUTH_PASSWORD"]
        == "${{ secrets.release_flow_auth_password || secrets.RELEASE_FLOW_AUTH_PASSWORD }}"
    )
    assert job["env"]["PRODUCTION_PREFLIGHT_RUN_LIMIT"] == "${{ inputs.production_preflight_run_limit || '20' }}"
    assert job["env"]["ARTIFACT_RETENTION_DAYS"] == "${{ inputs.artifact_retention_days || '30' }}"
    assert job["env"]["ALERT_PREFLIGHT"] == "${{ inputs.alert_preflight || false }}"
    assert job["env"]["ALERT_PREFLIGHT_SEVERITY"] == "${{ inputs.alert_severity || 'warning' }}"
    assert job["env"]["LIVE_PREFLIGHT"] == "${{ inputs.live_preflight || false }}"
    assert job["env"]["LIVE_PREFLIGHT_ENVIRONMENT"] == "${{ inputs.live_environment || 'production' }}"
    assert job["env"]["LIVE_PREFLIGHT_NAMESPACE"] == "${{ inputs.live_namespace || 'production' }}"
    assert job["env"]["LIVE_PREFLIGHT_CHANGE_TICKET"] == "${{ inputs.live_change_ticket || 'CHG-PREFLIGHT' }}"
    assert job["env"]["LIVE_PREFLIGHT_IMAGE"] == "${{ inputs.live_image }}"
    assert job["env"]["LIVE_PREFLIGHT_VERIFICATION_URL"] == "${{ inputs.live_verification_url }}"


def test_release_flow_smoke_workflow_can_be_called_by_deploy_workflows() -> None:
    workflow = load_workflow()
    workflow_call = workflow["on"]["workflow_call"]

    assert set(workflow_call["inputs"]) == {
        "api_base_url",
        "alert_preflight",
        "alert_severity",
        "artifact_retention_days",
        "github_environment",
        "live_change_ticket",
        "live_environment",
        "live_image",
        "live_namespace",
        "live_preflight",
        "live_verification_url",
        "production_preflight_plan_id",
        "production_preflight_run_limit",
    }
    assert set(workflow_call["secrets"]) == {
        "release_flow_api_base_url",
        "release_flow_auth_email",
        "release_flow_auth_password",
    }
    assert workflow_call["inputs"]["production_preflight_run_limit"]["default"] == "20"
    assert workflow_call["inputs"]["github_environment"]["default"] == "production"
    assert workflow_call["inputs"]["artifact_retention_days"]["default"] == "30"
    assert workflow_call["inputs"]["alert_preflight"]["default"] is False
    assert workflow_call["inputs"]["alert_severity"]["default"] == "warning"
    assert workflow_call["inputs"]["live_preflight"]["default"] is False
    assert workflow_call["inputs"]["live_environment"]["default"] == "production"
    assert workflow_call["inputs"]["live_namespace"]["default"] == "production"
    assert workflow_call["inputs"]["live_change_ticket"]["default"] == "CHG-PREFLIGHT"
    assert workflow_call["outputs"]["release_smoke_ok"]["value"] == (
        "${{ jobs.release_flow_smoke.outputs.release_smoke_ok }}"
    )
    assert workflow_call["outputs"]["release_smoke_failed_checks"]["value"] == (
        "${{ jobs.release_flow_smoke.outputs.release_smoke_failed_checks }}"
    )
    assert workflow_call["outputs"]["release_smoke_error"]["value"] == (
        "${{ jobs.release_flow_smoke.outputs.release_smoke_error }}"
    )


def test_release_flow_smoke_workflow_uploads_artifacts_before_failing_gate() -> None:
    workflow = load_workflow()
    job = workflow["jobs"]["release_flow_smoke"]
    steps = job["steps"]
    smoke_step = next(step for step in steps if step.get("id") == "release_flow_smoke")
    upload_step = next(step for step in steps if step["name"] == "Upload release-flow smoke artifacts")
    fail_step = next(step for step in steps if step["name"] == "Fail when release-flow smoke failed")
    validate_step = next(step for step in steps if step["name"] == "Validate workflow inputs")

    assert job["environment"] == "${{ inputs.github_environment || 'production' }}"
    assert job["concurrency"] == {
        "group": "release-flow-smoke-${{ inputs.github_environment || 'production' }}",
        "cancel-in-progress": False,
    }
    assert smoke_step["continue-on-error"] is True
    assert "--production-preflight" in smoke_step["run"]
    assert "smoke_args=(" in smoke_step["run"]
    assert "--live-preflight" in smoke_step["run"]
    assert "--live-environment" in smoke_step["run"]
    assert "--live-namespace" in smoke_step["run"]
    assert "--live-change-ticket" in smoke_step["run"]
    assert "--live-image" in smoke_step["run"]
    assert "--live-verification-url" in smoke_step["run"]
    assert 'smoke_args+=(--alert-preflight --alert-severity "${ALERT_PREFLIGHT_SEVERITY}")' in smoke_step["run"]
    assert "--retry-attempts 5" in smoke_step["run"]
    assert "--ci" in smoke_step["run"]
    assert "--ci-artifacts-dir artifacts/release-flow" in smoke_step["run"]

    assert "production_preflight_run_limit must be an integer between 1 and 500" in validate_step["run"]
    assert "production_preflight_run_limit must be between 1 and 500" in validate_step["run"]
    assert "artifact_retention_days must be an integer between 1 and 90" in validate_step["run"]
    assert "artifact_retention_days must be between 1 and 90" in validate_step["run"]
    assert "alert_severity must be one of info, warning, or critical" in validate_step["run"]
    assert "live_environment must be a Kubernetes-style DNS label" in validate_step["run"]
    assert "live_namespace must be a Kubernetes-style DNS label" in validate_step["run"]
    assert "live_change_ticket is required when live_preflight is enabled" in validate_step["run"]

    assert upload_step["if"] == "always()"
    assert upload_step["uses"] == "actions/upload-artifact@v4"
    assert upload_step["with"]["path"] == "artifacts/release-flow"
    assert upload_step["with"]["retention-days"] == "${{ env.ARTIFACT_RETENTION_DAYS }}"

    assert fail_step["if"] == "steps.release_flow_smoke.outputs.release_smoke_ok != 'true'"
    assert "exit 1" in fail_step["run"]

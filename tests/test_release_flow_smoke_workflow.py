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
    assert set(workflow["on"]) == {"workflow_dispatch"}
    assert workflow["permissions"] == {"contents": "read"}


def test_release_flow_smoke_workflow_declares_operator_inputs_and_secrets() -> None:
    workflow = load_workflow()
    inputs = workflow["on"]["workflow_dispatch"]["inputs"]
    job = workflow["jobs"]["release-flow-smoke"]

    assert set(inputs) == {
        "api_base_url",
        "production_preflight_plan_id",
        "production_preflight_run_limit",
    }
    assert inputs["production_preflight_run_limit"]["default"] == "20"
    assert job["env"]["API_BASE_URL"] == "${{ inputs.api_base_url || secrets.RELEASE_FLOW_API_BASE_URL }}"
    assert job["env"]["AUTH_EMAIL"] == "${{ secrets.RELEASE_FLOW_AUTH_EMAIL }}"
    assert job["env"]["AUTH_PASSWORD"] == "${{ secrets.RELEASE_FLOW_AUTH_PASSWORD }}"


def test_release_flow_smoke_workflow_uploads_artifacts_before_failing_gate() -> None:
    workflow = load_workflow()
    steps = workflow["jobs"]["release-flow-smoke"]["steps"]
    smoke_step = next(step for step in steps if step.get("id") == "release_flow_smoke")
    upload_step = next(step for step in steps if step["name"] == "Upload release-flow smoke artifacts")
    fail_step = next(step for step in steps if step["name"] == "Fail when release-flow smoke failed")

    assert smoke_step["continue-on-error"] is True
    assert "--production-preflight" in smoke_step["run"]
    assert "--retry-attempts 5" in smoke_step["run"]
    assert "--ci" in smoke_step["run"]
    assert "--ci-artifacts-dir artifacts/release-flow" in smoke_step["run"]

    assert upload_step["if"] == "always()"
    assert upload_step["uses"] == "actions/upload-artifact@v4"
    assert upload_step["with"]["path"] == "artifacts/release-flow"

    assert fail_step["if"] == "steps.release_flow_smoke.outputs.release_smoke_ok != 'true'"
    assert "exit 1" in fail_step["run"]

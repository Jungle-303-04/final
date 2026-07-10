from __future__ import annotations

from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "release-flow-production-deploy.yml"


def load_workflow() -> dict:
    return yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))


def test_production_deploy_workflow_calls_gate_before_starting_release() -> None:
    workflow = load_workflow()
    jobs = workflow["jobs"]
    gate = jobs["release_flow_production_gate"]
    deploy = jobs["deploy-production"]

    assert gate["uses"] == "./.github/workflows/release-flow-production-gate.yml"
    assert gate["with"]["live_preflight"] is True
    assert gate["with"]["live_approval_gate"] == "safe_pr"
    assert gate["with"]["live_safe_pr_workflow_run_id"] == "${{ inputs.live_safe_pr_workflow_run_id }}"
    assert gate["with"]["live_safe_pr_url"] == "${{ inputs.live_safe_pr_url }}"
    assert gate["secrets"] == "inherit"

    assert deploy["needs"] == "release_flow_production_gate"
    assert deploy["if"] == "needs.release_flow_production_gate.outputs.release_gate_ok == 'true'"
    assert deploy["environment"] == "${{ inputs.github_environment || 'production' }}"

    deploy_step = next(step for step in deploy["steps"] if step["name"] == "Start release-flow production run")
    assert "python scripts/release_flow_deploy.py" in deploy_step["run"]
    assert 'RELEASE_FLOW_DEPLOY_PLAN_ID" \\' in deploy_step["run"]
    assert deploy_step["env"]["RELEASE_FLOW_AUTH_EMAIL"] == "${{ secrets.RELEASE_FLOW_AUTH_EMAIL }}"
    assert deploy_step["env"]["RELEASE_FLOW_AUTH_PASSWORD"] == "${{ secrets.RELEASE_FLOW_AUTH_PASSWORD }}"


def test_production_deploy_workflow_exposes_required_inputs() -> None:
    workflow = load_workflow()
    inputs = workflow["on"]["workflow_dispatch"]["inputs"]

    for name in (
        "release_plan_id",
        "live_change_ticket",
        "live_runbook_url",
        "live_image",
        "live_verification_url",
        "live_safe_pr_workflow_run_id",
        "live_safe_pr_url",
    ):
        assert inputs[name]["required"] is True

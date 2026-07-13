from __future__ import annotations

from datetime import UTC, datetime

import pytest

from domains.gitops.repository import serialize_workflow_run
from packages.config.constants import CommandStatus
from packages.contracts.gateway.responses import WorkflowRunListResponse
from packages.contracts.gitops import promotion_gate_from_command_result


@pytest.mark.parametrize(
    ("result", "eligible", "failed_resource_count", "rollout_ready"),
    [
        ({"status": CommandStatus.COMPLETED}, True, 0, None),
        ({"status": CommandStatus.FAILED, "applied": True}, False, 0, None),
        ({"status": CommandStatus.COMPLETED, "applied": False}, False, 0, None),
        (
            {
                "status": CommandStatus.COMPLETED,
                "applied": True,
                "resources": [{"name": "checkout", "status": "failed"}],
            },
            False,
            1,
            None,
        ),
        (
            {
                "status": CommandStatus.COMPLETED,
                "applied": True,
                "rollout": {"ready": False},
            },
            False,
            0,
            False,
        ),
        (
            {
                "status": CommandStatus.COMPLETED,
                "applied": True,
                "resources": [{"name": "checkout", "status": "completed"}],
                "rollout": {"ready": True},
            },
            True,
            0,
            True,
        ),
    ],
)
def test_promotion_gate_matches_current_command_success_contract(
    result: dict[str, object],
    eligible: bool,
    failed_resource_count: int,
    rollout_ready: bool | None,
) -> None:
    gate = promotion_gate_from_command_result(result)

    assert gate["eligible"] is eligible
    assert gate["failed_resource_count"] == failed_resource_count
    assert gate["rollout_ready"] is rollout_ready
    assert gate["command_completed"] is (result["status"] == CommandStatus.COMPLETED)
    assert gate["applied_not_false"] is (result.get("applied") is not False)
    assert gate["rollout_ready_not_false"] is (rollout_ready is not False)


def test_workflow_run_serialization_exposes_structured_promotion_gate() -> None:
    now = datetime.now(UTC)
    run = serialize_workflow_run(
        {
            "workflow_run_id": "run-1",
            "workspace_id": "ws-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "environment": "staging",
            "cluster_id": "cluster-1",
            "commit_sha": "abc123",
            "status": "succeeded",
            "current_step": "health",
            "summary": "rollout complete",
            "command_id": "cmd-1",
            "metadata": {
                "result": {
                    "status": CommandStatus.COMPLETED,
                    "applied": True,
                    "resources": [{"name": "checkout", "status": "completed"}],
                    "rollout": {"ready": True},
                }
            },
            "created_at": now,
            "updated_at": now,
        }
    )

    payload = WorkflowRunListResponse(runs=[run]).model_dump(mode="json")
    gate = payload["runs"][0]["promotion_gate"]

    assert gate == {
        "eligible": True,
        "command_status": CommandStatus.COMPLETED,
        "command_completed": True,
        "applied": True,
        "applied_not_false": True,
        "failed_resources": [],
        "failed_resource_count": 0,
        "rollout_ready": True,
        "rollout_ready_not_false": True,
    }


def test_workflow_run_response_keeps_existing_dynamic_fields() -> None:
    payload = WorkflowRunListResponse(
        runs=[{"workflow_run_id": "run-legacy", "future_additive_field": "kept"}]
    ).model_dump()

    assert payload["runs"][0]["future_additive_field"] == "kept"
    assert payload["runs"][0]["promotion_gate"] is None

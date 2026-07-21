from __future__ import annotations

from datetime import UTC, datetime

import pytest

from domains.gitops.repository import serialize_workflow_run
from packages.config.constants import CommandStatus
from packages.contracts.gateway.responses import (
    ResourceManifestApproveResponse,
    ResourceManifestPreviewResponse,
    WorkflowRunListResponse,
)
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


def test_workflow_run_schema_links_structured_promotion_gate() -> None:
    schema = WorkflowRunListResponse.model_json_schema()

    run_schema = schema["$defs"]["WorkflowRunItemResponse"]
    gate_schema = schema["$defs"]["PromotionGateResponse"]
    assert "promotion_gate" in run_schema["properties"]
    assert set(gate_schema["required"]) >= {
        "eligible",
        "command_status",
        "command_completed",
        "applied_not_false",
        "rollout_ready_not_false",
    }


@pytest.mark.parametrize(
    "result",
    [
        # Git 감지/manifest validation만 끝나고 K8s apply를 실행하지 않은 명령 결과.
        {"status": CommandStatus.COMPLETED},
        {
            "status": CommandStatus.COMPLETED,
            "resources": [{"name": "checkout", "status": "completed"}],
        },
    ],
)
def test_completed_command_without_apply_never_reports_applied_or_rollout(
    result: dict[str, object],
) -> None:
    """검증/감지 완료(COMPLETED)만으로 applied·rollout이 참이 되지 않는다.

    명령이 완료되고 실패 리소스가 없어 ``eligible``/``*_not_false``는 참일 수 있으나,
    실제 Kubernetes apply·rollout 상태는 '실행 안 됨'을 뜻하는 ``None``으로 정직하게
    유지되어야 한다(거짓 True 금지). 프론트 표시는 ``eligible``/``command_completed``가
    아니라 ``applied``/``rollout_ready``를 apply·rollout 상태의 근거로 써야 한다.
    """
    gate = promotion_gate_from_command_result(result)

    assert gate["command_completed"] is True
    assert gate["applied"] is None
    assert gate["applied"] is not True
    assert gate["rollout_ready"] is None
    assert gate["rollout_ready"] is not True


def test_applied_state_is_distinct_none_false_true() -> None:
    """apply 상태 3분리: 미실행(None) / 실패(False) / 성공(True)."""
    not_run = promotion_gate_from_command_result({"status": CommandStatus.COMPLETED})
    failed = promotion_gate_from_command_result(
        {"status": CommandStatus.COMPLETED, "applied": False}
    )
    applied = promotion_gate_from_command_result(
        {"status": CommandStatus.COMPLETED, "applied": True}
    )

    assert not_run["applied"] is None
    assert not_run["applied_not_false"] is True  # 미실행은 실패와 다르다

    assert failed["applied"] is False
    assert failed["applied_not_false"] is False
    assert failed["eligible"] is False  # apply 실패는 절대 eligible이 아니다

    assert applied["applied"] is True
    assert applied["applied_not_false"] is True


def test_rollout_state_is_distinct_none_false_true() -> None:
    """rollout 상태 3분리: 미검증(None) / 미완(False) / 완료(True)."""
    not_verified = promotion_gate_from_command_result(
        {"status": CommandStatus.COMPLETED, "applied": True}
    )
    not_ready = promotion_gate_from_command_result(
        {"status": CommandStatus.COMPLETED, "applied": True, "rollout": {"ready": False}}
    )
    ready = promotion_gate_from_command_result(
        {"status": CommandStatus.COMPLETED, "applied": True, "rollout": {"ready": True}}
    )

    assert not_verified["rollout_ready"] is None
    assert not_verified["rollout_ready_not_false"] is True

    assert not_ready["rollout_ready"] is False
    assert not_ready["rollout_ready_not_false"] is False
    assert not_ready["eligible"] is False  # rollout 미완은 절대 eligible이 아니다

    assert ready["rollout_ready"] is True
    assert ready["eligible"] is True


def test_manifest_preview_reports_validation_not_apply_success() -> None:
    """manifest preview는 validation(valid)·apply 가용성만 노출하고 apply 성공을 주장하지 않는다."""
    preview = ResourceManifestPreviewResponse(
        valid=True,
        changed=True,
        base_sha="base",
        source_sha256="source",
        desired_sha256="desired",
        diff="--- a\n+++ b\n",
        apply_availability="available",
    )
    dumped = preview.model_dump()

    assert dumped["valid"] is True
    # apply는 '가능'할 뿐 '적용됨'이 아니다. preview 계약에 applied/rollout 필드가 없다.
    assert dumped["apply_availability"] == "available"
    assert "applied" not in dumped
    assert "rollout_ready" not in dumped


def test_manifest_approve_is_pending_safe_pr_not_applied() -> None:
    """Safe PR approve는 PR 병합 대기 상태이며 apply 성공이 아니다."""
    approve = ResourceManifestApproveResponse(
        accepted=True,
        event_id="event-1",
        correlation_id="corr-1",
        workflow_run_id="run-1",
        approval_id="approval-1",
    )
    dumped = approve.model_dump()

    assert dumped["sync_state"] == "awaiting_pr_merge"
    # 승인(=PR 대기)은 apply/rollout 성공을 뜻하지 않는다.
    assert "applied" not in dumped
    assert "rollout_ready" not in dumped

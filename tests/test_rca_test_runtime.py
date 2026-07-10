"""RCA test-run runtime RED contract.

The scenario catalog is the server-owned source of truth.  A Bruno caller sends
only ``cluster_id`` and ``scenario_id``; the runtime derives stable identifiers,
asks the target agent to create and *observe* the real fault, schedules a scoped
Kubernetes evidence job after command completion, and projects the existing
tables into one readable run status.
"""

from __future__ import annotations

import importlib
import json
from collections.abc import Mapping
from typing import Any

from conftest import load_service, run_handler

from domains.command.events import CommandCompletedBody
from domains.target.events import EvidenceJobsQueuedBody
from domains.target.evidence_jobs import aggregate_evidence_payload
from packages.config.constants import CommandStatus

RUN_ID = "72b5f320-46e9-4db8-90ad-423f7542e13e"
NEWER_RUN_ID = "a8c4fa58-cbd1-4dbd-9251-aedb8db52993"
CORRELATION_ID = f"corr-rca-test-{RUN_ID}"
INJECT_COMMAND_ID = f"cmd-rca-test-inject-{RUN_ID}"
CLEANUP_COMMAND_ID = f"cmd-rca-test-cleanup-{RUN_ID}"
SCENARIO_ID = "image.wrong-tag"
WORKSPACE_ID = "workspace-1"
CLUSTER_ID = "cluster-1"
RESOURCE_NAME = "rca-test-image-wrong-tag"
RUN_LABEL = f"kubeheal.io/rca-test-run={RUN_ID}"


def _runtime() -> Any:
    """Import lazily so unrelated RED cases still collect and execute."""
    return importlib.import_module("domains.rca.test_runtime")


def _body(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        return dict(value)
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "to_body"):
        return value.to_body()
    if hasattr(value, "__dict__"):
        return dict(value.__dict__)
    raise TypeError(f"unsupported runtime value: {type(value)!r}")


def _step_statuses(status: Mapping[str, Any]) -> dict[str, str]:
    return {
        str(item["step"]): str(item["status"])
        for item in status["steps"]
        if isinstance(item, Mapping)
    }


def test_run_identity_derives_stable_command_and_correlation_ids() -> None:
    runtime = _runtime()

    first = _body(runtime.rca_test_run_identity(RUN_ID))
    second = _body(runtime.rca_test_run_identity(RUN_ID))

    assert first == second
    assert first == {
        "run_id": RUN_ID,
        "correlation_id": CORRELATION_ID,
        "inject_command_id": INJECT_COMMAND_ID,
        "cleanup_command_id": CLEANUP_COMMAND_ID,
        "evidence_source_id": "rca-test",
        "evidence_window_start": RUN_ID,
    }


def test_inject_plan_is_allowlisted_and_contains_no_raw_manifest_or_shell() -> None:
    runtime = _runtime()

    plan = runtime.build_rca_test_inject_plan(
        run_id=RUN_ID,
        scenario_id=SCENARIO_ID,
        scenario_version=1,
        cluster_id=CLUSTER_ID,
        workspace_id=WORKSPACE_ID,
        requested_by="developer-1",
    )

    assert plan["command_id"] == INJECT_COMMAND_ID
    assert plan["action"] == "rca.test.inject"
    assert plan["action"] in runtime.RCA_TEST_AGENT_ACTIONS
    assert plan["namespace"] == "sandbox"
    assert plan["environment"] == "sandbox"
    assert plan["payload"] == {
        "run_id": RUN_ID,
        "scenario_id": SCENARIO_ID,
        "scenario_version": 1,
    }
    serialized = json.dumps(plan, sort_keys=True).casefold()
    assert "manifest" not in serialized
    assert "kubectl" not in serialized
    assert "shell" not in serialized


class _ReleaseFlowDb:
    def __init__(self) -> None:
        self.queued: list[dict[str, Any]] = []
        self.projected: list[dict[str, Any]] = []

    async def queue_evidence_jobs(self, **kwargs: Any) -> dict[str, Any]:
        self.queued.append(kwargs)
        return {
            "accepted": True,
            "evidence_key": (
                f"{kwargs['workspace_id']}:{kwargs['cluster_id']}:"
                f"{kwargs['source_id']}:{kwargs['window_start']}"
            ),
            "queued": len(kwargs["provider_keys"]),
            "job_ids": [f"job-{key}" for key in kwargs["provider_keys"]],
        }

    async def project_release_workflow_event(
        self, payload: dict[str, Any]
    ) -> dict[str, Any] | None:
        self.projected.append(payload)
        return None


def _fault_observed_result() -> dict[str, Any]:
    return {
        "status": CommandStatus.COMPLETED,
        "applied": True,
        "workspace_id": WORKSPACE_ID,
        "cluster_id": CLUSTER_ID,
        "message": "RCA test fault observed",
        "rca_test": {
            "run_id": RUN_ID,
            "scenario_id": SCENARIO_ID,
            "scenario_version": 1,
            "fault_observed": True,
            "namespace": "sandbox",
            "resource_kind": "Deployment",
            "resource_name": RESOURCE_NAME,
            "label_selector": RUN_LABEL,
            "waiting_reasons": ["ErrImagePull", "ImagePullBackOff"],
            "event_message_matches": ["not found"],
        },
    }


def test_fault_observed_completion_queues_scoped_kubernetes_evidence_job() -> None:
    worker = load_service("projection/release-flow-worker")
    db = _ReleaseFlowDb()
    completed = CommandCompletedBody(
        command_id=INJECT_COMMAND_ID,
        result=_fault_observed_result(),
    )

    outputs = run_handler(
        worker.on_event,
        completed,
        db,
        subject=str(CommandCompletedBody.__subject__),
        correlation_id=CORRELATION_ID,
    )

    assert len(db.queued) == 1
    request = db.queued[0]
    assert request["workspace_id"] == WORKSPACE_ID
    assert request["cluster_id"] == CLUSTER_ID
    assert request["source_id"] == "rca-test"
    assert request["window_start"] == RUN_ID
    assert request["provider_keys"] == ["kubernetes"]
    assert request["failure_policy"] == "strict"

    provider_policy = request["provider_policies"]["kubernetes"]
    assert [query["query"] for query in provider_policy["queries"]] == ["sandbox"]
    assert provider_policy["release_context"] == {
        "correlation_id": CORRELATION_ID,
        "rca_test_run_id": RUN_ID,
        "scenario_id": SCENARIO_ID,
        "namespace": "sandbox",
        "resource_kind": "Deployment",
        "resource_name": RESOURCE_NAME,
        "label_selector": RUN_LABEL,
        "evidence_scope": "rca_test_run",
    }
    assert any(isinstance(item, EvidenceJobsQueuedBody) for item in outputs)


def test_evidence_aggregation_promotes_release_context_and_same_correlation() -> None:
    release_context = {
        "correlation_id": CORRELATION_ID,
        "rca_test_run_id": RUN_ID,
        "scenario_id": SCENARIO_ID,
        "namespace": "sandbox",
        "resource_kind": "Deployment",
        "resource_name": RESOURCE_NAME,
        "label_selector": RUN_LABEL,
        "evidence_scope": "rca_test_run",
    }

    payload = aggregate_evidence_payload(
        [
            {
                "workspace_id": WORKSPACE_ID,
                "cluster_id": CLUSTER_ID,
                "source_id": "rca-test",
                "window_start": RUN_ID,
                "evidence_key": f"{WORKSPACE_ID}:{CLUSTER_ID}:rca-test:{RUN_ID}",
                "agent_id": "target-agent-1",
                "provider_key": "kubernetes",
                "provider_policy": {
                    "queries": [{"name": "rca_test", "query": "sandbox"}],
                    "release_context": release_context,
                },
                "status": "completed",
                "failure_policy": "strict",
                "result": {
                    "kubernetes": {
                        "cluster": {"cluster_id": CLUSTER_ID, "namespace": "sandbox"},
                        "pods": [],
                        "events": [],
                    }
                },
            }
        ]
    )

    assert payload is not None
    assert payload["correlation_id"] == CORRELATION_ID
    assert payload["release_context"] == release_context
    assert payload["metadata"]["rca_test"] == {
        "run_id": RUN_ID,
        "scenario_id": SCENARIO_ID,
    }


def test_status_projection_explains_each_stage_through_user_selection() -> None:
    runtime = _runtime()

    status = _body(
        runtime.synthesize_rca_test_run_status(
            run_id=RUN_ID,
            inject_command={
                "command_id": INJECT_COMMAND_ID,
                "correlation_id": CORRELATION_ID,
                "status": CommandStatus.COMPLETED,
                "result": _fault_observed_result(),
            },
            evidence_jobs=[{"provider_key": "kubernetes", "status": "completed"}],
            evidence_window={"event_id": "evt-evidence-1", "correlation_id": CORRELATION_ID},
            rca_report={
                "correlation_id": CORRELATION_ID,
                "root_cause": "wrong_image_tag",
                "confidence": 1.0,
            },
            recovery_plan={
                "correlation_id": CORRELATION_ID,
                "status": "selection_requested",
                "recommended_action_id": "image_tag_fix",
            },
            cleanup_command=None,
        )
    )

    assert status["run_id"] == RUN_ID
    assert status["correlation_id"] == CORRELATION_ID
    assert status["status"] == "selection_required"
    assert _step_statuses(status) == {
        "fault_injection": "completed",
        "fault_observation": "completed",
        "evidence_collection": "completed",
        "root_cause_analysis": "completed",
        "recovery_plan": "completed",
        "action_selection": "waiting",
        "cleanup": "pending",
    }


def _fixture_deployment(owner_run_id: str) -> dict[str, Any]:
    return {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {
            "name": RESOURCE_NAME,
            "namespace": "sandbox",
            "annotations": {"kubeheal.io/rca-test-run": owner_run_id},
        },
        "spec": {
            "replicas": 1,
            "template": {
                "metadata": {
                    "labels": {
                        "app": RESOURCE_NAME,
                        "kubeheal.io/rca-test-run": owner_run_id,
                    }
                }
            },
        },
    }


def test_cleanup_uses_a_separate_command_and_refuses_a_stale_run_owner() -> None:
    runtime = _runtime()

    cleanup = runtime.build_rca_test_cleanup_plan(
        run_id=RUN_ID,
        scenario_id=SCENARIO_ID,
        scenario_version=1,
        cluster_id=CLUSTER_ID,
        workspace_id=WORKSPACE_ID,
        requested_by="developer-1",
    )

    assert cleanup["command_id"] == CLEANUP_COMMAND_ID
    assert cleanup["command_id"] != INJECT_COMMAND_ID
    assert cleanup["action"] == "rca.test.cleanup"
    assert cleanup["action"] in runtime.RCA_TEST_AGENT_ACTIONS
    assert cleanup["payload"] == {
        "run_id": RUN_ID,
        "scenario_id": SCENARIO_ID,
        "scenario_version": 1,
    }
    assert runtime.rca_test_fixture_owned_by_run(_fixture_deployment(RUN_ID), RUN_ID) is True
    assert runtime.rca_test_fixture_owned_by_run(_fixture_deployment(NEWER_RUN_ID), RUN_ID) is False
    assert (
        runtime.rca_test_fixture_owned_by_run(
            {"apiVersion": "apps/v1", "kind": "Deployment", "metadata": {}}, RUN_ID
        )
        is False
    )

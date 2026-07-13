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
from types import SimpleNamespace
from typing import Any

import pytest
from conftest import load_service, run_handler

from domains.command.events import CommandCompletedBody
from domains.rca.test_scenarios import test_scenario_by_id as scenario_by_id
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
POD_NAMES = ["rca-test-crash-app-startup-7f8d9c6b5-x2k4m"]
EXPIRES_AT = "2026-07-10T23:59:59+00:00"


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
        namespace="sandbox",
        resource_name=RESOURCE_NAME,
        cluster_id=CLUSTER_ID,
        workspace_id=WORKSPACE_ID,
        requested_by="developer-1",
        expected_root_cause="wrong_image_tag",
        expected_symptom="ImagePullBackOff",
        expires_at=EXPIRES_AT,
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
        "resource_kind": "Deployment",
        "namespace": "sandbox",
        "resource_name": RESOURCE_NAME,
        "expected_root_cause": "wrong_image_tag",
        "expected_symptom": "ImagePullBackOff",
        "expires_at": EXPIRES_AT,
        "cleanup_adapter": "kubernetes.manifest_delete",
        "verification_mode": False,
    }
    assert plan["expires_at"] == EXPIRES_AT
    serialized = json.dumps(plan, sort_keys=True).casefold()
    assert "raw_manifest" not in serialized
    assert '"manifest":' not in serialized
    assert "kubectl" not in serialized
    assert "shell" not in serialized


def test_wrong_tag_fixture_is_server_owned_bounded_and_run_scoped() -> None:
    runtime = _runtime()
    scenario = scenario_by_id(SCENARIO_ID)
    assert scenario is not None

    manifests = runtime.build_rca_test_manifests(scenario, RUN_ID, EXPIRES_AT)
    deployment = next(item for item in manifests if item["kind"] == "Deployment")

    assert deployment["metadata"]["name"] == RESOURCE_NAME
    assert deployment["metadata"]["namespace"] == "sandbox"
    assert deployment["metadata"]["annotations"]["kubeheal.io/rca-test-run"] == RUN_ID
    assert deployment["metadata"]["annotations"]["kubeheal.io/rca-test-expires-at"] == EXPIRES_AT
    assert deployment["metadata"]["labels"]["kubeheal.io/rca-test-run"] == RUN_ID
    template = deployment["spec"]["template"]
    assert template["metadata"]["labels"]["kubeheal.io/rca-test-run"] == RUN_ID
    container = template["spec"]["containers"][0]
    assert container["image"].startswith("registry.k8s.io/pause:rca-test-missing-")
    assert RUN_ID.replace("-", "")[:12] in container["image"]
    assert container["resources"] == {
        "requests": {"cpu": "10m", "memory": "8Mi"},
        "limits": {"cpu": "50m", "memory": "32Mi"},
    }
    serialized = json.dumps(deployment, sort_keys=True).casefold()
    assert "privileged" not in serialized
    assert "hostpath" not in serialized
    assert "hostnetwork" not in serialized


def test_fault_observation_requires_the_registered_signal_groups() -> None:
    runtime = _runtime()
    scenario = scenario_by_id(SCENARIO_ID)
    assert scenario is not None
    snapshot = {
        "pods": [
            {
                "name": f"{RESOURCE_NAME}-pod",
                "labels": {"kubeheal.io/rca-test-run": RUN_ID},
                "waiting_reasons": ["ImagePullBackOff"],
                "terminated_reasons": [],
            }
        ],
        "events": [],
    }

    assert runtime.rca_test_observation_matches(scenario, snapshot, RUN_ID) is False
    snapshot["events"] = [
        {
            "involved_name": f"{RESOURCE_NAME}-pod",
            "reason": "Failed",
            "message": "manifest for test image not found",
        }
    ]
    assert runtime.rca_test_observation_matches(scenario, snapshot, RUN_ID) is True


def test_runtime_kubernetes_facade_dispatches_through_the_registered_adapter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime = _runtime()
    scenario = scenario_by_id(SCENARIO_ID)
    assert scenario is not None
    calls: list[tuple[str, object]] = []

    class SpyAdapter:
        def fixture_target(self, selected: object) -> object:
            calls.append(("target", selected))
            return SimpleNamespace(namespace="sandbox", resource_name=RESOURCE_NAME)

        def build_trigger(
            self,
            selected: object,
            run_id: str,
            expires_at: str,
        ) -> list[dict[str, object]]:
            calls.append(("trigger", (selected, run_id, expires_at)))
            return [{"kind": "SpyManifest"}]

        def matches_observation(
            self,
            selected: object,
            snapshot: object,
            run_id: str,
        ) -> bool:
            calls.append(("observe", (selected, snapshot, run_id)))
            return True

        def build_cleanup(self, namespace: str, resource_name: str) -> object:
            calls.append(("cleanup", (namespace, resource_name)))
            return SimpleNamespace(adapter="kubernetes.manifest_delete", resources=())

    adapter = SpyAdapter()

    class SpyRegistry:
        def adapter_for(self, selected: object) -> SpyAdapter:
            calls.append(("adapter_for", selected))
            return adapter

        def cleanup_adapter(self, adapter_name: str) -> SpyAdapter:
            calls.append(("cleanup_adapter", adapter_name))
            return adapter

    monkeypatch.setattr(
        runtime,
        "default_test_scenario_adapter_registry",
        lambda: SpyRegistry(),
    )

    target = runtime.rca_test_scenario_fixture_target(scenario)
    manifests = runtime.build_rca_test_manifests(scenario, RUN_ID, EXPIRES_AT)
    matched = runtime.rca_test_observation_matches(scenario, {"pods": []}, RUN_ID)
    cleanup = runtime.rca_test_resource_cleanup_plan(
        "kubernetes.manifest_delete",
        "sandbox",
        RESOURCE_NAME,
    )

    assert target.resource_name == RESOURCE_NAME
    assert manifests == [{"kind": "SpyManifest"}]
    assert matched is True
    assert cleanup.adapter == "kubernetes.manifest_delete"
    assert [name for name, _value in calls] == [
        "adapter_for",
        "target",
        "adapter_for",
        "trigger",
        "adapter_for",
        "observe",
        "cleanup_adapter",
        "cleanup",
    ]


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


def test_fault_observed_logs_are_scoped_to_observed_pods_and_short_range() -> None:
    worker = load_service("projection/release-flow-worker")
    db = _ReleaseFlowDb()
    result = _fault_observed_result()
    result["rca_test"]["evidence_sources"] = ["kubernetes", "logs"]
    result["rca_test"]["pod_names"] = POD_NAMES

    run_handler(
        worker.on_event,
        CommandCompletedBody(command_id=INJECT_COMMAND_ID, result=result),
        db,
        subject=str(CommandCompletedBody.__subject__),
        correlation_id=CORRELATION_ID,
    )

    request = db.queued[0]
    logs_policy = request["provider_policies"]["logs"]
    assert logs_policy["queries"] == [
        {
            "name": "rca_test_pod_log_0",
            "description": "현재 RCA test run Pod 로그",
            "query": (
                '{k8s_namespace_name="sandbox", '
                'k8s_pod_name="rca-test-crash-app-startup-7f8d9c6b5-x2k4m"} '
                '|~ "ERROR|FATAL|panic|error|failed"'
            ),
            "range_seconds": 120,
        }
    ]
    assert logs_policy["release_context"]["pod_names"] == POD_NAMES


def test_fault_observed_metadata_is_scoped_to_observed_namespace() -> None:
    worker = load_service("projection/release-flow-worker")
    db = _ReleaseFlowDb()
    result = _fault_observed_result()
    result["rca_test"]["evidence_sources"] = ["metadata"]

    run_handler(
        worker.on_event,
        CommandCompletedBody(command_id=INJECT_COMMAND_ID, result=result),
        db,
        subject=str(CommandCompletedBody.__subject__),
        correlation_id=CORRELATION_ID,
    )

    request = db.queued[0]
    metadata_policy = request["provider_policies"]["metadata"]
    assert metadata_policy["queries"] == [
        {
            "name": "rca_test_metadata_snapshot",
            "description": "RCA test run scoped metadata snapshot",
            "query": f"deployment/sandbox/{RESOURCE_NAME}",
        }
    ]
    assert metadata_policy["release_context"]["namespace"] == "sandbox"


def test_rca_test_metadata_query_trims_target_identity() -> None:
    worker = load_service("projection/release-flow-worker")

    assert (
        worker.rca_test_metadata_query(" sandbox ", " Deployment ", f" {RESOURCE_NAME} ")
        == f"deployment/sandbox/{RESOURCE_NAME}"
    )
    assert worker.rca_test_metadata_query(" sandbox ", "Service", "checkout") == "sandbox"


def test_evidence_aggregation_promotes_release_context_and_same_correlation() -> None:
    release_context = {
        "correlation_id": CORRELATION_ID,
        "rca_test_run_id": RUN_ID,
        "scenario_id": SCENARIO_ID,
        "namespace": "sandbox",
        "resource_kind": "Deployment",
        "resource_name": RESOURCE_NAME,
        "label_selector": RUN_LABEL,
        "pod_names": POD_NAMES,
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
            },
            {
                "workspace_id": WORKSPACE_ID,
                "cluster_id": CLUSTER_ID,
                "source_id": "rca-test",
                "window_start": RUN_ID,
                "evidence_key": f"{WORKSPACE_ID}:{CLUSTER_ID}:rca-test:{RUN_ID}",
                "agent_id": "target-agent-1",
                "provider_key": "metadata",
                "provider_policy": {
                    "queries": [{"name": "change_context", "query": "change_context"}],
                    "release_context": release_context,
                },
                "status": "completed",
                "failure_policy": "strict",
                "result": {
                    "metadata": {
                        "rca_test": {
                            "run_id": "wrong-run",
                            "scenario_id": "wrong-scenario",
                            "pod_names": ["wrong-pod"],
                        },
                        "change_context": {
                            "current_workload_snapshots": [
                                {
                                    "workload": {
                                        "kind": "Deployment",
                                        "namespace": "sandbox",
                                        "name": RESOURCE_NAME,
                                    }
                                }
                            ]
                        },
                    }
                },
            },
        ]
    )

    assert payload is not None
    assert payload["correlation_id"] == CORRELATION_ID
    assert payload["release_context"] == release_context
    assert payload["metadata"]["rca_test"] == {
        "run_id": RUN_ID,
        "scenario_id": SCENARIO_ID,
        "pod_names": POD_NAMES,
    }
    assert payload["metadata"]["change_context"] == {
        "current_workload_snapshots": [
            {
                "workload": {
                    "kind": "Deployment",
                    "namespace": "sandbox",
                    "name": RESOURCE_NAME,
                }
            }
        ]
    }
    assert payload["kubernetes"]["resource"] == {
        "kind": "Deployment",
        "name": RESOURCE_NAME,
        "namespace": "sandbox",
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


def test_status_projection_surfaces_terminal_evidence_failure() -> None:
    runtime = _runtime()

    status = _body(
        runtime.synthesize_rca_test_run_status(
            run_id=RUN_ID,
            inject_command={
                "command_id": INJECT_COMMAND_ID,
                "status": CommandStatus.COMPLETED,
                "result": _fault_observed_result(),
            },
            evidence_jobs=[
                {
                    "provider_key": "kubernetes",
                    "status": CommandStatus.FAILED,
                    "error": "provider timeout",
                }
            ],
            evidence_window=None,
            rca_report=None,
            recovery_plan=None,
            cleanup_command=None,
        )
    )

    assert status["status"] == "failed"
    assert status["failure"] == {
        "stage": "evidence_collection",
        "providers": [
            {"provider_key": "kubernetes", "message": "provider timeout"},
        ],
    }
    assert _step_statuses(status)["evidence_collection"] == "failed"


def test_status_projection_does_not_claim_a_stale_cleanup_was_applied() -> None:
    runtime = _runtime()

    status = _body(
        runtime.synthesize_rca_test_run_status(
            run_id=RUN_ID,
            inject_command={
                "command_id": INJECT_COMMAND_ID,
                "status": CommandStatus.FAILED,
                "result": _fault_observed_result(),
            },
            evidence_jobs=[{"provider_key": "kubernetes", "status": "completed"}],
            evidence_window={"event_id": "evt-evidence-1"},
            rca_report={"root_cause": "wrong_image_tag"},
            recovery_plan={"status": "selected"},
            cleanup_command={
                "status": CommandStatus.COMPLETED,
                "result": {
                    "status": CommandStatus.COMPLETED,
                    "rca_test": {"cleanup_completed": False},
                },
            },
        )
    )

    assert status["status"] == "cleanup_skipped"
    assert _step_statuses(status)["cleanup"] == "skipped"


def test_status_projection_marks_completed_cleanup_as_terminal() -> None:
    runtime = _runtime()

    status = _body(
        runtime.synthesize_rca_test_run_status(
            run_id=RUN_ID,
            inject_command={
                "command_id": INJECT_COMMAND_ID,
                "status": CommandStatus.FAILED,
                "result": _fault_observed_result(),
            },
            evidence_jobs=[{"provider_key": "kubernetes", "status": "completed"}],
            evidence_window={"event_id": "evt-evidence-1"},
            rca_report={"root_cause": "wrong_image_tag"},
            recovery_plan={"status": "selected"},
            cleanup_command={
                "status": CommandStatus.COMPLETED,
                "result": {
                    "status": CommandStatus.COMPLETED,
                    "rca_test": {"cleanup_completed": True},
                },
            },
        )
    )

    assert status["status"] == "cleanup_completed"
    assert _step_statuses(status)["cleanup"] == "completed"


def test_status_projection_fails_when_actual_root_cause_misses_expected_snapshot() -> None:
    runtime = _runtime()

    status = _body(
        runtime.synthesize_rca_test_run_status(
            run_id=RUN_ID,
            inject_command={
                "command_id": INJECT_COMMAND_ID,
                "status": CommandStatus.COMPLETED,
                "payload": {
                    "payload": {
                        "expected_root_cause": "wrong_image_tag",
                        "expected_symptom": "ImagePullBackOff",
                    }
                },
                "result": _fault_observed_result(),
            },
            evidence_jobs=[{"provider_key": "kubernetes", "status": "completed"}],
            evidence_window={"event_id": "evt-evidence-1"},
            rca_report={"root_cause": "registry_unavailable"},
            recovery_plan={"status": "selected"},
            cleanup_command=None,
        )
    )

    assert status["status"] == "failed"
    assert status["failure"] == {
        "stage": "root_cause_analysis",
        "message": "RCA root cause did not match the test expectation",
        "expected_root_cause": "wrong_image_tag",
        "actual_root_cause": "registry_unavailable",
    }
    assert _step_statuses(status)["root_cause_analysis"] == "failed"
    assert _step_statuses(status)["recovery_plan"] != "completed"
    assert _step_statuses(status)["action_selection"] != "completed"


def test_status_projection_surfaces_analysis_blocked_as_terminal() -> None:
    runtime = _runtime()

    status = _body(
        runtime.synthesize_rca_test_run_status(
            run_id=RUN_ID,
            inject_command={
                "command_id": INJECT_COMMAND_ID,
                "status": CommandStatus.COMPLETED,
                "result": _fault_observed_result(),
            },
            evidence_jobs=[{"provider_key": "kubernetes", "status": "completed"}],
            evidence_window={"event_id": "evt-evidence-1"},
            rca_report=None,
            recovery_plan=None,
            cleanup_command=None,
            analysis_outcome={
                "subject": "rca.analysis_blocked",
                "payload": {"reason_code": "missing_required_evidence", "reason": "logs missing"},
            },
        )
    )

    assert status["status"] == "blocked"
    assert status["failure"] == {
        "stage": "root_cause_analysis",
        "message": "logs missing",
        "reason_code": "missing_required_evidence",
    }
    assert _step_statuses(status)["root_cause_analysis"] == "blocked"
    assert _step_statuses(status)["recovery_plan"] == "blocked"


def test_status_projection_surfaces_non_incident_as_terminal_failure() -> None:
    runtime = _runtime()

    status = _body(
        runtime.synthesize_rca_test_run_status(
            run_id=RUN_ID,
            inject_command={
                "command_id": INJECT_COMMAND_ID,
                "status": CommandStatus.COMPLETED,
                "result": _fault_observed_result(),
            },
            evidence_jobs=[{"provider_key": "kubernetes", "status": "completed"}],
            evidence_window={"event_id": "evt-evidence-1"},
            rca_report=None,
            recovery_plan=None,
            cleanup_command=None,
            analysis_outcome={
                "subject": "incident.detected",
                "payload": {"detected": False, "reason": "no incident signals"},
            },
        )
    )

    assert status["status"] == "failed"
    assert status["failure"] == {
        "stage": "incident_detection",
        "message": "no incident signals",
    }
    assert _step_statuses(status)["root_cause_analysis"] == "failed"
    assert _step_statuses(status)["recovery_plan"] == "blocked"


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
        namespace="sandbox",
        resource_name=RESOURCE_NAME,
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
        "resource_kind": "Deployment",
        "namespace": "sandbox",
        "resource_name": RESOURCE_NAME,
        "cleanup_adapter": "kubernetes.manifest_delete",
    }
    assert runtime.rca_test_fixture_owned_by_run(_fixture_deployment(RUN_ID), RUN_ID) is True
    assert runtime.rca_test_fixture_owned_by_run(_fixture_deployment(NEWER_RUN_ID), RUN_ID) is False
    assert (
        runtime.rca_test_fixture_owned_by_run(
            {"apiVersion": "apps/v1", "kind": "Deployment", "metadata": {}}, RUN_ID
        )
        is False
    )

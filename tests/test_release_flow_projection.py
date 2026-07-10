"""Release-flow projection from workflow/agent/RCA events."""

from __future__ import annotations

import asyncio
from contextlib import contextmanager
from typing import Any

from conftest import load_service, run_handler, subjects_of
from sqlalchemy.dialects import postgresql

from domains.release_flow.projection import (
    evidence_queued_update,
    release_alert_request,
    release_failure_evidence_request,
    release_workflow_update_from_event,
)
from domains.release_flow.repository import ReleaseFlowRepository, merge_projection_details
from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.runtime.dispatch import make_event_handler


def _evt(subject: str, payload: dict[str, object] | None = None) -> EventEnvelope:
    return EventEnvelope(
        event_id="evt-1",
        subject=subject,
        source="workflow-controller",
        correlation_id="corr-1",
        causation_id=None,
        created_at="2026-07-07T10:00:00Z",
        payload=payload or {},
    )


class ReleaseProjectionDb:
    def __init__(self) -> None:
        self.calls: list[tuple[str, Any]] = []

    async def project_release_workflow_event(self, payload: dict[str, object]) -> dict[str, object]:
        self.calls.append(("project_release_workflow_event", payload))
        return {
            "run_id": "release-run-1",
            "steps": [
                {
                    "workflow_run_id": payload.get("workflow_run_id"),
                    "application_id": payload.get("application_id"),
                    "details": {
                        "cluster_id": "target",
                        "config": {"namespace": "sandbox"},
                    },
                }
            ],
        }

    async def queue_evidence_jobs(self, **kwargs: object) -> dict[str, object]:
        self.calls.append(("queue_evidence_jobs", kwargs))
        return {
            "accepted": True,
            "evidence_key": "workspace-a:target:release-workflow-failure:workflow-1",
            "queued": 4,
            "job_ids": ["job-kubernetes", "job-metrics", "job-logs", "job-traces"],
        }


class _FakeResult:
    def __init__(
        self,
        *,
        first: dict[str, object] | None = None,
        all_rows: list[dict[str, object]] | None = None,
    ) -> None:
        self._first = first
        self._all_rows = all_rows or []

    def mappings(self) -> _FakeResult:
        return self

    def first(self) -> dict[str, object] | None:
        return self._first

    def all(self) -> list[dict[str, object]]:
        return self._all_rows


class _FakeConnection:
    def __init__(self) -> None:
        self.statements: list[Any] = []
        self.results = [
            _FakeResult(
                first={
                    "workspace_id": "workspace-a",
                    "run_id": "release-run-1",
                    "application_id": "app-a",
                    "workflow_run_id": "workflow-1",
                    "details": {"config": {"manifest_path": "deploy.yaml"}},
                    "health": {"status": "progressing"},
                }
            ),
            _FakeResult(),
            _FakeResult(),
            _FakeResult(
                all_rows=[
                    {
                        "status": "failed",
                        "health": {"status": "unhealthy"},
                    }
                ]
            ),
            _FakeResult(first={"status": "running"}),
            _FakeResult(),
        ]

    def execute(self, statement: Any) -> _FakeResult:
        self.statements.append(statement)
        return self.results.pop(0) if self.results else _FakeResult()


def _repository_with_fake_connection(connection: _FakeConnection) -> ReleaseFlowRepository:
    @contextmanager
    def fake_connection():
        yield connection

    repository = object.__new__(ReleaseFlowRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]
    repository.get_release_run = lambda workspace_id, run_id: {  # type: ignore[method-assign]
        "workspace_id": workspace_id,
        "run_id": run_id,
    }
    return repository


def test_release_workflow_completed_projects_succeeded_step() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "workflow.run.completed",
            {
                "workspace_id": "workspace-a",
                "workflow_run_id": "workflow-1",
                "application_id": "app-a",
                "cluster_id": "target",
                "summary": "rollout healthy",
            },
        )
    )

    assert update is not None
    assert update["step_status"] == "succeeded"
    assert update["health_status"] == "healthy"
    assert update["event_type"] == "workflow.run.completed"
    assert release_failure_evidence_request(update) is None


def test_release_workflow_failed_requests_agent_evidence_jobs() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "workflow.run.failed",
            {
                "workspace_id": "workspace-a",
                "workflow_run_id": "workflow-1",
                "application_id": "app-a",
                "cluster_id": "target",
                "reason": "rollout health failed",
                "details": {"command_id": "cmd-1"},
            },
        )
    )

    assert update is not None
    request = release_failure_evidence_request(update)
    assert request is not None
    assert request["workspace_id"] == "workspace-a"
    assert request["cluster_id"] == "target"
    assert request["source_id"] == "release-workflow-failure"
    assert request["window_start"] == "workflow-1"
    assert request["provider_keys"] == ["kubernetes", "metrics", "logs", "traces"]
    assert request["failure_policy"] == "allow_partial"
    assert request["max_attempts"] == 3
    provider_policies = request["provider_policies"]
    assert provider_policies["kubernetes"]["queries"][0]["query"] == "target"
    assert provider_policies["metrics"]["queries"][1]["query"] == (
        'kube_pod_info{namespace="target"}'
    )
    queued = evidence_queued_update(update, {"accepted": True, "queued": 4})
    assert queued["event_type"] == "evidence.queued"
    assert queued["details"] == {"evidence": {"accepted": True, "queued": 4}}


def test_release_workflow_failed_builds_operational_alert() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "workflow.run.failed",
            {
                "workspace_id": "workspace-a",
                "workflow_run_id": "workflow-1",
                "application_id": "app-a",
                "cluster_id": "target",
                "reason": "rollout health failed",
            },
        )
    )

    assert update is not None
    alert = release_alert_request(update)

    assert alert is not None
    assert alert.workspace_id == "workspace-a"
    assert alert.cluster_id == "target"
    assert alert.namespace == "target"
    assert alert.severity == "critical"
    assert alert.application_id == "app-a"
    assert alert.workflow_run_id == "workflow-1"
    assert alert.reason == "release workflow failed"
    assert alert.message == "app-a: rollout health failed"


def test_release_verification_job_update_projects_guard_result() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "evidence.job.updated",
            {
                "workspace_id": "workspace-a",
                "workflow_run_id": "workflow-1",
                "job_id": "release-verification-a",
                "provider_key": "http_probe",
                "status": "failed",
                "source_id": "post-deploy-verification",
                "evidence_key": "plan-a:wave-1:checkout:post-deploy-verification",
                "error": "HTTP 503",
                "result": {"status_code": 503, "latency_ms": 1200},
            },
        )
    )

    assert update is not None
    assert update["health_status"] == "unhealthy"
    assert update["event_type"] == "evidence.job.updated"
    jobs = update["details"]["release_guard"]["verification_jobs"]["jobs"]
    assert jobs == [
        {
            "job_id": "release-verification-a",
            "kind": "http_probe",
            "status": "failed",
            "evidence_key": "plan-a:wave-1:checkout:post-deploy-verification",
            "workflow_run_id": "workflow-1",
            "result": {"status_code": 503, "latency_ms": 1200},
            "error": "HTTP 503",
        }
    ]


def test_release_verification_job_failure_builds_operational_alert() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "evidence.job.updated",
            {
                "workspace_id": "workspace-a",
                "workflow_run_id": "workflow-1",
                "application_id": "checkout",
                "cluster_id": "target",
                "job_id": "release-verification-a",
                "provider_key": "http_probe",
                "status": "failed",
                "source_id": "post-deploy-verification",
                "evidence_key": "plan-a:wave-1:checkout:post-deploy-verification",
                "error": "HTTP 503",
                "result": {"status_code": 503, "latency_ms": 1200},
            },
        )
    )

    assert update is not None
    alert = release_alert_request(update)

    assert alert is not None
    assert alert.workspace_id == "workspace-a"
    assert alert.cluster_id == "target"
    assert alert.namespace == "target"
    assert alert.severity == "critical"
    assert alert.application_id == "checkout"
    assert alert.workflow_run_id == "workflow-1"
    assert alert.reason == "release verification failed"
    assert alert.message == "checkout: post-deploy verification http_probe failed"


def test_release_verification_job_timeout_builds_operational_alert() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "evidence.job.updated",
            {
                "workspace_id": "workspace-a",
                "workflow_run_id": "workflow-1",
                "application_id": "checkout",
                "cluster_id": "target",
                "job_id": "release-verification-a",
                "provider_key": "http_probe",
                "status": "timeout",
                "source_id": "post-deploy-verification",
                "evidence_key": "plan-a:wave-1:checkout:post-deploy-verification",
                "error": "verification timed out",
                "result": {"elapsed_ms": 900000},
            },
        )
    )

    assert update is not None
    assert update["health_status"] == "unhealthy"
    jobs = update["details"]["release_guard"]["verification_jobs"]["jobs"]
    assert jobs[0]["status"] == "timeout"
    alert = release_alert_request(update)

    assert alert is not None
    assert alert.severity == "critical"
    assert alert.reason == "release verification failed"
    assert alert.message == "checkout: post-deploy verification http_probe timed out"


def test_merge_projection_details_updates_existing_verification_job() -> None:
    current = {
        "release_guard": {
            "verification_jobs": {
                "scheduled": True,
                "job_count": 1,
                "jobs": [
                    {
                        "job_id": "release-verification-a",
                        "application_id": "checkout",
                        "kind": "http_probe",
                        "status": "pending",
                        "target": {"url": "https://status.example.com/checkout"},
                    }
                ],
            }
        }
    }
    incoming = {
        "release_guard": {
            "verification_jobs": {
                "jobs": [
                    {
                        "job_id": "release-verification-a",
                        "status": "failed",
                        "result": {"status_code": 503},
                        "error": "HTTP 503",
                    }
                ]
            }
        }
    }

    merged = merge_projection_details(current, incoming)

    job = merged["release_guard"]["verification_jobs"]["jobs"][0]
    assert job["application_id"] == "checkout"
    assert job["target"] == {"url": "https://status.example.com/checkout"}
    assert job["status"] == "failed"
    assert job["result"] == {"status_code": 503}
    assert job["error"] == "HTTP 503"


def test_release_approval_requested_builds_warning_alert() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "approval.requested",
            {
                "workspace_id": "workspace-a",
                "workflow_run_id": "workflow-1",
                "application_id": "app-a",
                "approval_id": "approval-1",
                "reason": "production requires approval",
            },
        )
    )

    assert update is not None
    alert = release_alert_request(update)

    assert alert is not None
    assert alert.severity == "warning"
    assert alert.reason == "release approval requested"
    assert alert.message == "app-a: production requires approval"


def test_release_workflow_failed_uses_projected_step_for_evidence_target() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "workflow.run.failed",
            {
                "workspace_id": "workspace-a",
                "workflow_run_id": "workflow-1",
                "application_id": "app-a",
                "reason": "rollout health failed",
            },
        )
    )
    projected = {
        "steps": [
            {
                "workflow_run_id": "workflow-1",
                "application_id": "app-a",
                "details": {
                    "cluster_id": "target",
                    "manifest_path": "deploy/k8s/checkout.yaml",
                    "repo_ref": "project/repo",
                    "branch": "main",
                    "commit_sha": "abc123",
                    "workflow_details": {
                        "desired_manifest": {
                            "apiVersion": "apps/v1",
                            "kind": "Deployment",
                            "metadata": {"name": "checkout"},
                        }
                    },
                    "config": {"namespace": "sandbox", "image": "ghcr.io/project/checkout:bad"},
                },
            }
        ]
    }

    assert update is not None
    request = release_failure_evidence_request(update, projected)

    assert request is not None
    assert request["cluster_id"] == "target"
    assert request["provider_policies"]["kubernetes"]["queries"][0]["query"] == "sandbox"
    assert request["provider_policies"]["kubernetes"]["queries"][0]["resource_kind"] == (
        "Deployment"
    )
    assert request["provider_policies"]["kubernetes"]["queries"][0]["resource_name"] == "checkout"
    assert request["provider_policies"]["kubernetes"]["release_context"] == {
        "workspace_id": "workspace-a",
        "workflow_run_id": "workflow-1",
        "application_id": "app-a",
        "cluster_id": "target",
        "namespace": "sandbox",
        "manifest_path": "deploy/k8s/checkout.yaml",
        "repo_ref": "project/repo",
        "branch": "main",
        "commit_sha": "abc123",
        "image": "ghcr.io/project/checkout:bad",
        "desired_manifest": {
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {"name": "checkout"},
        },
        "resource_kind": "Deployment",
        "resource_name": "checkout",
    }
    assert request["provider_policies"]["logs"]["queries"][0]["query"] == (
        '{k8s_namespace_name="sandbox"} |= "ERROR"'
    )


def test_release_workflow_failed_promotes_rendered_manifest_to_rollback_context() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "workflow.run.failed",
            {
                "workspace_id": "workspace-a",
                "workflow_run_id": "workflow-1",
                "application_id": "app-a",
                "reason": "rollout health failed",
            },
        )
    )
    rendered = {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "checkout", "namespace": "sandbox"},
        "spec": {"replicas": 2, "image": "ghcr.io/project/checkout:bad"},
        "manifest": {
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {"name": "checkout", "namespace": "sandbox"},
            "spec": {
                "template": {
                    "spec": {
                        "containers": [
                            {
                                "name": "checkout",
                                "image": "ghcr.io/project/checkout:bad",
                            }
                        ]
                    }
                }
            },
        },
    }
    projected = {
        "steps": [
            {
                "workflow_run_id": "workflow-1",
                "application_id": "app-a",
                "details": {
                    "cluster_id": "target",
                    "manifest_path": "deploy/k8s/checkout.yaml",
                    "workflow_details": rendered,
                    "config": {"namespace": "sandbox"},
                },
            }
        ]
    }

    assert update is not None
    request = release_failure_evidence_request(update, projected)

    assert request is not None
    context = request["provider_policies"]["kubernetes"]["release_context"]
    assert context["rendered_manifest"] == rendered
    assert context["desired_manifest"] == rendered["manifest"]


def test_release_evidence_event_uses_window_start_as_workflow_id() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "cluster.evidence.received",
            {
                "workspace_id": "workspace-a",
                "cluster_id": "target",
                "source_id": "release-workflow-failure",
                "window_start": "workflow-1",
                "evidence_key": "workspace-a:target:release-workflow-failure:workflow-1",
                "agent_id": "agent-a",
                "kubernetes": {},
                "metrics": {},
                "logs": [],
                "traces": {},
                "collection_status": {
                    "source": "evidence_jobs",
                    "complete": False,
                    "completed_providers": ["kubernetes", "logs"],
                    "failed_providers": ["metrics"],
                    "providers": {
                        "metrics": {"status": "failed", "error": "prometheus unavailable"},
                    },
                },
            },
        )
    )

    assert update is not None
    assert update["workflow_run_id"] == "workflow-1"
    assert update["event_type"] == "evidence.received"
    assert update["details"]["evidence"]["workflow_run_id"] == "workflow-1"
    assert update["details"]["evidence"]["source_id"] == "release-workflow-failure"
    assert update["details"]["evidence"]["collection_complete"] is False
    assert update["details"]["evidence"]["failed_providers"] == ["metrics"]
    assert update["details"]["evidence"]["failed_provider_count"] == 1
    assert update["details"]["evidence"]["completed_provider_count"] == 2


def test_release_evidence_job_update_projects_provider_progress() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "evidence.job.updated",
            {
                "workspace_id": "workspace-a",
                "cluster_id": "target",
                "source_id": "release-workflow-failure",
                "window_start": "workflow-1",
                "evidence_key": "workspace-a:target:release-workflow-failure:workflow-1",
                "job_id": "workspace-a:target:release-workflow-failure:workflow-1:kubernetes",
                "provider_key": "kubernetes",
                "status": "completed",
                "reported_status": "completed",
                "agent_id": "agent-a",
                "release_context": {
                    "workflow_run_id": "workflow-1",
                    "application_id": "app-a",
                    "workspace_id": "workspace-a",
                    "repo_ref": "project/repo",
                },
                "collection_status": {
                    "source": "evidence_jobs",
                    "failure_policy": "allow_partial",
                    "terminal": False,
                    "complete": False,
                    "provider_count": 2,
                    "completed_providers": ["kubernetes"],
                    "failed_providers": [],
                    "pending_providers": ["metrics"],
                    "pending_provider_count": 1,
                    "providers": {
                        "kubernetes": {"status": "completed", "error": ""},
                        "metrics": {"status": "queued", "error": ""},
                    },
                },
                "evidence_emitted": True,
                "emitted_event_id": "evt-evidence",
                "emitted_correlation_id": "corr-evidence",
            },
        )
    )

    assert update is not None
    assert update["workflow_run_id"] == "workflow-1"
    assert update["application_id"] == "app-a"
    assert update["event_type"] == "evidence.job.updated"
    assert "RCA evidence emitted" in update["message"]
    assert update["details"]["evidence"]["source_id"] == "release-workflow-failure"
    assert update["details"]["evidence"]["collection_complete"] is False
    assert update["details"]["evidence"]["completed_providers"] == ["kubernetes"]
    assert update["details"]["evidence"]["completed_provider_count"] == 1
    assert update["details"]["evidence"]["pending_providers"] == ["metrics"]
    assert update["details"]["evidence"]["pending_provider_count"] == 1
    assert update["details"]["evidence_job"] == {
        "job_id": "workspace-a:target:release-workflow-failure:workflow-1:kubernetes",
        "provider_key": "kubernetes",
        "status": "completed",
        "reported_status": "completed",
        "error": "",
        "evidence_emitted": True,
        "emitted_event_id": "evt-evidence",
        "emitted_correlation_id": "corr-evidence",
    }


def test_release_rca_event_uses_nested_evidence_workflow_id() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "rca.completed",
            {
                "workspace_id": "workspace-a",
                "root_cause": "bad_image_rollout",
                "action": "rollback",
                "evidence_ref": "evidence/corr-1.json",
                "evidence": {
                    "workspace_id": "workspace-a",
                    "cluster_id": "target",
                    "source_id": "release-workflow-failure",
                    "window_start": "workflow-1",
                    "workflow_run_id": "workflow-1",
                    "evidence_key": "workspace-a:target:release-workflow-failure:workflow-1",
                    "kubernetes": {},
                    "metrics": {},
                    "logs": [],
                    "traces": {},
                    "object_ref": "evidence/corr-1.json",
                },
            },
        )
    )

    assert update is not None
    assert update["workflow_run_id"] == "workflow-1"
    assert update["event_type"] == "rca.completed"
    assert update["details"]["rca"]["root_cause"] == "bad_image_rollout"


def test_release_incident_event_projects_detected_signal() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "incident.detected",
            {
                "workspace_id": "workspace-a",
                "cluster_id": "target",
                "detected": True,
                "reason": "crashloop signal",
                "severity": "high",
                "evidence": {
                    "workspace_id": "workspace-a",
                    "cluster_id": "target",
                    "source_id": "release-workflow-failure",
                    "window_start": "workflow-1",
                    "workflow_run_id": "workflow-1",
                    "evidence_key": "workspace-a:target:release-workflow-failure:workflow-1",
                    "kubernetes": {"pods": [{"status": "CrashLoopBackOff"}]},
                    "metrics": {},
                    "logs": [],
                    "traces": {},
                    "object_ref": "evidence/corr-1.json",
                },
                "incident": {
                    "incident_id": "incident-1",
                    "cluster_id": "target",
                    "resource_kind": "Deployment",
                    "resource_name": "checkout-api",
                    "namespace": "sandbox",
                    "symptom": "CrashLoopBackOff",
                    "severity": "high",
                    "first_seen_at": None,
                    "summary": "checkout-api crashloop",
                    "workspace_id": "workspace-a",
                },
            },
        )
    )

    assert update is not None
    assert update["workflow_run_id"] == "workflow-1"
    assert update["event_type"] == "incident.detected"
    assert update["message"] == "Incident signal detected from release evidence."
    assert update["details"]["incident"]["symptom"] == "CrashLoopBackOff"
    assert update["details"]["evidence"]["has_kubernetes"] is True


def test_release_evidence_bundle_event_projects_completeness() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "evidence.bundle.built",
            {
                "workspace_id": "workspace-a",
                "evidence": {
                    "workspace_id": "workspace-a",
                    "cluster_id": "target",
                    "source_id": "release-workflow-failure",
                    "window_start": "workflow-1",
                    "workflow_run_id": "workflow-1",
                    "evidence_key": "workspace-a:target:release-workflow-failure:workflow-1",
                    "kubernetes": {},
                    "metrics": {},
                    "logs": [],
                    "traces": {},
                    "object_ref": "evidence/corr-1.json",
                },
                "incident": {
                    "incident_id": "incident-1",
                    "cluster_id": "target",
                    "resource_kind": "Deployment",
                    "resource_name": "checkout-api",
                    "namespace": "sandbox",
                    "symptom": "CrashLoopBackOff",
                    "severity": "high",
                    "first_seen_at": None,
                    "summary": "checkout-api crashloop",
                    "workspace_id": "workspace-a",
                },
                "evidence_bundle": {
                    "incident_id": "incident-1",
                    "items": [{"source": "logs"}, {"source": "kubernetes"}],
                    "missing_evidence": ["traces"],
                    "complete": False,
                    "missing_evidence_checks": [],
                },
            },
        )
    )

    assert update is not None
    assert update["workflow_run_id"] == "workflow-1"
    assert update["details"]["evidence_bundle"]["item_count"] == 2
    assert update["details"]["evidence_bundle"]["missing_evidence"] == ["traces"]


def test_release_rca_candidates_event_projects_candidate_summary() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "rca.candidates.evaluated",
            {
                "workspace_id": "workspace-a",
                "candidate_count": 2,
                "evidence_ref": "evidence/corr-1.json",
                "candidates": [
                    {"candidate_id": "bad_image_rollout"},
                    {"candidate_id": "oom_killed"},
                ],
                "evaluations": [{"candidate_id": "bad_image_rollout", "score": 0.9}],
                "evidence": {
                    "workspace_id": "workspace-a",
                    "cluster_id": "target",
                    "source_id": "release-workflow-failure",
                    "window_start": "workflow-1",
                    "workflow_run_id": "workflow-1",
                    "evidence_key": "workspace-a:target:release-workflow-failure:workflow-1",
                    "kubernetes": {},
                    "metrics": {},
                    "logs": [],
                    "traces": {},
                    "object_ref": "evidence/corr-1.json",
                },
            },
        )
    )

    assert update is not None
    assert update["event_type"] == "rca.candidates.evaluated"
    assert update["details"]["rca"]["candidate_count"] == 2
    assert update["details"]["rca"]["candidate_ids"] == ["bad_image_rollout", "oom_killed"]
    assert update["details"]["rca"]["evaluation_count"] == 1


def test_release_recovery_event_projects_selected_action() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "recovery.action_selected",
            {
                "workspace_id": "workspace-a",
                "reason": "auto selected safe action",
                "auto_selected": True,
                "selected_by": "agent-select",
                "plan": {
                    "plan_id": "recovery:evidence/corr-1.json",
                    "evidence_ref": "evidence/corr-1.json",
                    "execution_route": "auto",
                    "recommended_action_id": "restart",
                    "selection_required": False,
                    "target": {
                        "workflow_run_id": "workflow-1",
                        "cluster_id": "target",
                        "workspace_id": "workspace-a",
                    },
                    "candidates": [{"action_id": "restart"}],
                },
                "selected": {
                    "action_id": "restart",
                    "title": "Restart workload",
                    "route": "auto",
                    "draft": {
                        "action_type": "rollout_restart",
                        "params": {"workflow_run_id": "workflow-1"},
                    },
                },
            },
        )
    )

    assert update is not None
    assert update["workflow_run_id"] == "workflow-1"
    assert update["event_type"] == "recovery.action_selected"
    assert update["details"]["recovery"]["selected_route"] == "auto"
    assert update["details"]["recovery"]["selected_action_id"] == "restart"


def test_release_safe_pr_event_projects_pr_status() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "safe_pr.created",
            {
                "workspace_id": "workspace-a",
                "workflow_run_id": "workflow-1",
                "application_id": "app-a",
                "provider": "github",
                "mode": "create",
                "pr_url": "https://github.example/pull/1",
                "commit_sha": "abc123",
                "patch_sha256": "a" * 64,
            },
        )
    )

    assert update is not None
    assert update["workflow_run_id"] == "workflow-1"
    assert update["details"]["safe_pr"]["pr_url"] == "https://github.example/pull/1"
    assert update["details"]["safe_pr"]["provider"] == "github"
    assert update["details"]["safe_pr"]["commit_sha"] == "abc123"
    assert update["details"]["safe_pr"]["patch_sha256"] == "a" * 64


def test_release_safe_pr_failed_projects_repo_and_failure_context() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "safe_pr.failed",
            {
                "workspace_id": "workspace-a",
                "workflow_run_id": "workflow-1",
                "application_id": "app-a",
                "provider": "github",
                "repo_ref": "org/checkout",
                "base_branch": "release-main",
                "manifest_path": "deploy/checkout.yaml",
                "commit_sha": "abc123",
                "patch_sha256": "b" * 64,
                "reason": "safe pr provider failed before PR creation completed",
                "reason_code": "provider_error",
                "stage": "scm",
                "details": {"exception_type": "ValueError"},
            },
        )
    )

    assert update is not None
    safe_pr = update["details"]["safe_pr"]
    assert safe_pr["repo_ref"] == "org/checkout"
    assert safe_pr["base_branch"] == "release-main"
    assert safe_pr["manifest_path"] == "deploy/checkout.yaml"
    assert safe_pr["commit_sha"] == "abc123"
    assert safe_pr["patch_sha256"] == "b" * 64
    assert safe_pr["reason_code"] == "provider_error"
    assert safe_pr["stage"] == "scm"
    assert safe_pr["exception_type"] == "ValueError"


def test_release_command_event_projects_agent_queue() -> None:
    update = release_workflow_update_from_event(
        _evt(
            "command.queued_for_agent",
            {
                "workspace_id": "workspace-a",
                "workflow_run_id": "workflow-1",
                "application_id": "app-a",
                "cluster_id": "target",
                "command_id": "cmd-1",
                "approval_ref": "approval-1",
            },
        )
    )

    assert update is not None
    assert update["workflow_run_id"] == "workflow-1"
    assert update["details"]["command"]["command_id"] == "cmd-1"
    assert update["details"]["command"]["cluster_id"] == "target"
    assert update["details"]["command"]["approval_ref"] == "approval-1"


def test_release_flow_worker_projects_failure_and_queues_evidence() -> None:
    worker = load_service("projection/release-flow-worker")
    db = ReleaseProjectionDb()

    outs = run_handler(
        worker.on_event,
        _evt(
            "workflow.run.failed",
            {
                "workspace_id": "workspace-a",
                "workflow_run_id": "workflow-1",
                "application_id": "app-a",
                "cluster_id": "target",
                "reason": "rollout health failed",
            },
        ),
        db=db,
    )

    assert subjects_of(outs) == ["alert.requested", "evidence.jobs.queued"]
    alert = outs[0]
    assert alert.workspace_id == "workspace-a"
    assert alert.cluster_id == "target"
    assert alert.severity == "critical"
    assert alert.message == "app-a: rollout health failed"
    queued = outs[1]
    assert queued.workspace_id == "workspace-a"
    assert queued.cluster_id == "target"
    assert queued.source_id == "release-workflow-failure"
    assert queued.window_start == "workflow-1"
    assert queued.workflow_run_id == "workflow-1"
    assert queued.provider_keys == ["kubernetes", "metrics", "logs", "traces"]
    assert queued.queued == 4
    assert queued.job_ids == ["job-kubernetes", "job-metrics", "job-logs", "job-traces"]
    assert queued.evidence_key == "workspace-a:target:release-workflow-failure:workflow-1"
    assert [name for name, _payload in db.calls] == [
        "project_release_workflow_event",
        "queue_evidence_jobs",
        "project_release_workflow_event",
    ]
    first_update = db.calls[0][1]
    evidence_request = db.calls[1][1]
    evidence_update = db.calls[2][1]
    assert first_update["step_status"] == "failed"
    assert evidence_request["provider_keys"] == ["kubernetes", "metrics", "logs", "traces"]
    assert evidence_update["event_type"] == "evidence.queued"


def test_release_flow_worker_typed_dispatch_preserves_envelope_metadata() -> None:
    worker = load_service("projection/release-flow-worker")
    db = ReleaseProjectionDb()
    envelope = _evt(
        "workflow.run.failed",
        {
            "workspace_id": "workspace-a",
            "workflow_run_id": "workflow-1",
            "application_id": "app-a",
            "cluster_id": "target",
            "reason": "rollout health failed",
        },
    )
    subscription = next(
        item for item in worker.app.subscriptions if item.subject == envelope.subject
    )

    outputs = asyncio.run(make_event_handler(subscription, db, worker.app.name)(envelope))

    assert [item.subject for item in outputs] == ["alert.requested", "evidence.jobs.queued"]
    assert all(item.correlation_id == envelope.correlation_id for item in outputs)
    assert all(item.causation_id == envelope.event_id for item in outputs)


def test_release_flow_worker_alerts_on_verification_failure() -> None:
    worker = load_service("projection/release-flow-worker")
    db = ReleaseProjectionDb()

    outs = run_handler(
        worker.on_event,
        _evt(
            "evidence.job.updated",
            {
                "workspace_id": "workspace-a",
                "workflow_run_id": "workflow-1",
                "application_id": "checkout",
                "cluster_id": "target",
                "job_id": "release-verification-a",
                "provider_key": "http_probe",
                "status": "failed",
                "source_id": "post-deploy-verification",
                "evidence_key": "plan-a:wave-1:checkout:post-deploy-verification",
                "error": "HTTP 503",
            },
        ),
        db=db,
    )

    assert subjects_of(outs) == ["alert.requested"]
    alert = outs[0]
    assert alert.severity == "critical"
    assert alert.reason == "release verification failed"
    assert alert.application_id == "checkout"
    assert alert.workflow_run_id == "workflow-1"
    assert alert.message == "checkout: post-deploy verification http_probe failed"
    assert [name for name, _payload in db.calls] == ["project_release_workflow_event"]


def test_release_flow_worker_ignores_unrelated_events() -> None:
    worker = load_service("projection/release-flow-worker")
    db = ReleaseProjectionDb()

    outs = run_handler(worker.on_event, _evt("mail.email_verification.sent"), db=db)

    assert outs == []
    assert db.calls == []


def test_repository_projects_workflow_failure_into_release_run_step() -> None:
    connection = _FakeConnection()
    repository = _repository_with_fake_connection(connection)

    result = repository.project_release_workflow_event(
        {
            "workspace_id": "workspace-a",
            "workflow_run_id": "workflow-1",
            "application_id": "app-a",
            "step_status": "failed",
            "health_status": "unhealthy",
            "event_type": "workflow.run.failed",
            "message": "rollout failed",
            "details": {"workflow_projection": {"status": "failed"}},
        }
    )

    sql = "\n".join(
        str(statement.compile(dialect=postgresql.dialect())) for statement in connection.statements
    )
    assert result == {"workspace_id": "workspace-a", "run_id": "release-run-1"}
    assert "UPDATE release_run_steps" in sql
    assert "INSERT INTO release_run_events" in sql
    assert "UPDATE release_runs" in sql

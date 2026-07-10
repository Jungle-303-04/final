"""RCA test-run orchestration values derived from one immutable run id.

This module contains no Kubernetes manifest input.  It produces only the two
allowlisted agent commands and projects existing command/evidence/RCA records
into a developer-readable status response.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any

from domains.rca.test_scenarios import KubernetesDeploymentTrigger, RcaTestScenario
from packages.config.constants import (
    RCA_TEST_COMMAND_ACTIONS,
    Command,
    CommandStatus,
    Sandbox,
)
from packages.contracts.event_bus.interfaces import JsonObject

RCA_TEST_EVIDENCE_SOURCE_ID = "rca-test"
RCA_TEST_FIXTURE_RESOURCE_KIND = "Deployment"
RCA_TEST_AGENT_ACTIONS = RCA_TEST_COMMAND_ACTIONS
RCA_TEST_COMMAND_PRIORITY = 200
RCA_TEST_RUN_ANNOTATION = "kubeheal.io/rca-test-run"
RCA_TEST_EXPIRES_AT_ANNOTATION = "kubeheal.io/rca-test-expires-at"
RCA_TEST_RESOURCE_LABEL = "kubeheal.io/rca-test"
RCA_TEST_RUN_LABEL = "kubeheal.io/rca-test-run"
RCA_TEST_RESOURCE_NAME_PATTERN = re.compile(r"^rca-test-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")


@dataclass(frozen=True)
class RcaTestRunIdentity:
    run_id: str
    correlation_id: str
    inject_command_id: str
    cleanup_command_id: str
    evidence_source_id: str
    evidence_window_start: str

    def to_body(self) -> JsonObject:
        return asdict(self)


@dataclass(frozen=True)
class RcaTestFixtureTarget:
    namespace: str
    resource_name: str


def validate_rca_test_fixture_target(namespace: str, resource_name: str) -> None:
    """Accept only the server-owned sandbox fixture namespace/name shape."""
    if namespace != Sandbox.NAMESPACE:
        raise ValueError("RCA test fixture namespace must be sandbox")
    if len(resource_name) > 63 or RCA_TEST_RESOURCE_NAME_PATTERN.fullmatch(resource_name) is None:
        raise ValueError("invalid RCA test fixture resource name")


def rca_test_scenario_fixture_target(scenario: RcaTestScenario) -> RcaTestFixtureTarget:
    if not isinstance(scenario.trigger, KubernetesDeploymentTrigger):
        raise ValueError("RCA test scenario does not have a Kubernetes fixture target")
    target = RcaTestFixtureTarget(
        namespace=scenario.safety.namespace,
        resource_name=scenario.trigger.params.resource_name,
    )
    validate_rca_test_fixture_target(target.namespace, target.resource_name)
    return target


def rca_test_command_fixture_target(command: JsonObject) -> RcaTestFixtureTarget:
    plan = command.get("payload")
    plan_body = plan if isinstance(plan, dict) else {}
    payload = plan_body.get("payload")
    payload_body = payload if isinstance(payload, dict) else {}
    target = RcaTestFixtureTarget(
        namespace=str(payload_body.get("namespace") or ""),
        resource_name=str(payload_body.get("resource_name") or ""),
    )
    validate_rca_test_fixture_target(target.namespace, target.resource_name)
    return target


def rca_test_run_identity(run_id: str) -> RcaTestRunIdentity:
    return RcaTestRunIdentity(
        run_id=run_id,
        correlation_id=f"corr-rca-test-{run_id}",
        inject_command_id=f"cmd-rca-test-inject-{run_id}",
        cleanup_command_id=f"cmd-rca-test-cleanup-{run_id}",
        evidence_source_id=RCA_TEST_EVIDENCE_SOURCE_ID,
        evidence_window_start=run_id,
    )


def _command_plan(
    *,
    run_id: str,
    scenario_id: str,
    scenario_version: int,
    namespace: str,
    resource_name: str,
    cluster_id: str,
    workspace_id: str,
    requested_by: str,
    cleanup: bool,
    expected_root_cause: str | None = None,
    expected_symptom: str | None = None,
    expires_at: str | None = None,
) -> JsonObject:
    validate_rca_test_fixture_target(namespace, resource_name)
    identity = rca_test_run_identity(run_id)
    action = (
        Command.RCA_TEST_SCENARIO_CLEANUP_ACTION
        if cleanup
        else Command.RCA_TEST_SCENARIO_INJECT_ACTION
    )
    command_id = identity.cleanup_command_id if cleanup else identity.inject_command_id
    operation = "cleanup" if cleanup else "inject"
    command_payload: JsonObject = {
        "run_id": run_id,
        "scenario_id": scenario_id,
        "scenario_version": scenario_version,
        "resource_kind": RCA_TEST_FIXTURE_RESOURCE_KIND,
        "namespace": namespace,
        "resource_name": resource_name,
    }
    if not cleanup:
        if not expected_root_cause or not expected_symptom or not expires_at:
            raise ValueError("RCA test inject requires immutable expectations and expires_at")
        command_payload.update(
            {
                "expected_root_cause": expected_root_cause,
                "expected_symptom": expected_symptom,
                "expires_at": expires_at,
            }
        )
    else:
        command_payload["cleanup_adapter"] = "kubernetes.manifest_delete"
    plan: JsonObject = {
        "command_id": command_id,
        "idempotency_key": command_id,
        "cluster_id": cluster_id,
        "action": action,
        "namespace": Sandbox.NAMESPACE,
        "diff": {
            "resource": f"rca-test/{scenario_id}",
            "namespace": Sandbox.NAMESPACE,
            "risk": Sandbox.RISK_TAG.value,
            "status": f"rca_test_{operation}",
            "basis": {
                "run_id": run_id,
                "scenario_id": scenario_id,
                "scenario_version": scenario_version,
            },
        },
        "payload": command_payload,
        "steps": [f"RCA test {operation}: {scenario_id}"],
        "lease": {"lease_seconds": 180, "heartbeat_interval_seconds": 10},
        "retry_policy": {"max_attempts": 3, "retry_delay_seconds": 5},
        "routing_constraint": {
            "channel": "agent",
            "cluster_id": cluster_id,
            "workspace_id": workspace_id,
            "required_capability": "command_receiver",
        },
        "workspace_id": workspace_id,
        "environment": "sandbox",
        "priority": RCA_TEST_COMMAND_PRIORITY,
        "requested_by": requested_by,
        "reason": f"RCA test {operation}: {scenario_id}",
        "correlation_id": identity.correlation_id,
    }
    if expires_at:
        plan["expires_at"] = expires_at
    return plan


def build_rca_test_inject_plan(**kwargs: Any) -> JsonObject:
    return _command_plan(cleanup=False, **kwargs)


def build_rca_test_cleanup_plan(**kwargs: Any) -> JsonObject:
    return _command_plan(cleanup=True, **kwargs)


def rca_test_fixture_owned_by_run(resource: JsonObject, run_id: str) -> bool:
    metadata = resource.get("metadata")
    if not isinstance(metadata, dict):
        return False
    annotations = metadata.get("annotations")
    return isinstance(annotations, dict) and annotations.get(RCA_TEST_RUN_ANNOTATION) == run_id


def build_rca_test_manifests(
    scenario: RcaTestScenario,
    run_id: str,
    expires_at: str,
) -> list[JsonObject]:
    """Materialize only a typed, repository-owned sandbox recipe."""
    if scenario.availability != "ready" or not isinstance(
        scenario.trigger, KubernetesDeploymentTrigger
    ):
        raise ValueError(
            f"RCA test scenario cannot create a Kubernetes fixture: {scenario.scenario_id}"
        )
    params = scenario.trigger.params
    name = params.resource_name
    labels = {
        "app": name,
        RCA_TEST_RESOURCE_LABEL: "true",
        RCA_TEST_RUN_LABEL: run_id,
    }
    annotations = {
        RCA_TEST_RUN_ANNOTATION: run_id,
        RCA_TEST_EXPIRES_AT_ANNOTATION: expires_at,
    }
    template_labels = dict(labels)
    container: JsonObject = {
        "name": "fault",
        "image": "busybox:1.36.1",
        "command": ["/bin/sh", "-c", "sleep 3600"],
        "resources": {
            "requests": {"cpu": "10m", "memory": "8Mi"},
            "limits": {"cpu": "50m", "memory": "32Mi"},
        },
        "securityContext": {
            "allowPrivilegeEscalation": False,
            "capabilities": {"drop": ["ALL"]},
        },
    }
    pod_spec: JsonObject = {
        "automountServiceAccountToken": False,
        "containers": [container],
    }
    mode = params.fault_mode
    short_run = run_id.replace("-", "")[:12]
    if mode == "wrong_image_tag":
        container["image"] = f"{params.image_repository}:rca-test-missing-{short_run}"
        container.pop("command", None)
    elif mode == "registry_unavailable":
        container["image"] = f"127.0.0.1:65534/rca-test/unavailable:{short_run}"
        container.pop("command", None)
    elif mode == "oom_killed":
        container["command"] = [
            "/bin/sh",
            "-c",
            "echo RCA_TEST_OOM; sleep 2; tail /dev/zero",
        ]
    elif mode == "config_env_error":
        container["command"] = [
            "/bin/sh",
            "-c",
            "echo 'FATAL: required environment variable DATABASE_URL is not set'; exit 1",
        ]
    elif mode in {"app_startup_failure", "bad_image_rollout"}:
        container["command"] = [
            "/bin/sh",
            "-c",
            "echo 'FATAL: startup failed'; exit 1",
        ]
    elif mode == "dependency_connection_failure":
        container["command"] = [
            "/bin/sh",
            "-c",
            "echo 'dependency connection refused'; exit 1",
        ]
    elif mode == "insufficient_cpu":
        container["resources"] = {"requests": {"cpu": "100000", "memory": "8Mi"}}
    elif mode == "insufficient_memory":
        container["resources"] = {"requests": {"cpu": "10m", "memory": "100Ti"}}
    elif mode == "affinity_mismatch":
        pod_spec["nodeSelector"] = {"kubeheal.io/rca-test-node": "absent"}
    elif mode in {"readiness_probe_failure", "upstream_empty"}:
        container["command"] = ["/bin/sh", "-c", "httpd -f -p 8080"]
        container["ports"] = [{"name": "http", "containerPort": 8080}]
        if mode == "readiness_probe_failure":
            # kubelet의 probe 이벤트는 Kubernetes evidence가 되고, 아래 run-scoped
            # 애플리케이션 로그는 ingress RCA rule의 logs 근거가 된다.
            container["command"] = [
                "/bin/sh",
                "-c",
                (
                    "httpd -p 8080; "
                    "while true; do echo 'ERROR readiness probe failed'; sleep 5; done"
                ),
            ]
            container["readinessProbe"] = {
                "httpGet": {"path": "/", "port": 9090},
                "initialDelaySeconds": 2,
                "periodSeconds": 3,
            }
    elif mode == "http_5xx":
        container["image"] = "python:3.13-alpine"
        container["command"] = [
            "python",
            "-c",
            (
                "from http.server import BaseHTTPRequestHandler,HTTPServer;"
                "H=type('H',(BaseHTTPRequestHandler,),{"
                "'do_GET':lambda s:(s.send_response(500),s.end_headers(),"
                "s.wfile.write(b'intentional_error_endpoint'))});"
                "HTTPServer(('0.0.0.0',8080),H).serve_forever()"
            ),
        ]
        container["ports"] = [{"name": "http", "containerPort": 8080}]

    deployment: JsonObject = {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {
            "name": name,
            "namespace": scenario.safety.namespace,
            "labels": labels,
            "annotations": annotations,
        },
        "spec": {
            "replicas": params.replicas,
            "selector": {"matchLabels": {"app": name}},
            "template": {
                "metadata": {"labels": template_labels},
                "spec": pod_spec,
            },
        },
    }
    manifests = [deployment]
    if mode in {"readiness_probe_failure", "upstream_empty", "http_5xx"}:
        selector = {"app": f"{name}-missing"} if mode == "upstream_empty" else {"app": name}
        manifests.append(
            {
                "apiVersion": "v1",
                "kind": "Service",
                "metadata": {
                    "name": name,
                    "namespace": scenario.safety.namespace,
                    "labels": labels,
                    "annotations": annotations,
                },
                "spec": {
                    "selector": selector,
                    "ports": [{"name": "http", "port": 80, "targetPort": "http"}],
                },
            }
        )
    return manifests


def rca_test_observation_matches(
    scenario: RcaTestScenario,
    snapshot: JsonObject,
    run_id: str,
) -> bool:
    """Require every configured Kubernetes signal group for the current run."""
    pods = [
        pod
        for pod in snapshot.get("pods", [])
        if isinstance(pod, dict)
        and isinstance(pod.get("labels"), dict)
        and pod["labels"].get(RCA_TEST_RUN_LABEL) == run_id
    ]
    pod_names = {str(pod.get("name") or "") for pod in pods}
    events = [
        item
        for item in snapshot.get("events", [])
        if isinstance(item, dict) and str(item.get("involved_name") or "") in pod_names
    ]
    observe = scenario.observe
    checks: list[bool] = []
    if observe.pod_waiting_reasons:
        expected = set(observe.pod_waiting_reasons)
        checks.append(
            any(
                expected.intersection(str(value) for value in pod.get("waiting_reasons", []))
                for pod in pods
            )
        )
    if observe.pod_terminated_reasons:
        expected = set(observe.pod_terminated_reasons)
        checks.append(
            any(
                expected.intersection(str(value) for value in pod.get("terminated_reasons", []))
                for pod in pods
            )
        )
    if observe.event_reasons:
        expected = {value.casefold() for value in observe.event_reasons}
        checks.append(any(str(item.get("reason") or "").casefold() in expected for item in events))
    if observe.event_message_any:
        patterns = [value.casefold() for value in observe.event_message_any]
        checks.append(
            any(
                any(pattern in str(item.get("message") or "").casefold() for pattern in patterns)
                for item in events
            )
        )
    return bool(checks) and all(checks)


def _step(step: str, status: str) -> JsonObject:
    return {"step": step, "status": status}


def synthesize_rca_test_run_status(
    *,
    run_id: str,
    inject_command: JsonObject | None,
    evidence_jobs: list[JsonObject],
    evidence_window: JsonObject | None,
    rca_report: JsonObject | None,
    recovery_plan: JsonObject | None,
    cleanup_command: JsonObject | None,
    analysis_outcome: JsonObject | None = None,
) -> JsonObject:
    identity = rca_test_run_identity(run_id)
    command_status = str((inject_command or {}).get("status") or "queued")
    result = (inject_command or {}).get("result")
    result_body = result if isinstance(result, dict) else {}
    test_result = result_body.get("rca_test")
    test_body = test_result if isinstance(test_result, dict) else {}
    observed = test_body.get("fault_observed") is True
    jobs_failed = any(str(job.get("status")) == CommandStatus.FAILED for job in evidence_jobs)
    jobs_complete = bool(evidence_jobs) and all(
        str(job.get("status")) == CommandStatus.COMPLETED for job in evidence_jobs
    )
    evidence_complete = evidence_window is not None or jobs_complete
    inject_plan = (inject_command or {}).get("payload")
    inject_plan_body = inject_plan if isinstance(inject_plan, dict) else {}
    inject_payload = inject_plan_body.get("payload")
    inject_payload_body = inject_payload if isinstance(inject_payload, dict) else {}
    expected_root_cause = str(inject_payload_body.get("expected_root_cause") or "")
    actual_root_cause = str((rca_report or {}).get("root_cause") or "")
    root_cause_mismatch = bool(
        rca_report is not None and expected_root_cause and actual_root_cause != expected_root_cause
    )
    outcome_subject = str((analysis_outcome or {}).get("subject") or "")
    outcome_payload = (analysis_outcome or {}).get("payload")
    outcome_body = outcome_payload if isinstance(outcome_payload, dict) else {}
    analysis_blocked = outcome_subject == "rca.analysis_blocked"
    non_incident = outcome_subject == "incident.detected" and outcome_body.get("detected") is False
    analysis_terminal = root_cause_mismatch or analysis_blocked or non_incident
    plan_status = str((recovery_plan or {}).get("status") or "")
    selected = plan_status == "selected" and not analysis_terminal
    cleanup_command_status = str((cleanup_command or {}).get("status") or "pending")
    cleanup_result = (cleanup_command or {}).get("result")
    cleanup_result_body = cleanup_result if isinstance(cleanup_result, dict) else {}
    cleanup_test_result = cleanup_result_body.get("rca_test")
    cleanup_test_body = cleanup_test_result if isinstance(cleanup_test_result, dict) else {}
    cleanup_status = cleanup_command_status
    if cleanup_command_status == CommandStatus.COMPLETED:
        cleanup_skipped = (
            cleanup_test_body.get("cleanup_completed") is False
            or cleanup_test_body.get("cleanup_status") == "skipped"
        )
        cleanup_status = "skipped" if cleanup_skipped else "completed"

    if cleanup_command_status == CommandStatus.FAILED:
        overall = "failed"
    elif cleanup_command_status == CommandStatus.COMPLETED:
        overall = "cleanup_skipped" if cleanup_status == "skipped" else "cleanup_completed"
    elif cleanup_command_status in {
        CommandStatus.QUEUED,
        CommandStatus.LEASED,
        CommandStatus.RUNNING,
    }:
        overall = f"cleanup_{cleanup_command_status}"
    elif command_status == CommandStatus.FAILED or jobs_failed:
        overall = "failed"
    elif command_status in {CommandStatus.QUEUED, CommandStatus.LEASED, CommandStatus.RUNNING}:
        overall = "injecting"
    elif not evidence_complete:
        overall = "collecting"
    elif root_cause_mismatch or non_incident:
        overall = "failed"
    elif analysis_blocked:
        overall = "blocked"
    elif rca_report is None:
        overall = "analyzing"
    elif recovery_plan is None:
        overall = "planning"
    elif plan_status == "selection_requested":
        overall = "selection_required"
    elif selected:
        overall = "selected"
    else:
        overall = plan_status or "recovery_planned"

    failure: JsonObject | None = None
    if command_status == CommandStatus.FAILED:
        failure = {
            "stage": "fault_observation",
            "message": str(result_body.get("message") or result_body.get("stderr") or "failed"),
        }
    elif jobs_failed:
        failure = {
            "stage": "evidence_collection",
            "providers": [
                {
                    "provider_key": str(job.get("provider_key") or "unknown"),
                    "message": str(job.get("error") or "evidence provider failed"),
                }
                for job in evidence_jobs
                if str(job.get("status")) == CommandStatus.FAILED
            ],
        }
    elif cleanup_command_status == CommandStatus.FAILED:
        failure = {
            "stage": "cleanup",
            "message": str(
                cleanup_result_body.get("message")
                or cleanup_result_body.get("stderr")
                or "cleanup failed"
            ),
        }
    elif root_cause_mismatch:
        failure = {
            "stage": "root_cause_analysis",
            "message": "RCA root cause did not match the test expectation",
            "expected_root_cause": expected_root_cause,
            "actual_root_cause": actual_root_cause,
        }
    elif analysis_blocked:
        failure = {
            "stage": "root_cause_analysis",
            "message": str(outcome_body.get("reason") or "RCA analysis blocked"),
            "reason_code": str(outcome_body.get("reason_code") or "analysis_blocked"),
        }
    elif non_incident:
        failure = {
            "stage": "incident_detection",
            "message": str(outcome_body.get("reason") or "incident not detected"),
        }
    analysis_step_status = "waiting"
    if root_cause_mismatch or non_incident:
        analysis_step_status = "failed"
    elif analysis_blocked:
        analysis_step_status = "blocked"
    elif rca_report:
        analysis_step_status = "completed"
    recovery_step_status = (
        "blocked" if analysis_terminal else ("completed" if recovery_plan else "waiting")
    )
    return {
        "run_id": run_id,
        "correlation_id": identity.correlation_id,
        "status": overall,
        "failure": failure,
        "steps": [
            _step(
                "fault_injection",
                "completed"
                if command_status == CommandStatus.COMPLETED
                else ("failed" if command_status == CommandStatus.FAILED else "running"),
            ),
            _step(
                "fault_observation",
                "completed"
                if observed
                else ("failed" if command_status == CommandStatus.FAILED else "waiting"),
            ),
            _step(
                "evidence_collection",
                "failed" if jobs_failed else ("completed" if evidence_complete else "waiting"),
            ),
            _step("root_cause_analysis", analysis_step_status),
            _step("recovery_plan", recovery_step_status),
            _step("action_selection", "completed" if selected else "waiting"),
            _step("cleanup", cleanup_status),
        ],
    }

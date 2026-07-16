from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException

from domains.command.events import CommandRequestedBody
from domains.command.handler import build_plan
from domains.command.router import (
    RESOURCE_ACCESS_DENIED,
    agent_debug_query,
    cancel_command,
    command_events,
    command_heartbeat,
    command_result,
    command_start,
    command_status,
    commands,
    lease_next_command,
    restart_deployment,
    resume_cronjob,
    retry_command,
    scale_deployment,
    suspend_cronjob,
    trigger_cronjob,
)
from domains.identity.dependencies import ClusterAgentIdentity
from packages.config.constants import Command
from packages.contracts.gateway.requests import (
    AgentDebugQueryRequest,
    CommandControlRequest,
    CommandHeartbeatRequest,
    CommandRequest,
    CommandResultRequest,
    CommandStartRequest,
    ConfirmedResourceActionRequest,
    DeploymentRestartRequest,
    DeploymentScaleRequest,
)
from packages.contracts.gateway.responses import AcceptedResponse
from packages.runtime.operation_events import InMemoryOperationEventBroker

AGENT_IDENTITY = ClusterAgentIdentity(
    workspace_id="trusted-workspace",
    cluster_id="trusted-cluster",
)


class SpyAccessDb:
    def __init__(self, allowed: bool, *, cluster_role: str = "target") -> None:
        self.allowed = allowed
        self.cluster_role = cluster_role
        self.calls: list[tuple[str, str, str, str, str]] = []

    def user_has_resource_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        action: str,
    ) -> bool:
        self.calls.append((user_id, workspace_id, resource_type, resource_id, action))
        return self.allowed

    def get_cluster_registration(
        self, workspace_id: str, cluster_id: str
    ) -> dict[str, object] | None:
        return {
            "workspace_id": workspace_id,
            "cluster_id": cluster_id,
            "settings": {"cluster_role": self.cluster_role},
        }


class SpyDebugQueryDb(SpyAccessDb):
    def __init__(self, allowed: bool) -> None:
        super().__init__(allowed)
        self.queued: list[tuple[str, dict[str, object], str]] = []

    def queue_agent_command(
        self,
        correlation_id: str,
        plan: dict[str, object],
        status: str,
    ) -> None:
        self.queued.append((correlation_id, plan, status))


class SpyEvents:
    def __init__(self) -> None:
        self.body: object | None = None
        self.actor: object | None = None
        self.accept_kwargs: dict[str, object] = {}

    async def accept_body(self, body: object, actor: object, **kwargs: object) -> object:
        self.body = body
        self.actor = actor
        self.accept_kwargs = kwargs
        event = SimpleNamespace(event_id="evt-1", correlation_id="corr-1")
        return SimpleNamespace(event=event)


class ControlStageResult:
    def __init__(
        self, *, first: dict[str, object] | None = None, one: dict[str, object] | None = None
    ):
        self._first = first
        self._one = one

    def mappings(self) -> ControlStageResult:
        return self

    def first(self) -> dict[str, object] | None:
        return self._first

    def one(self) -> dict[str, object]:
        assert self._one is not None
        return self._one

    def scalar_one_or_none(self) -> int:
        return 1


class ControlStageConnection:
    def __init__(self, command: dict[str, object], *, operation_event_call: int = 6) -> None:
        self.command = command
        self.operation_event_call = operation_event_call
        self.calls = 0

    def execute(self, _statement: object, *_args: object, **_kwargs: object) -> ControlStageResult:
        self.calls += 1
        if self.calls == 1:
            return ControlStageResult(first=self.command)
        if self.calls == 2:
            return ControlStageResult(first=None)
        if self.calls == self.operation_event_call:
            return ControlStageResult(
                one={
                    "command_id": self.command["command_id"],
                    "sequence": 2,
                    "kind": "cancelled",
                    "payload": {
                        "cluster_id": self.command["cluster_id"],
                        "status": "cancelled",
                    },
                    "occurred_at": datetime(2026, 7, 16, tzinfo=UTC),
                }
            )
        return ControlStageResult()


class ControlEvents:
    def __init__(self, connection: ControlStageConnection) -> None:
        self.connection = connection
        self.body: object | None = None

    async def accept_body(self, body: object, **kwargs: object) -> object:
        self.body = body
        event = SimpleNamespace(event_id="evt-control-1", correlation_id="corr-1")
        stage = kwargs["transactional_stage"]
        assert callable(stage)
        stage(self.connection, event)
        return SimpleNamespace(event=event)


class DuplicateControlEvents:
    async def accept_body(self, _body: object, **_kwargs: object) -> object:
        from domains.command.repository import DuplicateCommandControl

        raise DuplicateCommandControl(
            {
                "command_id": "cmd-control-1",
                "action": "cancel",
                "event_id": "evt-control-1",
                "audit_event_id": "evt-control-1",
                "attempt_id": None,
                "details": {"correlation_id": "corr-1", "status_after": "cancel_requested"},
            }
        )


class ControlDb(SpyAccessDb):
    def __init__(
        self,
        command: dict[str, object],
        *,
        allowed: bool = True,
        cluster_role: str = "target",
    ) -> None:
        super().__init__(allowed, cluster_role=cluster_role)
        self.command = command

    async def get_agent_command(
        self, _command_id: str, _workspace_id: str
    ) -> dict[str, object] | None:
        return self.command

    def list_cluster_agent_statuses(
        self, _workspace_id: str, _cluster_id: str
    ) -> list[dict[str, object]]:
        return [{"status": "connected", "capabilities": ["command_receiver"]}]


def current_session() -> SimpleNamespace:
    return SimpleNamespace(user_id="user-1", roles=("user",), workspace_id="workspace-1")


class SpyCommandLeaseDb:
    def __init__(self, correlation_id: str | None) -> None:
        self.correlation_id = correlation_id
        self.calls: list[tuple[str, str, str, str, str, int]] = []

    async def start_agent_command(
        self,
        command_id: str,
        workspace_id: str,
        cluster_id: str,
        lease_id: str,
        agent_id: str,
        running_status: str,
        lease_seconds: int,
    ) -> str | None:
        self.calls.append((command_id, workspace_id, cluster_id, lease_id, agent_id, lease_seconds))
        return self.correlation_id

    async def heartbeat_agent_command(
        self,
        command_id: str,
        workspace_id: str,
        cluster_id: str,
        lease_id: str,
        agent_id: str,
        lease_seconds: int,
    ) -> str | None:
        self.calls.append((command_id, workspace_id, cluster_id, lease_id, agent_id, lease_seconds))
        return self.correlation_id


class SpyUninstallResultDb:
    def __init__(self, *, action: str, cluster_role: str = "target") -> None:
        self.action = action
        self.cluster_role = cluster_role
        self.completed: list[dict[str, object]] = []
        self.unregistered: list[tuple[str, str]] = []

    async def get_agent_command(self, command_id: str, workspace_id: str) -> dict[str, object]:
        return {
            "command_id": command_id,
            "workspace_id": workspace_id,
            "cluster_id": "trusted-cluster",
            "action": self.action,
        }

    async def complete_agent_command_and_stage_event(
        self,
        command_id: str,
        workspace_id: str,
        cluster_id: str,
        result: dict[str, object],
        lease_id: str,
        agent_id: str,
        source: str,
    ) -> SimpleNamespace:
        self.completed.append(
            {
                "command_id": command_id,
                "workspace_id": workspace_id,
                "cluster_id": cluster_id,
                "result": result,
                "lease_id": lease_id,
                "agent_id": agent_id,
                "source": source,
            }
        )
        return SimpleNamespace(event_id="evt-uninstall")

    def get_cluster_registration(self, workspace_id: str, cluster_id: str) -> dict[str, object]:
        return {
            "workspace_id": workspace_id,
            "cluster_id": cluster_id,
            "settings": {"cluster_role": self.cluster_role},
        }

    def unregister_target_cluster(self, workspace_id: str, cluster_id: str) -> bool:
        self.unregistered.append((workspace_id, cluster_id))
        return True


def manual_diff() -> dict[str, str]:
    return {
        "resource": "deployment/checkout-api",
        "namespace": "sandbox",
        "desired_image": "img:new",
        "actual_image": "img:old",
        "risk": "sandbox-only",
    }


def control_command(*, status: str = "queued", direct_execution: bool = False) -> dict[str, object]:
    return {
        "command_id": "cmd-control-1",
        "workspace_id": "workspace-1",
        "cluster_id": "cluster-1",
        "correlation_id": "corr-1",
        "action": Command.DEFAULT_ACTION,
        "status": status,
        "result": {"retryable": True} if status == "failed" else {},
        "payload": {
            "action": Command.DEFAULT_ACTION,
            "namespace": "sandbox",
            "diff": {},
            "payload": {},
            "retry_policy": {"max_attempts": 3, "retry_delay_seconds": 0},
        },
        "direct_execution": direct_execution,
        "confirmation_event_id": "evt-original" if direct_execution else None,
        "impact_identity": "mismatch" if direct_execution else None,
        "attempt_count": 1,
        "active_attempt_id": None,
        "cancel_generation": 0,
    }


def test_cancel_control_stages_audit_state_and_terminal_sse_before_202() -> None:
    async def run() -> None:
        command = control_command()
        connection = ControlStageConnection(command)
        events = ControlEvents(connection)
        response = await cancel_command(
            "cmd-control-1",
            CommandControlRequest(reason="operator stopped rollout"),
            "cancel-key-1",
            current_session(),
            ControlDb(command),
            events,
            InMemoryOperationEventBroker(),
        )

        assert response.accepted is True
        assert response.status == "cancelled"
        assert response.audit_event_id == response.event_id == "evt-control-1"
        assert connection.calls == 7

    asyncio.run(run())


def test_cancel_control_same_idempotency_key_returns_original_receipt() -> None:
    async def run() -> None:
        command = control_command(status="cancel_requested")
        response = await cancel_command(
            "cmd-control-1",
            CommandControlRequest(),
            "cancel-key-1",
            current_session(),
            ControlDb(command),
            DuplicateControlEvents(),
            InMemoryOperationEventBroker(),
        )

        assert response.idempotent is True
        assert response.status == "cancel_requested"
        assert response.event_id == "evt-control-1"

    asyncio.run(run())


def test_retry_rechecks_current_rbac_before_it_can_reuse_a_failed_command() -> None:
    async def run() -> None:
        command = control_command(status="failed")
        with pytest.raises(HTTPException) as error:
            await retry_command(
                "cmd-control-1",
                CommandControlRequest(),
                "retry-key-1",
                current_session(),
                ControlDb(command, allowed=False),
                DuplicateControlEvents(),
                InMemoryOperationEventBroker(),
            )
        assert error.value.status_code == 403

    asyncio.run(run())


def test_retry_rechecks_current_management_cluster_policy() -> None:
    async def run() -> None:
        command = control_command(status="failed")
        with pytest.raises(HTTPException) as error:
            await retry_command(
                "cmd-control-1",
                CommandControlRequest(),
                "retry-key-1",
                current_session(),
                ControlDb(command, cluster_role="management"),
                DuplicateControlEvents(),
                InMemoryOperationEventBroker(),
            )
        assert error.value.status_code == 400
        assert error.value.detail["code"] == "management_readonly"

    asyncio.run(run())


def test_direct_retry_rejects_mismatched_impact_without_reusing_confirmation() -> None:
    async def run() -> None:
        command = control_command(status="failed", direct_execution=True)
        with pytest.raises(HTTPException) as error:
            await retry_command(
                "cmd-control-1",
                CommandControlRequest(),
                "retry-key-1",
                current_session(),
                ControlDb(command),
                DuplicateControlEvents(),
                InMemoryOperationEventBroker(),
            )
        assert error.value.status_code == 409
        assert "fresh confirmed request" in str(error.value.detail)

    asyncio.run(run())


def test_retry_control_creates_a_new_attempt_without_changing_logical_command_id() -> None:
    from domains.command.repository import stage_command_control_in_transaction

    command = control_command(status="failed")
    connection = ControlStageConnection(command, operation_event_call=8)
    staged = stage_command_control_in_transaction(
        connection,
        workspace_id="workspace-1",
        command_id="cmd-control-1",
        action="retry",
        idempotency_key="retry-key-1",
        requested_by="user-1",
        reason="retry after transient error",
        event_id="evt-retry-1",
        audit_event_id="evt-retry-1",
    )

    assert staged.command_id == "cmd-control-1"
    assert staged.status == "queued"
    assert staged.attempt_id is not None
    assert connection.calls == 9


def test_uninstall_completed_ack_revokes_registration() -> None:
    async def run() -> None:
        db = SpyUninstallResultDb(action=Command.CLUSTER_AGENT_UNINSTALL_ACTION)
        response = await command_result(
            "cmd-uninstall-1",
            CommandResultRequest(
                status="completed",
                agent_id="agent-1",
                lease_id="lease-1",
                cleanup_completed=True,
            ),
            identity=AGENT_IDENTITY,
            db=db,
        )

        assert response.accepted is True
        assert db.unregistered == [("trusted-workspace", "trusted-cluster")]

    asyncio.run(run())


def test_uninstall_failed_result_keeps_registration() -> None:
    async def run() -> None:
        db = SpyUninstallResultDb(action=Command.CLUSTER_AGENT_UNINSTALL_ACTION)
        response = await command_result(
            "cmd-uninstall-1",
            CommandResultRequest(
                status="failed",
                agent_id="agent-1",
                lease_id="lease-1",
                message="delete forbidden",
            ),
            identity=AGENT_IDENTITY,
            db=db,
        )

        assert response.accepted is True
        assert db.unregistered == []

    asyncio.run(run())


def test_uninstall_scheduled_without_completed_cleanup_keeps_registration() -> None:
    async def run() -> None:
        db = SpyUninstallResultDb(action=Command.CLUSTER_AGENT_UNINSTALL_ACTION)
        await command_result(
            "cmd-uninstall-1",
            CommandResultRequest(
                status="completed",
                agent_id="agent-1",
                lease_id="lease-1",
                cleanup_scheduled=True,
            ),
            identity=AGENT_IDENTITY,
            db=db,
        )

        assert db.unregistered == []

    asyncio.run(run())


def test_accepted_response_accepts_legacy_payload_without_command_id() -> None:
    legacy_payload = {
        "accepted": True,
        "event_id": "evt-1",
        "correlation_id": "corr-1",
    }

    response = AcceptedResponse.model_validate(legacy_payload)

    assert response.command_id is None
    assert response.model_dump(exclude_none=True) == legacy_payload


def test_non_approval_command_receipt_matches_worker_command_id() -> None:
    async def run() -> None:
        events = SpyEvents()
        response = await commands(
            CommandRequest(cluster_id="cluster-1", diff=manual_diff()),
            current_session(),
            SpyAccessDb(allowed=True),
            events,
        )

        assert isinstance(events.body, CommandRequestedBody)
        worker_plan = build_plan(events.body, response.correlation_id)
        assert response.command_id == worker_plan.command_id

    asyncio.run(run())


def test_command_receipt_requests_outbox_transactional_operation_staging() -> None:
    async def run() -> None:
        events = SpyEvents()
        response = await commands(
            CommandRequest(cluster_id="cluster-1", diff=manual_diff()),
            current_session(),
            SpyAccessDb(allowed=True),
            events,
        )

        stage = events.accept_kwargs.get("transactional_stage")
        assert callable(stage)
        assert isinstance(events.body, CommandRequestedBody)
        # The exact callback is executed by the event UoW with the durable event
        # correlation.  Its plan must retain the server-issued receipt ID.
        assert build_plan(events.body, response.correlation_id).command_id == response.command_id

    asyncio.run(run())


def test_approval_command_receipt_has_server_trace_before_worker_resolves_evidence() -> None:
    async def run() -> None:
        events = SpyEvents()
        response = await commands(
            CommandRequest(
                cluster_id="cluster-1",
                action=Command.APPLY_MANIFEST_ACTION,
                diff=manual_diff(),
                approval_ref="approval-1",
                policy_decision_ref="policy-decision-1",
            ),
            current_session(),
            SpyAccessDb(allowed=True),
            events,
        )

        assert response.command_id.startswith("cmd-")
        assert response.status == "queued"
        assert response.event_id == "evt-1"
        assert response.audit_event_id == response.event_id
        assert response.audit_id is None
        assert isinstance(events.body, CommandRequestedBody)
        assert events.body.command_id == response.command_id
        assert build_plan(events.body, response.correlation_id).command_id == response.command_id

    asyncio.run(run())


def test_command_request_requires_cluster_deploy_access() -> None:
    async def run() -> None:
        db = SpyAccessDb(allowed=True)
        events = SpyEvents()
        response = await commands(
            CommandRequest(
                cluster_id="cluster-1",
                action="apply_manifest",
                diff=manual_diff(),
                approval_ref="approval-1",
                policy_decision_ref="policy-decision-1",
            ),
            current_session(),
            db,
            events,
        )

        assert response.accepted is True
        assert db.calls == [("user-1", "workspace-1", "cluster", "cluster-1", "deploy.run")]
        assert events.body is not None
        assert events.body.workspace_id == "workspace-1"
        assert events.body.diff.cluster_id == "cluster-1"
        assert events.body.diff.resource == "deployment/checkout-api"
        assert events.body.approval_ref == "approval-1"
        assert events.body.policy_decision_ref == "policy-decision-1"

    asyncio.run(run())


def test_command_request_without_diff_is_rejected() -> None:
    # 서버가 임의 대상(diff)을 합성하지 않음 — 수동 명령도 클라이언트가 명시해야 함
    async def run() -> None:
        db = SpyAccessDb(allowed=True)
        events = SpyEvents()
        try:
            await commands(
                CommandRequest(cluster_id="cluster-1", action="apply_manifest"),
                current_session(),
                db,
                events,
            )
        except HTTPException as exc:
            assert exc.status_code == 422
            assert "diff is required" in exc.detail
        else:
            raise AssertionError("expected HTTPException")

        assert events.body is None

    asyncio.run(run())


def test_general_command_api_rejects_reserved_rca_test_actions() -> None:
    async def run() -> None:
        for action in (
            Command.RCA_TEST_SCENARIO_INJECT_ACTION,
            Command.RCA_TEST_SCENARIO_CLEANUP_ACTION,
        ):
            db = SpyAccessDb(allowed=True)
            events = SpyEvents()
            try:
                await commands(
                    CommandRequest(
                        cluster_id="cluster-1",
                        action=action,
                        diff=manual_diff(),
                    ),
                    current_session(),
                    db,
                    events,
                )
            except HTTPException as exc:
                assert exc.status_code == 422
                assert "/rca/test-runs" in exc.detail
            else:
                raise AssertionError("RCA test actions must use the dedicated test-run API")

            assert db.calls == []
            assert events.body is None

    asyncio.run(run())


def test_command_request_denies_without_cluster_access() -> None:
    async def run() -> None:
        db = SpyAccessDb(allowed=False)
        events = SpyEvents()
        try:
            await commands(
                CommandRequest(cluster_id="cluster-1", action="apply_manifest"),
                current_session(),
                db,
                events,
            )
        except HTTPException as exc:
            assert exc.status_code == 403
            assert exc.detail == RESOURCE_ACCESS_DENIED
        else:
            raise AssertionError("expected HTTPException")

        assert events.body is None

    asyncio.run(run())


def test_agent_debug_query_requires_cluster_read_access_and_queues_agent_command() -> None:
    async def run() -> None:
        db = SpyDebugQueryDb(allowed=True)
        response = await agent_debug_query(
            AgentDebugQueryRequest(
                cluster_id="cluster-1",
                query={
                    "source": "prometheus",
                    "name": "restart_rate",
                    "query": "increase(kube_pod_container_status_restarts_total[15m])",
                    "range_seconds": 900,
                    "step_seconds": 30,
                },
                reason="RCA 확인용",
            ),
            current_session(),
            db,
        )

        assert response.accepted is True
        assert response.command_id.startswith("cmd-debug-")
        assert response.correlation_id.startswith("corr-debug-")
        assert db.calls == [("user-1", "workspace-1", "cluster", "cluster-1", "evidence.read")]
        assert len(db.queued) == 1

        correlation_id, plan, status = db.queued[0]
        assert correlation_id == response.correlation_id
        assert status == "queued"
        assert plan["command_id"] == response.command_id
        assert plan["action"] == "telemetry.query.run"
        assert plan["namespace"] == "sandbox"
        assert plan["reason"] == "RCA 확인용"
        assert plan["payload"] == {
            "query": {
                "source": "prometheus",
                "name": "restart_rate",
                "query": "increase(kube_pod_container_status_restarts_total[15m])",
                "range_seconds": 900,
                "step_seconds": 30,
            }
        }
        assert plan["routing_constraint"] == {
            "channel": "agent",
            "cluster_id": "cluster-1",
            "workspace_id": "workspace-1",
            "required_capability": "collector",
        }

    asyncio.run(run())


def test_agent_debug_query_rejects_reserved_browser_log_stream_handle() -> None:
    async def run() -> None:
        db = SpyDebugQueryDb(allowed=True)
        try:
            await agent_debug_query(
                AgentDebugQueryRequest(
                    cluster_id="cluster-1",
                    query={
                        "source": "loki",
                        "name": "browser_log_stream_forged",
                        "query": '{k8s_namespace_name=~".*"}',
                        "log_stream": {"protocol": "log-stream.v1"},
                    },
                ),
                current_session(),
                db,
            )
        except HTTPException as exc:
            assert exc.status_code == 422
            assert exc.detail == "reserved browser log stream query"
        else:
            raise AssertionError("expected HTTPException")

        assert db.queued == []

    asyncio.run(run())


def test_scale_deployment_wrapper_emits_typed_command_payload() -> None:
    async def run() -> None:
        db = SpyAccessDb(allowed=True)
        events = SpyEvents()
        response = await scale_deployment(
            "cluster-1",
            "sandbox",
            "checkout-api",
            DeploymentScaleRequest(
                replicas=3,
                approval_ref="approval-1",
                policy_decision_ref="policy-decision-1",
            ),
            current_session(),
            db,
            events,
        )

        assert response.accepted is True
        assert isinstance(events.body, CommandRequestedBody)
        assert response.command_id == build_plan(events.body, response.correlation_id).command_id
        assert db.calls == [("user-1", "workspace-1", "cluster", "cluster-1", "deploy.run")]
        assert events.body is not None
        assert events.body.action == "k8s.apps.v1.deployments.scale"
        assert events.body.namespace == "sandbox"
        assert events.body.diff.resource == "deployment/checkout-api"
        assert events.body.payload == {
            "namespace": "sandbox",
            "name": "checkout-api",
            "replicas": 3,
        }
        assert events.body.approval_ref == "approval-1"
        assert events.body.policy_decision_ref == "policy-decision-1"

    asyncio.run(run())


def test_restart_deployment_receipt_matches_worker_command_id() -> None:
    async def run() -> None:
        events = SpyEvents()
        response = await restart_deployment(
            "cluster-1",
            "sandbox",
            "checkout-api",
            DeploymentRestartRequest(reason="restart checkout"),
            current_session(),
            SpyAccessDb(allowed=True),
            events,
        )

        assert isinstance(events.body, CommandRequestedBody)
        assert response.command_id == build_plan(events.body, response.correlation_id).command_id

    asyncio.run(run())


@pytest.mark.parametrize(
    ("route", "action"),
    [
        (trigger_cronjob, Command.KUBERNETES_CRONJOB_TRIGGER_ACTION),
        (suspend_cronjob, Command.KUBERNETES_CRONJOB_SUSPEND_ACTION),
        (resume_cronjob, Command.KUBERNETES_CRONJOB_RESUME_ACTION),
    ],
)
def test_cronjob_control_uses_dynamic_namespace_and_audited_direct_receipt(
    monkeypatch: pytest.MonkeyPatch,
    route: Any,
    action: str,
) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "sandbox,team-jobs")

    async def run() -> None:
        events = SpyEvents()
        response = await route(
            "cluster-1",
            "team-jobs",
            "nightly",
            ConfirmedResourceActionRequest(
                confirmation=True,
                reason="operator verified the exact CronJob",
            ),
            current_session(),
            SpyAccessDb(allowed=True),
            events,
        )

        assert response.accepted is True
        assert response.audit_event_id == response.event_id
        assert isinstance(events.body, CommandRequestedBody)
        assert events.body.action == action
        assert events.body.namespace == "team-jobs"
        assert events.body.diff.resource == "cronjob/nightly"
        assert events.body.payload == {"namespace": "team-jobs", "name": "nightly"}
        assert events.body.direct_execution is True
        assert events.body.direct_execution_confirmed is True
        plan = build_plan(events.body, response.correlation_id)
        assert (
            plan.routing_constraint.required_capability
            == Command.KUBERNETES_CRONJOB_CONTROL_CAPABILITY
        )

    asyncio.run(run())


def test_cronjob_control_requires_one_explicit_confirmation() -> None:
    async def run() -> None:
        events = SpyEvents()
        with pytest.raises(HTTPException) as excinfo:
            await trigger_cronjob(
                "cluster-1",
                "sandbox",
                "nightly",
                ConfirmedResourceActionRequest(),
                current_session(),
                SpyAccessDb(allowed=True),
                events,
            )

        assert excinfo.value.status_code == 422
        assert "confirmation" in str(excinfo.value.detail)
        assert events.body is None

    asyncio.run(run())


def test_cronjob_direct_confirmation_allows_management_cluster() -> None:
    async def run() -> None:
        events = SpyEvents()
        response = await trigger_cronjob(
            "management-1",
            "sandbox",
            "nightly",
            ConfirmedResourceActionRequest(confirmation=True),
            current_session(),
            SpyAccessDb(allowed=True, cluster_role="management"),
            events,
        )

        assert response.accepted is True
        assert isinstance(events.body, CommandRequestedBody)
        assert events.body.direct_execution is True
        assert events.body.direct_execution_confirmed is True

    asyncio.run(run())


def test_scale_deployment_wrapper_rejects_namespace_outside_current_policy() -> None:
    async def run() -> None:
        events = SpyEvents()
        try:
            await scale_deployment(
                "cluster-1",
                "kube-system",
                "checkout-api",
                DeploymentScaleRequest(replicas=3),
                current_session(),
                SpyAccessDb(allowed=True),
                events,
            )
        except HTTPException as exc:
            assert exc.status_code == 422
            assert "control policy" in exc.detail
        else:
            raise AssertionError("expected HTTPException")

        assert events.body is None

    asyncio.run(run())


def test_scale_deployment_rejects_management_cluster_at_gateway() -> None:
    async def run() -> None:
        events = SpyEvents()
        try:
            await scale_deployment(
                "kubernetes-ops",
                "sandbox",
                "api",
                DeploymentScaleRequest(replicas=2),
                current_session(),
                SpyAccessDb(allowed=True, cluster_role="management"),
                events,
            )
        except HTTPException as exc:
            assert exc.status_code == 400
            assert exc.detail["code"] == "management_readonly"
        else:
            raise AssertionError("expected HTTPException")

        assert events.body is None

    asyncio.run(run())


def test_scale_deployment_direct_execution_accepts_management_cluster_after_confirmation() -> None:
    async def run() -> None:
        events = SpyEvents()
        response = await scale_deployment(
            "kubernetes-ops",
            "sandbox",
            "api",
            DeploymentScaleRequest(
                replicas=2,
                confirmation=True,
            ),
            current_session(),
            SpyAccessDb(allowed=True, cluster_role="management"),
            events,
        )

        assert response.accepted is True
        assert isinstance(events.body, CommandRequestedBody)
        assert events.body.direct_execution is True
        assert events.body.direct_execution_confirmed is True

    asyncio.run(run())


def test_manual_command_rejects_dedicated_scale_action_before_a_false_receipt() -> None:
    async def run() -> None:
        events = SpyEvents()
        with pytest.raises(HTTPException) as excinfo:
            await commands(
                CommandRequest(
                    cluster_id="kubernetes-ops",
                    action=Command.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                    namespace="sandbox",
                    diff=manual_diff(),
                    confirmation=True,
                ),
                current_session(),
                SpyAccessDb(allowed=True, cluster_role="management"),
                events,
            )

        assert excinfo.value.status_code == 422
        assert "typed dedicated command endpoint" in excinfo.value.detail
        assert events.body is None

    asyncio.run(run())


def test_manual_direct_command_requires_explicit_confirmation() -> None:
    async def run() -> None:
        events = SpyEvents()
        try:
            await commands(
                CommandRequest(
                    cluster_id="cluster-1",
                    action=Command.DEFAULT_ACTION,
                    namespace="sandbox",
                    diff=manual_diff(),
                    direct_execution=True,
                ),
                current_session(),
                SpyAccessDb(allowed=True),
                events,
            )
        except HTTPException as exc:
            assert exc.status_code == 422
            assert exc.detail == "direct command requires explicit confirmation"
        else:
            raise AssertionError("expected HTTPException")

        assert events.body is None

    asyncio.run(run())


def test_agent_debug_query_denies_without_cluster_read_access() -> None:
    async def run() -> None:
        db = SpyDebugQueryDb(allowed=False)
        try:
            await agent_debug_query(
                AgentDebugQueryRequest(
                    cluster_id="cluster-1",
                    query={"source": "prometheus", "name": "up", "query": "up"},
                ),
                current_session(),
                db,
            )
        except HTTPException as exc:
            assert exc.status_code == 403
            assert exc.detail == RESOURCE_ACCESS_DENIED
        else:
            raise AssertionError("expected HTTPException")

        assert db.calls == [("user-1", "workspace-1", "cluster", "cluster-1", "evidence.read")]
        assert db.queued == []

    asyncio.run(run())


def test_command_start_uses_trusted_agent_cluster_boundary() -> None:
    async def run() -> None:
        db = SpyCommandLeaseDb(correlation_id="corr-1")
        response = await command_start(
            "cmd-1",
            CommandStartRequest(
                workspace_id="spoofed-workspace",
                cluster_id="spoofed-cluster",
                agent_id="agent-1",
                lease_id="lease-1",
            ),
            identity=AGENT_IDENTITY,
            db=db,
        )

        assert response.accepted is True
        assert response.correlation_id == "corr-1"
        assert db.calls == [
            ("cmd-1", "trusted-workspace", "trusted-cluster", "lease-1", "agent-1", 60)
        ]

    asyncio.run(run())


def test_command_heartbeat_extends_current_lease() -> None:
    async def run() -> None:
        db = SpyCommandLeaseDb(correlation_id="corr-1")
        response = await command_heartbeat(
            "cmd-1",
            CommandHeartbeatRequest(
                workspace_id="workspace-1",
                agent_id="agent-1",
                lease_id="lease-1",
            ),
            identity=AGENT_IDENTITY,
            db=db,
        )

        assert response.accepted is True
        assert response.correlation_id == "corr-1"
        assert db.calls == [
            ("cmd-1", "trusted-workspace", "trusted-cluster", "lease-1", "agent-1", 60)
        ]

    asyncio.run(run())


def test_command_start_publishes_realtime_operation_event() -> None:
    async def run() -> None:
        broker = InMemoryOperationEventBroker()
        subscription = await broker.subscribe("cmd-1", workspace_id="trusted-workspace")
        await command_start(
            "cmd-1",
            CommandStartRequest(agent_id="agent-1", lease_id="lease-1"),
            identity=AGENT_IDENTITY,
            db=SpyCommandLeaseDb(correlation_id="corr-1"),
            operation_events=broker,
        )

        event = await subscription.next()
        assert event.command_id == "cmd-1"
        assert event.kind == "progress"
        assert event.payload == {
            "status": "running",
            "cluster_id": "trusted-cluster",
            "correlation_id": "corr-1",
        }
        await subscription.close()

    asyncio.run(run())


def test_command_heartbeat_rejects_stale_lease() -> None:
    async def run() -> None:
        try:
            await command_heartbeat(
                "cmd-1",
                CommandHeartbeatRequest(
                    workspace_id="workspace-1",
                    agent_id="agent-1",
                    lease_id="old-lease",
                ),
                identity=AGENT_IDENTITY,
                db=SpyCommandLeaseDb(correlation_id=None),
            )
        except HTTPException as exc:
            assert exc.status_code == 404
        else:
            raise AssertionError("expected HTTPException")

    asyncio.run(run())


class SpyCommandStatusDb(SpyAccessDb):
    def __init__(self, allowed: bool, row: dict[str, object] | None) -> None:
        super().__init__(allowed)
        self.row = row
        self.requested: list[tuple[str, str]] = []

    async def get_agent_command(
        self, command_id: str, workspace_id: str
    ) -> dict[str, object] | None:
        self.requested.append((command_id, workspace_id))
        return self.row


def completed_command_row() -> dict[str, object]:
    return {
        "command_id": "cmd-debug-abc",
        "cluster_id": "cluster-1",
        "correlation_id": "corr-debug-1",
        "action": "telemetry.query.run",
        "status": "completed",
        "result": {
            "status": "completed",
            "applied": True,
            "message": "telemetry query executed",
            "result": [{"metric": {"pod": "checkout"}, "values": [[1, "0.2"]]}],
        },
        "completed_at": None,
    }


def test_command_status_returns_row_scoped_to_workspace() -> None:
    async def run() -> None:
        db = SpyCommandStatusDb(allowed=True, row=completed_command_row())
        response = await command_status("cmd-debug-abc", current_session(), db)

        assert db.requested == [("cmd-debug-abc", "workspace-1")]
        assert db.calls == [("user-1", "workspace-1", "cluster", "cluster-1", "evidence.read")]
        assert response.status == "completed"
        assert response.action == "telemetry.query.run"
        assert response.result["applied"] is True
        assert response.result["result"][0]["metric"] == {"pod": "checkout"}

    asyncio.run(run())


def test_command_status_missing_command_is_not_found() -> None:
    async def run() -> None:
        db = SpyCommandStatusDb(allowed=True, row=None)
        try:
            await command_status("cmd-missing", current_session(), db)
        except HTTPException as exc:
            assert exc.status_code == 404
        else:
            raise AssertionError("expected HTTPException")

    asyncio.run(run())


def test_command_events_sse_starts_with_authorized_durable_snapshot() -> None:
    async def run() -> None:
        broker = InMemoryOperationEventBroker()
        response = await command_events(
            "cmd-debug-abc",
            current=current_session(),
            db=SpyCommandStatusDb(allowed=True, row=completed_command_row()),
            operation_events=broker,
        )
        stream = response.body_iterator
        first = await anext(stream)

        assert first.startswith("id: 1\nevent: operation\ndata: ")
        assert '"command_id":"cmd-debug-abc"' in first
        assert '"kind":"completed"' in first
        assert '"status":"completed"' in first
        await stream.aclose()

    asyncio.run(run())


def test_command_events_replays_durable_cursor_without_waiting_for_command_row() -> None:
    class DurableEventDb(SpyAccessDb):
        async def list_command_operation_events(
            self,
            workspace_id: str,
            command_id: str,
            *,
            after_sequence: int,
        ) -> list[object]:
            assert (workspace_id, command_id, after_sequence) == ("workspace-1", "cmd-accepted", 1)
            from packages.contracts.parity import OperationEvent

            return [
                OperationEvent(
                    command_id="cmd-accepted",
                    sequence=2,
                    kind="completed",
                    payload={"cluster_id": "cluster-1", "status": "completed"},
                )
            ]

        async def get_agent_command(self, *_args: object) -> None:
            raise AssertionError("receipt event must not wait for agent_commands projection")

    async def run() -> None:
        response = await command_events(
            "cmd-accepted",
            after=1,
            current=current_session(),
            db=DurableEventDb(allowed=True),
            operation_events=InMemoryOperationEventBroker(),
        )
        stream = response.body_iterator
        first = await anext(stream)

        assert first.startswith("id: 2\nevent: operation\ndata: ")
        assert '"status":"completed"' in first
        await stream.aclose()

    asyncio.run(run())


def test_command_events_keeps_a_durable_receipt_cursor_open_before_projection_exists() -> None:
    """A reconnect after the receipt must not turn an unprojected command into 404."""

    class ReceiptOnlyDb(SpyAccessDb):
        async def list_command_operation_events(
            self,
            workspace_id: str,
            command_id: str,
            *,
            after_sequence: int,
        ) -> list[object]:
            assert (workspace_id, command_id, after_sequence) == ("workspace-1", "cmd-accepted", 1)
            return []

        async def get_command_operation_event_context(
            self, workspace_id: str, command_id: str
        ) -> dict[str, object] | None:
            assert (workspace_id, command_id) == ("workspace-1", "cmd-accepted")
            return {
                "cluster_id": "cluster-1",
                "last_sequence": 1,
                "terminal_sequence": None,
            }

        async def get_agent_command(self, *_args: object) -> None:
            raise AssertionError("durable receipt cursor must not query the delayed projection")

    async def run() -> None:
        response = await command_events(
            "cmd-accepted",
            after=1,
            current=current_session(),
            db=ReceiptOnlyDb(allowed=True),
            operation_events=InMemoryOperationEventBroker(),
        )
        await response.body_iterator.aclose()

    asyncio.run(run())


def test_command_events_replays_durable_updates_when_cross_replica_wakeups_are_unavailable(
    monkeypatch,
) -> None:
    """Redis loss may delay wakeups but may never hide a committed terminal event."""

    class ReplayDb(SpyAccessDb):
        def __init__(self) -> None:
            super().__init__(allowed=True)
            self.cursors: list[int] = []

        async def list_command_operation_events(
            self,
            workspace_id: str,
            command_id: str,
            *,
            after_sequence: int,
        ) -> list[object]:
            self.cursors.append(after_sequence)
            assert (workspace_id, command_id) == ("workspace-1", "cmd-redis-gap")
            from packages.contracts.parity import OperationEvent

            if after_sequence == 0:
                return [
                    OperationEvent(
                        command_id="cmd-redis-gap",
                        sequence=1,
                        kind="progress",
                        payload={"cluster_id": "cluster-1", "status": "running"},
                    )
                ]
            if after_sequence == 1:
                return [
                    OperationEvent(
                        command_id="cmd-redis-gap",
                        sequence=2,
                        kind="failed",
                        payload={"cluster_id": "cluster-1", "status": "failed"},
                    )
                ]
            return []

    async def run() -> None:
        db = ReplayDb()
        response = await command_events(
            "cmd-redis-gap",
            current=current_session(),
            db=db,
            operation_events=InMemoryOperationEventBroker(),
        )
        stream = response.body_iterator
        assert '"sequence":1' in await anext(stream)
        assert '"sequence":2' in await asyncio.wait_for(anext(stream), timeout=0.5)
        assert db.cursors[:2] == [0, 1]
        await stream.aclose()

    monkeypatch.setattr(
        "domains.command.router.OPERATION_EVENT_REPLAY_POLL_SECONDS", 0.01, raising=False
    )
    asyncio.run(run())


def test_command_status_denies_without_cluster_read_access() -> None:
    async def run() -> None:
        db = SpyCommandStatusDb(allowed=False, row=completed_command_row())
        try:
            await command_status("cmd-debug-abc", current_session(), db)
        except HTTPException as exc:
            assert exc.status_code == 403
            assert exc.detail == RESOURCE_ACCESS_DENIED
        else:
            raise AssertionError("expected HTTPException")

    asyncio.run(run())


def test_long_poll_waits_for_wakeup_before_retrying_lease(monkeypatch) -> None:
    class EmptyThenCommandDb:
        def __init__(self) -> None:
            self.calls = 0

        async def lease_agent_command(
            self,
            cluster_id: str,
            workspace_id: str,
            queued_status: str,
            leased_status: str,
            agent_id: str,
            lease_seconds: int,
        ) -> dict[str, object] | None:
            self.calls += 1
            if self.calls == 1:
                return None
            return {
                "command_id": "cmd-1",
                "cluster_id": cluster_id,
                "workspace_id": workspace_id,
                "agent_id": agent_id,
                "lease_seconds": lease_seconds,
                "queued_status": queued_status,
                "leased_status": leased_status,
            }

    class ImmediateWakeup:
        def __init__(self) -> None:
            self.waits: list[tuple[str, str, float]] = []

        async def wait(self, workspace_id: str, cluster_id: str, timeout: float) -> None:
            self.waits.append((workspace_id, cluster_id, timeout))

    async def run() -> None:
        db = EmptyThenCommandDb()
        wakeup = ImmediateWakeup()
        monkeypatch.setattr("domains.command.router.WAKEUP", wakeup)

        row = await lease_next_command(
            db,
            cluster_id="trusted-cluster",
            workspace_id="trusted-workspace",
            agent_id="agent-1",
            timeout=2,
        )

        assert row is not None
        assert row["command_id"] == "cmd-1"
        assert db.calls == 2
        assert wakeup.waits
        assert wakeup.waits[0][0:2] == ("trusted-workspace", "trusted-cluster")

    asyncio.run(run())


def test_control_namespace_allowlist_env_extends_beyond_sandbox(monkeypatch) -> None:
    """CONTROL_ALLOWED_NAMESPACES 에 넣은 네임스페이스는 게이트웨이 제어 검증을 통과한다."""
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "sandbox,prod-web")

    async def run() -> None:
        db = SpyAccessDb(allowed=True)
        events = SpyEvents()
        response = await scale_deployment(
            "cluster-1",
            "prod-web",
            "checkout-api",
            DeploymentScaleRequest(replicas=3),
            current_session(),
            db,
            events,
        )
        assert response.accepted is True
        assert events.body.namespace == "prod-web"

    asyncio.run(run())


def test_control_namespace_allowlist_cannot_open_management_namespace(monkeypatch) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "sandbox,management")

    async def run() -> None:
        events = SpyEvents()
        try:
            await scale_deployment(
                "cluster-1",
                "management",
                "api-gateway",
                DeploymentScaleRequest(replicas=3),
                current_session(),
                SpyAccessDb(allowed=True),
                events,
            )
        except HTTPException as exc:
            assert exc.status_code == 422
            assert "control policy" in exc.detail
        else:
            raise AssertionError("expected HTTPException")

        assert events.body is None

    asyncio.run(run())


def test_control_namespace_allowlist_defaults_to_sandbox_only(monkeypatch) -> None:
    monkeypatch.delenv("CONTROL_ALLOWED_NAMESPACES", raising=False)

    async def run() -> None:
        try:
            await scale_deployment(
                "cluster-1",
                "prod-web",
                "checkout-api",
                DeploymentScaleRequest(replicas=3),
                current_session(),
                SpyAccessDb(allowed=True),
                SpyEvents(),
            )
        except HTTPException as exc:
            assert exc.status_code == 422
            assert "control policy" in exc.detail
        else:
            raise AssertionError("expected HTTPException")

    asyncio.run(run())

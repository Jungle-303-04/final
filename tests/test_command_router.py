from __future__ import annotations

import asyncio
from types import SimpleNamespace

from fastapi import HTTPException

from domains.command.router import (
    RESOURCE_ACCESS_DENIED,
    agent_debug_query,
    command_heartbeat,
    command_start,
    command_status,
    commands,
    lease_next_command,
    scale_deployment,
)
from domains.identity.dependencies import ClusterAgentIdentity
from packages.contracts.gateway.requests import (
    AgentDebugQueryRequest,
    CommandHeartbeatRequest,
    CommandRequest,
    CommandStartRequest,
    DeploymentScaleRequest,
)

AGENT_IDENTITY = ClusterAgentIdentity(
    workspace_id="trusted-workspace",
    cluster_id="trusted-cluster",
)


class SpyAccessDb:
    def __init__(self, allowed: bool) -> None:
        self.allowed = allowed
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

    async def accept_body(self, body: object, actor: object) -> object:
        self.body = body
        self.actor = actor
        event = SimpleNamespace(event_id="evt-1", correlation_id="corr-1")
        return SimpleNamespace(event=event)


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


def manual_diff() -> dict[str, str]:
    return {
        "resource": "deployment/checkout-api",
        "namespace": "sandbox",
        "desired_image": "img:new",
        "actual_image": "img:old",
        "risk": "sandbox-only",
    }


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
            assert "sandbox namespace" in exc.detail
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

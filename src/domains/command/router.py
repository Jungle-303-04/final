"""command 도메인 HTTP 라우터 — 명령 발행 + agent 명령 풀(롱폴)·시작·결과."""

from __future__ import annotations

import time
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException

from domains.command.debug_queries import (
    debug_query_plan,
    is_reserved_log_stream_query,
    queue_debug_query,
)
from domains.command.events import CommandRequestedBody
from domains.command.handler import build_plan, command_requires_recorded_approval
from domains.command.policy import (
    DEFAULT_COMMAND_LEASE_SECONDS,
)
from domains.gitops.events import Diff
from domains.identity.dependencies import (
    RESOURCE_ACCESS_DENIED_MESSAGE,
    ClusterAgentIdentity,
    require_cluster_access,
    require_cluster_agent,
    require_session,
)
from domains.target.management_guard import (
    cluster_role_from_policy,
    is_management_registration,
    is_management_role,
    management_readonly_detail,
)
from packages.config.constants import RCA_TEST_COMMAND_ACTIONS, Command, CommandStatus, Sandbox
from packages.config.control import (
    CONTROL_NAMESPACE_DENIED_MESSAGE,
    control_namespace_allowed,
)
from packages.config.settings import env
from packages.contracts.auth import Actor
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import (
    AgentDebugQueryRequest,
    CommandHeartbeatRequest,
    CommandRequest,
    CommandResultRequest,
    CommandStartRequest,
    DeploymentRestartRequest,
    DeploymentScaleRequest,
)
from packages.contracts.gateway.responses import (
    AcceptedResponse,
    AgentCommandPollResponse,
    AgentDebugQueryResponse,
    CommandHeartbeatResponse,
    CommandStartedResponse,
    CommandStatusResponse,
    EventIdAcceptedResponse,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, Permission
from packages.runtime.command_wakeup import WAKEUP
from packages.runtime.dependencies import get_db, get_events
from packages.storage.retry import async_retry_db_conflict

# 롱폴 튜닝값 — env 미설정 시 기존 기본값과 동일한 기본값이 적용됨(배포 호환)
DEFAULT_POLL_SECONDS_ENV = "COMMAND_POLL_DEFAULT_SECONDS"  # 롱폴 기본 대기 초(기본 10)
DEFAULT_POLL_SECONDS = int(env(DEFAULT_POLL_SECONDS_ENV, "10"))
MAX_POLL_SECONDS_ENV = "COMMAND_POLL_MAX_SECONDS"  # 롱폴 최대 대기 초(기본 30)
MAX_POLL_SECONDS = int(env(MAX_POLL_SECONDS_ENV, "30"))
POLL_SLEEP_SECONDS_ENV = "COMMAND_POLL_SLEEP_SECONDS"  # 롱폴 반복 간 대기 초(기본 1)
POLL_SLEEP_SECONDS = int(env(POLL_SLEEP_SECONDS_ENV, "1"))
LEASE_SECONDS = DEFAULT_COMMAND_LEASE_SECONDS
NOT_FOUND_CODE = 404
NOT_FOUND_MESSAGE = "command not found"
RESOURCE_ACCESS_DENIED = RESOURCE_ACCESS_DENIED_MESSAGE
# 수동 명령도 대상(diff)은 클라이언트가 명시해야 함 — 서버가 임의 리소스를 합성하지 않음.
UNPROCESSABLE_CODE = 422
MANUAL_DIFF_REQUIRED_MESSAGE = "diff is required for manual command requests"
RCA_TEST_ACTION_DEDICATED_API_REQUIRED = (
    "RCA test actions are reserved; use the dedicated /rca/test-runs API"
)
# 제어 허용 네임스페이스는 packages.config.control 단일 기준(기본 sandbox 만).
CONTROL_NAMESPACE_NOT_ALLOWED = CONTROL_NAMESPACE_DENIED_MESSAGE
COMMAND_PRIORITY_HIGH = 100
RESERVED_LOG_STREAM_QUERY_MESSAGE = "reserved browser log stream query"

router = APIRouter()
__all__ = ["debug_query_plan", "router"]


def command_accepted_response(command: CommandRequestedBody, accepted: Any) -> AcceptedResponse:
    command_id = (
        None
        if command_requires_recorded_approval(command)
        else build_plan(command, accepted.event.correlation_id).command_id
    )
    return AcceptedResponse(
        accepted=True,
        event_id=accepted.event.event_id,
        correlation_id=accepted.event.correlation_id,
        command_id=command_id,
    )


def command_diff(payload: CommandRequest, workspace_id: str) -> Diff:
    if not payload.diff:
        raise HTTPException(status_code=UNPROCESSABLE_CODE, detail=MANUAL_DIFF_REQUIRED_MESSAGE)
    raw = {**payload.diff, "workspace_id": workspace_id, "cluster_id": payload.cluster_id}
    return cast(Diff, Diff.from_body(raw))


def validate_control_namespace(namespace: str) -> None:
    if not control_namespace_allowed(namespace):
        raise HTTPException(status_code=UNPROCESSABLE_CODE, detail=CONTROL_NAMESPACE_NOT_ALLOWED)


def require_cluster_deploy_access(
    db: Any, current: Any, workspace_id: str, cluster_id: str
) -> None:
    require_cluster_access(
        db,
        current,
        workspace_id,
        cluster_id,
        Permission.DEPLOY_RUN.value,
        detail=RESOURCE_ACCESS_DENIED,
    )


def require_not_management_cluster(db: Any, workspace_id: str, cluster_id: str) -> None:
    registration_getter = getattr(db, "get_cluster_registration", None)
    registration = (
        registration_getter(workspace_id, cluster_id) if callable(registration_getter) else None
    )
    policy_getter = getattr(db, "get_cluster_policy", None)
    policy = policy_getter(workspace_id, cluster_id) if callable(policy_getter) else None
    if is_management_registration(registration) or is_management_role(
        cluster_role_from_policy(policy)
    ):
        raise HTTPException(status_code=400, detail=management_readonly_detail())


def deployment_control_diff(
    *,
    workspace_id: str,
    cluster_id: str,
    namespace: str,
    deployment: str,
    action: str,
    basis: JsonObject,
) -> Diff:
    return Diff(
        workspace_id=workspace_id,
        cluster_id=cluster_id,
        resource=f"deployment/{deployment}",
        namespace=namespace,
        desired_image="",
        actual_image="resource-not-inspected",
        risk=Sandbox.RISK_TAG,
        status=action,
        basis=basis,
    )


async def accept_deployment_control(
    *,
    cluster_id: str,
    namespace: str,
    deployment: str,
    action: str,
    reason: str,
    payload: JsonObject,
    approval_ref: str | None,
    policy_decision_ref: str | None,
    current: Any,
    db: Any,
    events: Any,
) -> AcceptedResponse:
    validate_control_namespace(namespace)
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_cluster_deploy_access(db, current, workspace_id, cluster_id)
    require_not_management_cluster(db, workspace_id, cluster_id)
    diff = deployment_control_diff(
        workspace_id=workspace_id,
        cluster_id=cluster_id,
        namespace=namespace,
        deployment=deployment,
        action=action,
        basis=payload,
    )
    command = CommandRequestedBody(
        cluster_id=cluster_id,
        action=action,
        namespace=namespace,
        reason=reason,
        diff=diff,
        payload=payload,
        workspace_id=workspace_id,
        priority=COMMAND_PRIORITY_HIGH,
        requested_by=current.user_id,
        approval_ref=approval_ref,
        policy_decision_ref=policy_decision_ref,
    )
    accepted = await events.accept_body(
        command,
        actor=Actor(current.user_id, tuple(current.roles)),
    )
    return command_accepted_response(command, accepted)


def require_cluster_read_access(db: Any, current: Any, workspace_id: str, cluster_id: str) -> None:
    require_cluster_access(
        db,
        current,
        workspace_id,
        cluster_id,
        Permission.EVIDENCE_READ.value,
        detail=RESOURCE_ACCESS_DENIED,
    )


async def lease_next_command(
    db: Any, cluster_id: str, workspace_id: str, agent_id: str, timeout: int
) -> JsonObject | None:
    """롱폴 — 이 클러스터의 다음 명령을 timeout 까지 대기하며 리스(아웃바운드 단일 채널).

    대기는 LISTEN/NOTIFY 웨이크업(WAKEUP)을 우선 사용 — 명령 큐잉 순간 즉시
    재시도한다. 리스너 미가동이면 wait 가 타임아웃까지 잠들어 기존 주기 폴링과
    동일하게 동작한다(정확성은 폴링이, 지연·부하 개선은 알림이 담당).
    """
    deadline = time.time() + min(timeout, MAX_POLL_SECONDS)
    while time.time() < deadline:
        row = await async_retry_db_conflict(
            lambda: db.lease_agent_command(
                cluster_id,
                workspace_id,
                CommandStatus.QUEUED,
                CommandStatus.LEASED,
                agent_id,
                LEASE_SECONDS,
            )
        )
        if row:
            return row
        await WAKEUP.wait(workspace_id, cluster_id, min(POLL_SLEEP_SECONDS, deadline - time.time()))
    return None


@router.post(gateway_routes.COMMANDS_PATH, response_model=AcceptedResponse)
async def commands(
    payload: CommandRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> AcceptedResponse:
    if payload.action in RCA_TEST_COMMAND_ACTIONS:
        raise HTTPException(
            status_code=UNPROCESSABLE_CODE,
            detail=RCA_TEST_ACTION_DEDICATED_API_REQUIRED,
        )
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_cluster_deploy_access(db, current, workspace_id, payload.cluster_id)
    require_not_management_cluster(db, workspace_id, payload.cluster_id)
    command = CommandRequestedBody(
        cluster_id=payload.cluster_id,
        action=payload.action,
        namespace=payload.namespace,
        reason=payload.reason or "manual command request",
        diff=command_diff(payload, workspace_id),
        workspace_id=workspace_id,
        priority=COMMAND_PRIORITY_HIGH,
        requested_by=current.user_id,
        approval_ref=payload.approval_ref,
        policy_decision_ref=payload.policy_decision_ref,
    )
    accepted = await events.accept_body(
        command,
        actor=Actor(current.user_id, tuple(current.roles)),
    )
    return command_accepted_response(command, accepted)


@router.post(gateway_routes.CLUSTER_DEPLOYMENT_SCALE_PATH, response_model=AcceptedResponse)
async def scale_deployment(
    cluster_id: str,
    namespace: str,
    deployment: str,
    payload: DeploymentScaleRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> AcceptedResponse:
    command_payload = {
        "namespace": namespace,
        "name": deployment,
        "replicas": payload.replicas,
    }
    return await accept_deployment_control(
        cluster_id=cluster_id,
        namespace=namespace,
        deployment=deployment,
        action=Command.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
        reason=payload.reason or f"scale deployment/{deployment}",
        payload=command_payload,
        approval_ref=payload.approval_ref,
        policy_decision_ref=payload.policy_decision_ref,
        current=current,
        db=db,
        events=events,
    )


@router.post(gateway_routes.CLUSTER_DEPLOYMENT_RESTART_PATH, response_model=AcceptedResponse)
async def restart_deployment(
    cluster_id: str,
    namespace: str,
    deployment: str,
    payload: DeploymentRestartRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> AcceptedResponse:
    command_payload = {
        "namespace": namespace,
        "name": deployment,
    }
    return await accept_deployment_control(
        cluster_id=cluster_id,
        namespace=namespace,
        deployment=deployment,
        action=Command.DEFAULT_ACTION,
        reason=payload.reason or f"restart deployment/{deployment}",
        payload=command_payload,
        approval_ref=payload.approval_ref,
        policy_decision_ref=payload.policy_decision_ref,
        current=current,
        db=db,
        events=events,
    )


@router.post(gateway_routes.AGENT_DEBUG_QUERY_PATH, response_model=AgentDebugQueryResponse)
async def agent_debug_query(
    payload: AgentDebugQueryRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> AgentDebugQueryResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_cluster_read_access(db, current, workspace_id, payload.cluster_id)
    if is_reserved_log_stream_query(payload.query):
        raise HTTPException(
            status_code=UNPROCESSABLE_CODE,
            detail=RESERVED_LOG_STREAM_QUERY_MESSAGE,
        )
    queued = queue_debug_query(
        db,
        payload,
        workspace_id=workspace_id,
        requested_by=current.user_id,
    )
    return AgentDebugQueryResponse(
        accepted=True,
        command_id=queued.command_id,
        correlation_id=queued.correlation_id,
    )


@router.get(gateway_routes.COMMAND_STATUS_PATH, response_model=CommandStatusResponse)
async def command_status(
    command_id: str,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> CommandStatusResponse:
    """콘솔이 명령 진행 상태와 agent 가 올린 실제 결과를 폴링 — 임의 완료 표시 제거용."""
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    row = await db.get_agent_command(command_id, workspace_id)
    if row is None:
        raise HTTPException(status_code=NOT_FOUND_CODE, detail=NOT_FOUND_MESSAGE)
    require_cluster_read_access(db, current, workspace_id, str(row["cluster_id"]))
    completed_at = row.get("completed_at")
    return CommandStatusResponse(
        command_id=str(row["command_id"]),
        cluster_id=str(row["cluster_id"]),
        correlation_id=str(row["correlation_id"]),
        action=str(row["action"]),
        status=str(row["status"]),
        result=dict(row.get("result") or {}),
        completed_at=completed_at.isoformat()
        if hasattr(completed_at, "isoformat")
        else (str(completed_at) if completed_at else None),
    )


# agent 라우트 — 각 핸들러의 identity dependency 로 per-cluster 토큰 인증.
# workspace_id/cluster_id 는 토큰으로 인증된 identity 에서만 취하고 body/query 는 신뢰 안 함.
agent_router = APIRouter()


@agent_router.get(gateway_routes.AGENT_COMMAND_POLL_PATH, response_model=AgentCommandPollResponse)
async def poll_command(
    agent_id: str = "target-agent",
    timeout: int = DEFAULT_POLL_SECONDS,
    identity: ClusterAgentIdentity = Depends(require_cluster_agent),
    db: Any = Depends(get_db),
) -> AgentCommandPollResponse:
    # 멀티클러스터: 각 클러스터 agent 가 자기 cluster_id 로 아웃바운드 롱폴(인바운드 0).
    # cluster_id/workspace_id 는 토큰 identity 에서 — 임의 클러스터/워크스페이스 폴링 차단.
    row = await lease_next_command(
        db, identity.cluster_id, identity.workspace_id, agent_id, timeout
    )
    return AgentCommandPollResponse(command=row)


@agent_router.post(gateway_routes.AGENT_COMMAND_START_PATH, response_model=CommandStartedResponse)
async def command_start(
    command_id: str,
    payload: CommandStartRequest,
    identity: ClusterAgentIdentity = Depends(require_cluster_agent),
    db: Any = Depends(get_db),
) -> CommandStartedResponse:
    correlation_id = await async_retry_db_conflict(
        lambda: db.start_agent_command(
            command_id,
            identity.workspace_id,  # body 가 아닌 토큰 identity 의 workspace
            identity.cluster_id,  # body 가 아닌 토큰 identity 의 cluster
            payload.lease_id,
            payload.agent_id,
            CommandStatus.RUNNING,
            LEASE_SECONDS,
        )
    )
    if not correlation_id:
        raise HTTPException(status_code=NOT_FOUND_CODE, detail=NOT_FOUND_MESSAGE)
    return CommandStartedResponse(accepted=True, correlation_id=correlation_id)


@agent_router.post(
    gateway_routes.AGENT_COMMAND_HEARTBEAT_PATH, response_model=CommandHeartbeatResponse
)
async def command_heartbeat(
    command_id: str,
    payload: CommandHeartbeatRequest,
    identity: ClusterAgentIdentity = Depends(require_cluster_agent),
    db: Any = Depends(get_db),
) -> CommandHeartbeatResponse:
    correlation_id = await async_retry_db_conflict(
        lambda: db.heartbeat_agent_command(
            command_id,
            identity.workspace_id,
            identity.cluster_id,
            payload.lease_id,
            payload.agent_id,
            LEASE_SECONDS,
        )
    )
    if not correlation_id:
        raise HTTPException(status_code=NOT_FOUND_CODE, detail=NOT_FOUND_MESSAGE)
    return CommandHeartbeatResponse(accepted=True, correlation_id=correlation_id)


@agent_router.post(gateway_routes.AGENT_COMMAND_RESULT_PATH, response_model=EventIdAcceptedResponse)
async def command_result(
    command_id: str,
    payload: CommandResultRequest,
    identity: ClusterAgentIdentity = Depends(require_cluster_agent),
    db: Any = Depends(get_db),
) -> EventIdAcceptedResponse:
    result = payload.model_dump()
    result["workspace_id"] = identity.workspace_id
    result["cluster_id"] = identity.cluster_id
    completed = await async_retry_db_conflict(
        lambda: db.complete_agent_command_and_stage_event(
            command_id,
            identity.workspace_id,
            identity.cluster_id,
            result,
            payload.lease_id,
            payload.agent_id,
            "api-gateway",
        )
    )
    if completed is None:
        raise HTTPException(status_code=NOT_FOUND_CODE, detail=NOT_FOUND_MESSAGE)
    return EventIdAcceptedResponse(accepted=True, event_id=completed.event_id)


router.include_router(agent_router)

"""command 도메인 HTTP 라우터 — 명령 발행 + agent 명령 풀(롱폴)·시작·결과.

agent 라우트는 APIRouter(dependencies=[Depends(require_cluster_agent)]) 로 라우터 단위
per-cluster 토큰 인증 — workspace_id/cluster_id 는 body 가 아닌 토큰 identity 에서만 취한다.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException

from domains.command.policy import DEFAULT_COMMAND_LEASE_SECONDS
from domains.identity.dependencies import (
    ClusterAgentIdentity,
    require_cluster_agent,
    require_session,
)
from packages.config.constants import CommandStatus, Sandbox
from packages.contracts.auth import Actor
from packages.contracts.event_bus.bodies import CommandCompletedBody, CommandRequestedBody, Diff
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import (
    CommandHeartbeatRequest,
    CommandRequest,
    CommandResultRequest,
    CommandStartRequest,
)
from packages.contracts.gateway.responses import (
    AcceptedResponse,
    AgentCommandPollResponse,
    CommandHeartbeatResponse,
    CommandStartedResponse,
    EventIdAcceptedResponse,
)
from packages.contracts.identity import (
    DEFAULT_WORKSPACE_ID,
    DEPLOY_ACCESS,
    AccessResourceType,
)
from packages.runtime.dependencies import get_db, get_events

DEFAULT_POLL_SECONDS = 10
MAX_POLL_SECONDS = 30
POLL_SLEEP_SECONDS = 1
LEASE_SECONDS = DEFAULT_COMMAND_LEASE_SECONDS
NOT_FOUND_CODE = 404
NOT_FOUND_MESSAGE = "command not found"
ACCESS_DENIED_CODE = 403
RESOURCE_ACCESS_DENIED = "resource access denied"
# diff 미지정(수동 명령) 시 폴백 — 데모 placeholder. 운영에선 클라이언트가 diff 를 채운다.
MANUAL_DIFF_RESOURCE = "deployment/checkout-api"
MANUAL_DIFF_ACTUAL_IMAGE = "unknown"

router = APIRouter()


def command_diff(payload: CommandRequest, workspace_id: str) -> Diff:
    raw = payload.diff or {
        "resource": MANUAL_DIFF_RESOURCE,
        "namespace": payload.namespace,
        "desired_image": payload.action,
        "actual_image": MANUAL_DIFF_ACTUAL_IMAGE,
        "risk": Sandbox.RISK_TAG,
    }
    raw = {**raw, "workspace_id": workspace_id, "cluster_id": payload.cluster_id}
    return cast(Diff, Diff.from_body(raw))


def require_cluster_deploy_access(
    db: Any, current: Any, workspace_id: str, cluster_id: str
) -> None:
    if not db.user_has_resource_access(
        current.user_id,
        workspace_id,
        AccessResourceType.CLUSTER.value,
        cluster_id,
        DEPLOY_ACCESS,
    ):
        raise HTTPException(status_code=ACCESS_DENIED_CODE, detail=RESOURCE_ACCESS_DENIED)


async def lease_next_command(
    db: Any, cluster_id: str, workspace_id: str, agent_id: str, timeout: int
) -> JsonObject | None:
    """롱폴 — 이 클러스터의 다음 명령을 timeout 까지 대기하며 리스(아웃바운드 단일 채널)."""
    deadline = time.time() + min(timeout, MAX_POLL_SECONDS)
    while time.time() < deadline:
        row = await db.lease_agent_command(
            cluster_id,
            workspace_id,
            CommandStatus.QUEUED,
            CommandStatus.LEASED,
            agent_id,
            LEASE_SECONDS,
        )
        if row:
            return row
        await asyncio.sleep(POLL_SLEEP_SECONDS)
    return None


@router.post(gateway_routes.COMMANDS_PATH, response_model=AcceptedResponse)
async def commands(
    payload: CommandRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> AcceptedResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_cluster_deploy_access(db, current, workspace_id, payload.cluster_id)
    accepted = await events.accept_body(
        CommandRequestedBody(
            cluster_id=payload.cluster_id,
            action=payload.action,
            namespace=payload.namespace,
            reason=payload.reason or "manual command request",
            diff=command_diff(payload, workspace_id),
            workspace_id=workspace_id,
            requested_by=current.user_id,
        ),
        actor=Actor(current.user_id, tuple(current.roles)),
    )
    return AcceptedResponse(
        accepted=True,
        event_id=accepted.event.event_id,
        correlation_id=accepted.event.correlation_id,
    )


# agent 라우트 — 라우터 단위 가드(필터)로 per-cluster 토큰 인증.
# workspace_id/cluster_id 는 토큰으로 인증된 identity 에서만 취하고 body/query 는 신뢰 안 함.
agent_router = APIRouter(dependencies=[Depends(require_cluster_agent)])


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
    correlation_id = await db.start_agent_command(
        command_id,
        identity.workspace_id,  # body 가 아닌 토큰 identity 의 workspace
        identity.cluster_id,  # body 가 아닌 토큰 identity 의 cluster
        payload.lease_id,
        payload.agent_id,
        CommandStatus.RUNNING,
        LEASE_SECONDS,
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
    correlation_id = await db.heartbeat_agent_command(
        command_id,
        identity.workspace_id,
        identity.cluster_id,
        payload.lease_id,
        payload.agent_id,
        LEASE_SECONDS,
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
    events: Any = Depends(get_events),
) -> EventIdAcceptedResponse:
    result = payload.model_dump()
    result["workspace_id"] = identity.workspace_id
    result["cluster_id"] = identity.cluster_id
    correlation_id = await db.complete_agent_command(
        command_id,
        identity.workspace_id,
        identity.cluster_id,
        result,
        payload.lease_id,
        payload.agent_id,
    )
    if not correlation_id:
        raise HTTPException(status_code=NOT_FOUND_CODE, detail=NOT_FOUND_MESSAGE)
    accepted = await events.accept_body(
        CommandCompletedBody(command_id=command_id, result=result), correlation_id
    )
    return EventIdAcceptedResponse(accepted=True, event_id=accepted.event.event_id)


router.include_router(agent_router)

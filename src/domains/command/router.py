"""command 도메인 HTTP 라우터 — 명령 발행 + agent 명령 풀(롱폴)·시작·결과.

agent 라우트는 APIRouter(dependencies=[Depends(require_agent)]) 로 라우터 단위 가드(필터)
를 적용 — 핸들러마다 인증 반복 없이 선언적으로 보호한다.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException

from domains.identity.dependencies import require_agent, require_session
from packages.config.constants import CommandStatus, Sandbox, Target
from packages.contracts.auth import Actor
from packages.contracts.event_bus.bodies import CommandCompletedBody, CommandRequestedBody, Diff
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.fields import Gateway
from packages.contracts.gateway.requests import (
    CommandRequest,
    CommandResultRequest,
    CommandStartRequest,
)
from packages.runtime.dependencies import get_db, get_events

DEFAULT_POLL_SECONDS = 10
MAX_POLL_SECONDS = 30
POLL_SLEEP_SECONDS = 1
LEASE_SECONDS = 60
NOT_FOUND_CODE = 404
NOT_FOUND_MESSAGE = "command not found"

router = APIRouter()


def command_diff(payload: CommandRequest) -> Diff:
    raw = payload.diff or {
        "resource": "manual/command",
        "namespace": payload.namespace,
        "desired_image": payload.action,
        "actual_image": "unknown",
        "risk": Sandbox.RISK_TAG,
    }
    return cast(Diff, Diff.from_body(raw))


async def lease_next_command(
    db: Any, cluster_id: str, agent_id: str, timeout: int
) -> dict[str, Any] | None:
    """롱폴 — 이 클러스터의 다음 명령을 timeout 까지 대기하며 리스(아웃바운드 단일 채널)."""
    deadline = time.time() + min(timeout, MAX_POLL_SECONDS)
    while time.time() < deadline:
        row = await db.lease_agent_command(
            cluster_id, CommandStatus.QUEUED, CommandStatus.LEASED, agent_id, LEASE_SECONDS
        )
        if row:
            return row
        await asyncio.sleep(POLL_SLEEP_SECONDS)
    return None


@router.post(gateway_routes.COMMANDS_PATH)
async def commands(
    payload: CommandRequest,
    current: Any = Depends(require_session),
    events: Any = Depends(get_events),
) -> dict[str, Any]:
    accepted = await events.accept_body(
        CommandRequestedBody(
            cluster_id=payload.cluster_id,
            action=payload.action,
            namespace=payload.namespace,
            reason=payload.reason or "manual command request",
            diff=command_diff(payload),
            requested_by=current.user_id,
        ),
        actor=Actor(current.user_id, tuple(current.roles)),
    )
    return accepted.response()


# agent 라우트 — 라우터 단위 가드(필터)로 일괄 인증.
agent_router = APIRouter(dependencies=[Depends(require_agent)])


@agent_router.get(gateway_routes.AGENT_COMMAND_POLL_PATH)
async def poll_command(
    cluster_id: str = Target.DEFAULT_CLUSTER_ID,
    agent_id: str = "target-agent",
    timeout: int = DEFAULT_POLL_SECONDS,
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    # 멀티클러스터: 각 클러스터 agent 가 자기 cluster_id 로 아웃바운드 롱폴(인바운드 0).
    row = await lease_next_command(db, cluster_id, agent_id, timeout)
    return {Gateway.COMMAND: row}


@agent_router.post(gateway_routes.AGENT_COMMAND_START_PATH)
async def command_start(
    command_id: str, payload: CommandStartRequest, db: Any = Depends(get_db)
) -> dict[str, Any]:
    correlation_id = await db.start_agent_command(
        command_id, payload.lease_id, payload.agent_id, CommandStatus.RUNNING
    )
    if not correlation_id:
        raise HTTPException(status_code=NOT_FOUND_CODE, detail=NOT_FOUND_MESSAGE)
    return {Gateway.ACCEPTED: True, Gateway.CORRELATION_ID: correlation_id}


@agent_router.post(gateway_routes.AGENT_COMMAND_RESULT_PATH)
async def command_result(
    command_id: str,
    payload: CommandResultRequest,
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> dict[str, Any]:
    result = payload.model_dump()
    correlation_id = await db.complete_agent_command(
        command_id, result, payload.lease_id, payload.agent_id
    )
    if not correlation_id:
        raise HTTPException(status_code=NOT_FOUND_CODE, detail=NOT_FOUND_MESSAGE)
    accepted = await events.accept_body(
        CommandCompletedBody(command_id=command_id, result=result), correlation_id
    )
    return {Gateway.ACCEPTED: True, Gateway.EVENT_ID: accepted.event.event_id}


router.include_router(agent_router)

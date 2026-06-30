"""identity 인가 가드(필터) — Depends 로 라우터/라우트에 선언적으로 적용.

클로저로 매 핸들러에서 검사하는 대신, 가드를 한 곳에 정의하고
APIRouter(dependencies=[Depends(require_*)]) 또는 라우트 인자로 선언한다.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request

from packages.contracts.identity import AccountRole

AGENT_TOKEN_HEADER = "x-agent-token"
AGENT_AUTH_REQUIRED_MESSAGE = "agent authentication required"
ADMIN_AUTH_REQUIRED_MESSAGE = "admin role required"


def hash_agent_token(token: str) -> str:
    """agent 토큰 → SHA-256 hex. 원문은 저장하지 않고 이 해시만 저장/비교한다."""
    return hashlib.sha256(token.encode()).hexdigest()


@dataclass(frozen=True)
class ClusterAgentIdentity:
    """토큰으로 인증된 agent 의 권위 신원 — 요청 body 가 아닌 등록 레지스트리 기준."""

    workspace_id: str
    cluster_id: str


def get_password_auth(request: Request) -> Any:
    return request.app.state.password_auth


async def require_session(request: Request) -> Any:
    """사용자 세션 가드 — 유효 세션 필요(없으면 401)."""
    return await request.app.state.auth.require_session(request)


async def require_admin_session(request: Request) -> Any:
    """관리자 세션 가드 — account role admin 필요."""
    current = await require_session(request)
    if AccountRole.ADMIN.value not in current.roles:
        raise HTTPException(status_code=403, detail=ADMIN_AUTH_REQUIRED_MESSAGE)
    return current


def require_cluster_agent(request: Request) -> ClusterAgentIdentity:
    """per-cluster agent 토큰 가드 — fail-closed.

    x-agent-token 을 해시해 등록 레지스트리에서 클러스터를 찾고, 그 클러스터의
    권위 (workspace_id, cluster_id) 를 돌려준다. agent 라우트는 이 값을 쓰고
    요청 body 의 workspace_id/cluster_id 는 신뢰하지 않는다(크로스 테넌트 차단).
    토큰 없음/미등록/미인증(해시 불일치)은 모두 401.
    """
    token = request.headers.get(AGENT_TOKEN_HEADER, "")
    if not token:
        raise HTTPException(status_code=401, detail=AGENT_AUTH_REQUIRED_MESSAGE)
    identity = request.app.state.db.authenticate_cluster_agent(hash_agent_token(token))
    if identity is None:
        raise HTTPException(status_code=401, detail=AGENT_AUTH_REQUIRED_MESSAGE)
    return ClusterAgentIdentity(
        workspace_id=identity["workspace_id"],
        cluster_id=identity["cluster_id"],
    )

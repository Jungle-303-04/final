"""워커가 ctx.db 로 보는 능력별 store(async). 서비스는 자기 store 만 본다.

ctx.db 는 AsyncDb 로 감싸져 모든 메서드가 async → 여기 메서드도 async.
핸들러가 `ctx: EventContext[RcaStore]` 로 받으면 IDE·타입체커가 그 store 의
메서드만 노출한다(다른 서비스 DB 능력은 안 보임).
"""

from __future__ import annotations

from typing import Any, Protocol

from packages.contracts.event_bus.interfaces import EventEnvelope, JsonObject


class RcaStore(Protocol):
    async def save_evidence(self, correlation_id: str, kind: str, body: JsonObject) -> None: ...
    async def save_rca_report(
        self, correlation_id: str, root_cause: str, action: str, body: JsonObject
    ) -> None: ...


class RepoChangeStore(Protocol):
    async def save_repo_change(
        self, correlation_id: str, commit_sha: str, manifest: JsonObject
    ) -> None: ...


class PullRequestStore(Protocol):
    async def latest_github_token_ref(self) -> str | None: ...
    async def save_pull_request(
        self, correlation_id: str, pr_url: str, title: str, body: str, status: str
    ) -> None: ...


class AgentCommandStore(Protocol):
    async def queue_agent_command(
        self, correlation_id: str, plan: JsonObject, status: str
    ) -> None: ...


class DashboardStore(Protocol):
    async def upsert_dashboard(self, evt: EventEnvelope, status: Any, summary: str) -> None: ...


class AuditStore(Protocol):
    async def append_audit_log(self, evt: EventEnvelope) -> None: ...

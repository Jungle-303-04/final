"""ai-chat-worker — ai.message.received → 대화 엔진(도구 호출 루프) 응답 생성.

실패 경로 보장: 엔진 호출에 자체 데드라인(런타임 핸들러 타임아웃보다 짧게)을 걸어
타임아웃도 예외 경로로 수렴 — 대화가 waiting 상태로 영구히 남지 않게 함.
멀티턴 문맥: 최근 히스토리를 transcript 로 주입.
도구: @ai.tool 레지스트리(도메인 자동 발견 + 서비스 로컬 tools.py) — LLM 이
플랫폼 조회 도구를 호출하며 답을 구성하고, 호출 흔적은 응답 metadata 에 남김.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import tools  # noqa: F401  # 서비스 로컬 도구(@ai.tool) 등록 유발

from domains.ai.agent import build_system_prompt
from domains.ai.events import AiMessageFailedBody, AiMessageReceivedBody, AiMessageRespondedBody
from domains.ai.messages import text
from domains.registry import load_domain_tools
from packages.ai.engine import ConversationEngine
from packages.ai.llm import build_llm_client, describe_llm_client
from packages.ai.metrics import metered_llm_client
from packages.ai.tools import ToolContext, ai
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.stores import AiConversationStore
from packages.runtime.app import App, EventContext

app = App("ai-chat-worker")
llm_client = build_llm_client()
load_domain_tools()  # domains/*/tools.py 자동 발견 — @ai.tool 등록 유발
engine = ConversationEngine(llm_client, ai)

# 런타임 핸들러 타임아웃(30초)보다 짧게 — 실패 기록/이벤트가 항상 실행될 예산 확보.
AGENT_DEADLINE_SECONDS = 20
HISTORY_LIMIT = 10


def response_message_id(request_message_id: str) -> str:
    return f"{request_message_id}-assistant"


def request_locale(evt: AiMessageReceivedBody) -> str | None:
    context = evt.context or {}
    locale = context.get("locale")
    return str(locale) if locale else None


def request_cluster_id(evt: AiMessageReceivedBody) -> str | None:
    context = evt.context or {}
    cluster_id = context.get("cluster_id")
    return str(cluster_id) if cluster_id else None


def request_resource_context(evt: AiMessageReceivedBody) -> dict[str, str]:
    context = evt.context or {}
    keys = (
        "application_id",
        "diff_source",
        "workflow_run_id",
        "approval_id",
        "resource_type",
        "kind",
        "namespace",
        "name",
        "uid",
        "incident_id",
        "correlation_id",
        "symptom",
        "root_cause",
    )
    return {
        key: str(context[key]).strip()
        for key in keys
        if context.get(key) is not None and str(context[key]).strip()
    }


def engine_for_request(evt: AiMessageReceivedBody, ctx: EventContext[AiConversationStore]):
    if not isinstance(engine, ConversationEngine):
        return engine
    return ConversationEngine(
        metered_llm_client(
            engine.llm,
            ctx.db,
            workspace_id=evt.workspace_id,
            event_id=ctx.event_id,
            correlation_id=ctx.correlation_id,
            causation_id=ctx.causation_id,
        ),
        engine.registry,
        max_tool_calls=engine.max_tool_calls,
    )


@app.on(AiMessageReceivedBody)
async def on_ai_message_received(
    evt: AiMessageReceivedBody,
    ctx: EventContext[AiConversationStore],
) -> AsyncIterator[EventBody]:
    locale = request_locale(evt)
    resource_context = request_resource_context(evt)
    try:
        history = await ctx.db.list_ai_messages(
            evt.workspace_id, evt.conversation_id, newest=HISTORY_LIMIT
        )
        request_engine = engine_for_request(evt, ctx)
        result = await asyncio.wait_for(
            request_engine.respond(
                system_prompt=build_system_prompt(evt, locale),
                history=history,
                user_message=evt.content,
                context=ToolContext(
                    db=ctx.db,
                    workspace_id=evt.workspace_id,
                    user_id=evt.user_id,
                    cluster_id=request_cluster_id(evt),
                    resource_type=resource_context.get("resource_type"),
                    kind=resource_context.get("kind"),
                    namespace=resource_context.get("namespace"),
                    name=resource_context.get("name"),
                    uid=resource_context.get("uid"),
                    incident_id=resource_context.get("incident_id"),
                    correlation_id=resource_context.get("correlation_id"),
                    symptom=resource_context.get("symptom"),
                    root_cause=resource_context.get("root_cause"),
                    resource_context=resource_context,
                    locale=locale,
                ),
            ),
            timeout=AGENT_DEADLINE_SECONDS,
        )
        response = AiMessageRespondedBody(
            conversation_id=evt.conversation_id,
            request_message_id=evt.message_id,
            response_message_id=response_message_id(evt.message_id),
            content=result.content.strip() or text("chat.empty_response", locale),
            agent=evt.agent,
            workspace_id=evt.workspace_id,
            metadata={
                "llm": describe_llm_client(request_engine.llm),
                "raw_length": result.raw_length,
                "tool_trace": result.tool_trace,
                "request_event_id": ctx.event_id,
                "correlation_id": ctx.correlation_id,
            },
        )
        stored = await ctx.db.record_ai_response(
            {**response.to_body(), "correlation_id": ctx.correlation_id}
        )
        if not stored:
            return
        yield response
    except Exception as exc:
        reason = (
            text("chat.timeout_reason", locale, seconds=AGENT_DEADLINE_SECONDS)
            if isinstance(exc, TimeoutError)
            else text("chat.failure_reason", locale, error=exc)
        )
        failure = AiMessageFailedBody(
            conversation_id=evt.conversation_id,
            request_message_id=evt.message_id,
            reason=reason,
            agent=evt.agent,
            workspace_id=evt.workspace_id,
            metadata={"request_event_id": ctx.event_id, "correlation_id": ctx.correlation_id},
        )
        stored = await ctx.db.record_ai_failure(failure.to_body())
        if not stored:
            return
        yield failure


if __name__ == "__main__":
    app.run()

"""ai-chat-worker — ai.message.received → 에이전트 응답 생성.

실패 경로 보장: 에이전트 호출에 자체 데드라인(런타임 핸들러 타임아웃보다 짧게)을 걸어
타임아웃도 예외 경로로 수렴 — 대화가 waiting 상태로 영구히 남지 않게 함.
멀티턴 문맥: 최근 히스토리를 프롬프트에 주입.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from domains.ai.agent import OperationsChatAgent
from domains.ai.events import AiMessageFailedBody, AiMessageReceivedBody, AiMessageRespondedBody
from domains.ai.messages import text
from packages.ai.llm import build_llm_client, describe_llm_client
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.stores import AiConversationStore
from packages.runtime.app import App, EventContext

app = App("ai-chat-worker")
llm_client = build_llm_client()
agent = OperationsChatAgent(llm_client)

# 런타임 핸들러 타임아웃(30초)보다 짧게 — 실패 기록/이벤트가 항상 실행될 예산 확보.
AGENT_DEADLINE_SECONDS = 20
HISTORY_LIMIT = 10


def response_message_id(request_message_id: str) -> str:
    return f"{request_message_id}-assistant"


def request_locale(evt: AiMessageReceivedBody) -> str | None:
    context = evt.context or {}
    locale = context.get("locale")
    return str(locale) if locale else None


@app.on(AiMessageReceivedBody)
async def on_ai_message_received(
    evt: AiMessageReceivedBody,
    ctx: EventContext[AiConversationStore],
) -> AsyncIterator[EventBody]:
    locale = request_locale(evt)
    try:
        history = await ctx.db.list_ai_messages(
            evt.workspace_id, evt.conversation_id, newest=HISTORY_LIMIT
        )
        result = await asyncio.wait_for(
            agent.run(evt, history=history, locale=locale),
            timeout=AGENT_DEADLINE_SECONDS,
        )
        response = AiMessageRespondedBody(
            conversation_id=evt.conversation_id,
            request_message_id=evt.message_id,
            response_message_id=response_message_id(evt.message_id),
            content=str(result["content"]),
            agent=evt.agent,
            workspace_id=evt.workspace_id,
            metadata={
                "llm": describe_llm_client(llm_client),
                "raw_length": result.get("raw_length", 0),
                "request_event_id": ctx.event_id,
                "correlation_id": ctx.correlation_id,
            },
        )
        await ctx.db.record_ai_response(
            {**response.to_body(), "correlation_id": ctx.correlation_id}
        )
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
        await ctx.db.record_ai_failure(failure.to_body())
        yield failure


if __name__ == "__main__":
    app.run()

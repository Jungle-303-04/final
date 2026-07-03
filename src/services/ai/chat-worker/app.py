"""ai-chat-worker — ai.message.received -> agent response."""

from __future__ import annotations

from collections.abc import AsyncIterator

from domains.ai.agent import OperationsChatAgent
from packages.ai.llm import build_llm_client
from packages.contracts.event_bus.bodies import (
    AiMessageFailedBody,
    AiMessageReceivedBody,
    AiMessageRespondedBody,
    EventBody,
)
from packages.contracts.stores import AiConversationStore
from packages.runtime.app import App, EventContext

app = App("ai-chat-worker")
agent = OperationsChatAgent(build_llm_client())


def response_message_id(request_message_id: str) -> str:
    return f"{request_message_id}-assistant"


@app.on(AiMessageReceivedBody)
async def on_ai_message_received(
    evt: AiMessageReceivedBody,
    ctx: EventContext[AiConversationStore],
) -> AsyncIterator[EventBody]:
    try:
        result = await agent.run(evt)
        response = AiMessageRespondedBody(
            conversation_id=evt.conversation_id,
            request_message_id=evt.message_id,
            response_message_id=response_message_id(evt.message_id),
            content=str(result["content"]),
            agent=evt.agent,
            workspace_id=evt.workspace_id,
            metadata={
                "llm": "configured-client",
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
        failure = AiMessageFailedBody(
            conversation_id=evt.conversation_id,
            request_message_id=evt.message_id,
            reason=str(exc),
            agent=evt.agent,
            workspace_id=evt.workspace_id,
            metadata={"request_event_id": ctx.event_id, "correlation_id": ctx.correlation_id},
        )
        await ctx.db.record_ai_failure(failure.to_body())
        yield failure


if __name__ == "__main__":
    app.run()

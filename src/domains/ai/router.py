"""AI conversation HTTP router."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from domains.ai.events import AiMessageReceivedBody
from domains.ai.repository import ROLE_USER, STATUS_WAITING
from domains.identity.dependencies import require_session
from packages.contracts.auth import Actor
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import (
    AiConversationCreateRequest,
    AiMessageCreateRequest,
)
from packages.contracts.gateway.responses import (
    AiConversationAcceptedResponse,
    AiConversationResponse,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID
from packages.runtime.dependencies import get_db, get_events

router = APIRouter()
DEFAULT_AGENT = "operations-chat"
NOT_FOUND = "conversation not found"


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4()}"


def title_for(payload: AiConversationCreateRequest) -> str:
    if payload.title:
        return payload.title
    collapsed = " ".join(payload.message.split())
    return collapsed[:80] if collapsed else "AI conversation"


@router.post(
    gateway_routes.AI_CONVERSATIONS_PATH,
    response_model=AiConversationAcceptedResponse,
)
async def create_conversation(
    payload: AiConversationCreateRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> AiConversationAcceptedResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    agent = payload.agent or DEFAULT_AGENT
    conversation_id = new_id("aic")
    message_id = new_id("aim")
    title = title_for(payload)
    db.create_ai_conversation(
        {
            "conversation_id": conversation_id,
            "workspace_id": workspace_id,
            "user_id": current.user_id,
            "title": title,
            "agent": agent,
            "status": STATUS_WAITING,
            "context": payload.context,
        }
    )
    db.append_ai_message(
        {
            "message_id": message_id,
            "conversation_id": conversation_id,
            "workspace_id": workspace_id,
            "role": ROLE_USER,
            "content": payload.message,
            "agent": agent,
            "metadata": {"source": "http"},
        }
    )
    accepted = await events.accept_body(
        AiMessageReceivedBody(
            conversation_id=conversation_id,
            message_id=message_id,
            content=payload.message,
            agent=agent,
            user_id=current.user_id,
            workspace_id=workspace_id,
            context=payload.context,
        ),
        actor=Actor(current.user_id, tuple(current.roles)),
    )
    return AiConversationAcceptedResponse(
        accepted=True,
        conversation_id=conversation_id,
        message_id=message_id,
        event_id=accepted.event.event_id,
        correlation_id=accepted.event.correlation_id,
    )


@router.post(
    gateway_routes.AI_CONVERSATION_MESSAGES_PATH,
    response_model=AiConversationAcceptedResponse,
)
async def append_message(
    conversation_id: str,
    payload: AiMessageCreateRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> AiConversationAcceptedResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    conversation = db.get_ai_conversation(workspace_id, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    agent = payload.agent or str(conversation["agent"])
    message_id = new_id("aim")
    db.append_ai_message(
        {
            "message_id": message_id,
            "conversation_id": conversation_id,
            "workspace_id": workspace_id,
            "role": ROLE_USER,
            "content": payload.message,
            "agent": agent,
            "metadata": {"source": "http"},
        }
    )
    db.mark_ai_conversation_status(workspace_id, conversation_id, STATUS_WAITING)
    accepted = await events.accept_body(
        AiMessageReceivedBody(
            conversation_id=conversation_id,
            message_id=message_id,
            content=payload.message,
            agent=agent,
            user_id=current.user_id,
            workspace_id=workspace_id,
            context=payload.context or conversation.get("context") or {},
        ),
        actor=Actor(current.user_id, tuple(current.roles)),
    )
    return AiConversationAcceptedResponse(
        accepted=True,
        conversation_id=conversation_id,
        message_id=message_id,
        event_id=accepted.event.event_id,
        correlation_id=accepted.event.correlation_id,
    )


@router.get(
    gateway_routes.AI_CONVERSATION_PATH,
    response_model=AiConversationResponse,
)
async def get_conversation(
    conversation_id: str,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> AiConversationResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    conversation = db.get_ai_conversation(workspace_id, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    messages = db.list_ai_messages(workspace_id, conversation_id)
    return AiConversationResponse(conversation=conversation, messages=messages)

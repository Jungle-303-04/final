"""Conversation agent built on the shared AiAgent base."""

from __future__ import annotations

import json
from typing import Any

from packages.ai.agent import AiAgent


class OperationsChatAgent(AiAgent):
    """Small operations assistant agent for event-driven conversations."""

    def build_prompt(self, evt: Any) -> str:
        context = json.dumps(evt.context or {}, ensure_ascii=False, sort_keys=True)
        return (
            "You are an operations assistant for a Kubernetes event-driven platform.\n"
            "Answer with concise operational reasoning and concrete next checks.\n\n"
            f"Agent: {evt.agent}\n"
            f"Conversation: {evt.conversation_id}\n"
            f"Workspace: {evt.workspace_id}\n"
            f"Context: {context}\n\n"
            f"User message:\n{evt.content}"
        )

    def parse_result(self, raw: str) -> dict[str, Any]:
        content = raw.strip() or "No response generated."
        return {"content": content, "raw_length": len(raw)}

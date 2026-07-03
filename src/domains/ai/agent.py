"""대화 에이전트 — 공유 AiAgent 베이스 위에서 동작.

노출 텍스트는 domains.ai.messages 카탈로그에서 조회(로케일 번역 가능).
멀티턴 문맥은 history(최근 메시지 목록)로 주입.
"""

from __future__ import annotations

import json
from typing import Any

from domains.ai.messages import text
from packages.ai.agent import AiAgent


class OperationsChatAgent(AiAgent):
    """이벤트 기반 대화용 소형 운영 어시스턴트."""

    def build_prompt(self, evt: Any, **context: Any) -> str:
        locale = context.get("locale")
        history: list[dict[str, Any]] = list(context.get("history") or [])
        request_context = json.dumps(evt.context or {}, ensure_ascii=False, sort_keys=True)
        transcript = "\n".join(
            f"[{row.get('role', 'user')}] {row.get('content', '')}" for row in history
        )
        return (
            f"{text('chat.system_prompt', locale)}\n\n"
            f"Agent: {evt.agent}\n"
            f"Conversation: {evt.conversation_id}\n"
            f"Workspace: {evt.workspace_id}\n"
            f"Context: {request_context}\n\n"
            f"Conversation history:\n{transcript or '(none)'}\n\n"
            f"User message:\n{evt.content}"
        )

    def parse_result(self, raw: str) -> dict[str, Any]:
        content = raw.strip() or text("chat.empty_response")
        return {"content": content, "raw_length": len(raw)}

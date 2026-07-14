"""Opsia 알림 규칙 생성 서비스."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

from domains.alert.schemas import AlertRuleCreatedResponse, AlertRuleCreateRequest


class AlertChannelNotFoundError(ValueError):
    """규칙이 현재 워크스페이스에 없는 채널을 참조함."""


def create_alert_rule_setting(
    db: Any,
    payload: AlertRuleCreateRequest,
    *,
    workspace_id: str,
    actor_id: str,
    id_factory: Callable[[], str] | None = None,
) -> AlertRuleCreatedResponse:
    """Opsia DB에만 저장할 규칙을 만들고 식별자를 반환한다."""
    _require_workspace_channels(db, workspace_id, payload.channels)
    rule_id = (id_factory or _new_rule_id)()
    saved = db.create_alert_rule(
        {
            "rule_id": rule_id,
            "workspace_id": workspace_id,
            "created_by": actor_id,
            **payload.model_dump(),
        }
    )
    return AlertRuleCreatedResponse(rule_id=str(saved.get("rule_id") or rule_id))


def _require_workspace_channels(db: Any, workspace_id: str, channel_ids: list[str]) -> None:
    if not channel_ids:
        return
    getter = getattr(db, "get_alert_channel", None)
    if not callable(getter):
        raise RuntimeError("alert channel repository is unavailable")
    for channel_id in channel_ids:
        if getter(workspace_id, channel_id) is None:
            raise AlertChannelNotFoundError(channel_id)


def _new_rule_id() -> str:
    return f"alr-{uuid.uuid4()}"

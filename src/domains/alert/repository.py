"""alert 도메인 repository — 알림 채널(라우팅 룰) CRUD 와 severity 매칭 기준."""

from __future__ import annotations

import uuid

from sqlalchemy import case, delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.alert.models import AlertChannel
from packages.contracts.event_bus.interfaces import JsonObject
from packages.storage.engine import DatabaseConnection, iso_or_none

# severity 순위 — 명확한 단일 기준. 미지 값은 warning 으로 취급(과소 통지 방지 절충).
SEVERITY_RANK: dict[str, int] = {"info": 0, "warning": 1, "critical": 2}
DEFAULT_SEVERITY_RANK = SEVERITY_RANK["warning"]


def severity_rank(severity: str) -> int:
    return SEVERITY_RANK.get(severity.strip().lower(), DEFAULT_SEVERITY_RANK)


def severity_matches(min_severity: str, severity: str) -> bool:
    """채널의 min_severity 이상인 알림만 통과."""
    return severity_rank(severity) >= severity_rank(min_severity)


def serialize_alert_channel(row: JsonObject) -> JsonObject:
    item = dict(row)
    item["last_tested_at"] = iso_or_none(item.get("last_tested_at"))
    item["created_at"] = iso_or_none(item.get("created_at"))
    item["updated_at"] = iso_or_none(item.get("updated_at"))
    return item


class AlertChannelRepository(DatabaseConnection):
    def list_alert_channels(
        self, workspace_id: str, *, only_enabled: bool = False
    ) -> list[JsonObject]:
        table = AlertChannel.__table__
        statement = (
            select(table)
            .where(table.c.workspace_id == workspace_id)
            .order_by(table.c.name, table.c.channel_id)
        )
        if only_enabled:
            statement = statement.where(table.c.enabled.is_(True))
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [serialize_alert_channel(dict(row)) for row in rows]

    def get_alert_channel(self, workspace_id: str, channel_id: str) -> JsonObject | None:
        table = AlertChannel.__table__
        statement = (
            select(table)
            .where(table.c.workspace_id == workspace_id, table.c.channel_id == channel_id)
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return serialize_alert_channel(dict(row)) if row else None

    def upsert_alert_channel(self, payload: JsonObject) -> JsonObject:
        table = AlertChannel.__table__
        channel_id = str(payload.get("channel_id") or f"chan-{uuid.uuid4().hex[:16]}")
        values = {
            "channel_id": channel_id,
            "workspace_id": str(payload["workspace_id"]),
            "name": str(payload["name"]),
            "kind": str(payload.get("kind") or "webhook"),
            "url": str(payload["url"]),
            "min_severity": str(payload.get("min_severity") or "warning").strip().lower(),
            "enabled": bool(payload.get("enabled", True)),
        }
        insert = pg_insert(table).values(**values, updated_at=func.now())
        statement = insert.on_conflict_do_update(
            index_elements=[table.c.channel_id],
            set_={
                "name": insert.excluded.name,
                "kind": insert.excluded.kind,
                "url": insert.excluded.url,
                "min_severity": insert.excluded.min_severity,
                "enabled": insert.excluded.enabled,
                # Delivery evidence is valid only for the exact tested webhook URL.
                "last_tested_at": case((table.c.url != insert.excluded.url, None), else_=table.c.last_tested_at),
                "last_test_status": case((table.c.url != insert.excluded.url, None), else_=table.c.last_test_status),
                "last_test_detail": case((table.c.url != insert.excluded.url, None), else_=table.c.last_test_detail),
                "last_test_status_code": case((table.c.url != insert.excluded.url, None), else_=table.c.last_test_status_code),
                "updated_at": func.now(),
            },
            where=table.c.workspace_id == insert.excluded.workspace_id,
        ).returning(table)
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        if row:
            return serialize_alert_channel(dict(row))
        raise LookupError("alert channel not found in workspace")

    def delete_alert_channel(self, workspace_id: str, channel_id: str) -> bool:
        table = AlertChannel.__table__
        statement = (
            delete(table)
            .where(table.c.workspace_id == workspace_id, table.c.channel_id == channel_id)
            .returning(table.c.channel_id)
        )
        with self.connection() as conn:
            row = conn.execute(statement).first()
        return row is not None

    def record_alert_channel_test(
        self,
        workspace_id: str,
        channel_id: str,
        *,
        status: str,
        detail: str,
        status_code: int | None = None,
    ) -> JsonObject:
        table = AlertChannel.__table__
        statement = (
            table.update()
            .where(table.c.workspace_id == workspace_id, table.c.channel_id == channel_id)
            .values(
                last_tested_at=func.now(),
                last_test_status=status,
                last_test_detail=detail,
                last_test_status_code=status_code,
                updated_at=func.now(),
            )
            .returning(table)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        if row:
            return serialize_alert_channel(dict(row))
        raise LookupError("alert channel not found in workspace")

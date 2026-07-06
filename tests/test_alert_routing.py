"""알림 라우팅 룰 — severity 매칭 기준, 워커 채널 발송/폴백, 관리 API."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from conftest import ROOT, load_file
from fastapi import HTTPException

from domains.alert.events import AlertRequestedBody
from domains.alert.repository import severity_matches
from domains.alert.router import delete_alert_channel, list_alert_channels, upsert_alert_channel
from packages.contracts.gateway.requests import AlertChannelUpsertRequest


def load_alert_worker():
    return load_file(
        ROOT / "src" / "services" / "alert" / "alert-worker" / "app.py", "test_alert_worker_app"
    )


def alert(severity: str = "critical") -> AlertRequestedBody:
    return AlertRequestedBody(
        cluster_id="cluster-1",
        namespace="sandbox",
        severity=severity,
        message="pod crash looping",
        reason="restart threshold",
        workspace_id="workspace-1",
    )


# ── severity 매칭 기준 ──────────────────────────────────────────


def test_severity_matching_is_ordered_and_defaults_unknown_to_warning() -> None:
    assert severity_matches("info", "info") is True
    assert severity_matches("warning", "info") is False
    assert severity_matches("warning", "critical") is True
    assert severity_matches("critical", "warning") is False
    # 미지 severity 는 warning 취급 — warning 채널엔 가고 critical 채널엔 안 감
    assert severity_matches("warning", "unknown-level") is True
    assert severity_matches("critical", "unknown-level") is False


# ── 워커 라우팅 ────────────────────────────────────────────────


class FakeWorkerDb:
    def __init__(self, channels: list[dict]) -> None:
        self.channels = channels
        self.requested: list[str] = []

    async def list_alert_channels(self, workspace_id: str):
        self.requested.append(workspace_id)
        return self.channels


def run_handler(module, evt, db):
    async def collect():
        ctx = SimpleNamespace(db=db, correlation_id="corr-1")
        return [body async for body in module.on_alert_requested(evt, ctx)]

    return asyncio.run(collect())


def test_worker_routes_to_matching_channels(monkeypatch) -> None:
    module = load_alert_worker()
    sent: list[tuple[str, dict]] = []

    async def fake_dispatch(alert, channel):
        sent.append((str(channel["name"]), alert.to_body()))
        return module.dispatched_body(alert, channel=str(channel["name"]), mode="webhook")

    monkeypatch.setattr(module, "dispatch_to_channel", fake_dispatch)
    db = FakeWorkerDb(
        [
            {"name": "ops-critical", "url": "http://hook-1", "min_severity": "critical"},
            {"name": "ops-all", "url": "http://hook-2", "min_severity": "info"},
        ]
    )

    bodies = run_handler(module, alert("critical"), db)

    assert [name for name, _ in sent] == ["ops-critical", "ops-all"]
    assert db.requested == ["workspace-1"]
    channels = {body.channel for body in bodies}
    assert channels == {"ops-critical", "ops-all"}


def test_worker_skips_channels_below_min_severity(monkeypatch) -> None:
    module = load_alert_worker()
    sent: list[str] = []

    async def fake_dispatch(alert, channel):
        sent.append(str(channel["name"]))
        return module.dispatched_body(alert, channel=str(channel["name"]), mode="webhook")

    monkeypatch.setattr(module, "dispatch_to_channel", fake_dispatch)
    db = FakeWorkerDb([{"name": "critical-only", "url": "http://hook", "min_severity": "critical"}])

    bodies = run_handler(module, alert("warning"), db)

    # 매칭 채널 0 → 기존 전역 provider 폴백(log) — 거부가 아니라 발송됨
    assert sent == []
    assert len(bodies) == 1
    assert bodies[0].channel == module.LOG_PROVIDER_NAME


def test_worker_rejects_when_all_channels_fail(monkeypatch) -> None:
    module = load_alert_worker()

    async def failing_dispatch(alert, channel):
        raise RuntimeError("hook down")

    monkeypatch.setattr(module, "dispatch_to_channel", failing_dispatch)
    db = FakeWorkerDb([{"name": "ops", "url": "http://hook", "min_severity": "info"}])

    bodies = run_handler(module, alert("critical"), db)

    assert len(bodies) == 1
    assert type(bodies[0]).__name__ == "AlertRejectedBody"


def test_worker_without_channel_store_falls_back_to_provider() -> None:
    module = load_alert_worker()
    bodies = run_handler(module, alert("critical"), SimpleNamespace())  # 저장소 메서드 없음
    assert len(bodies) == 1
    assert bodies[0].channel == module.LOG_PROVIDER_NAME


# ── 관리 API ──────────────────────────────────────────────────


class FakeChannelDb:
    def __init__(self) -> None:
        self.rows: dict[str, dict] = {}

    def list_alert_channels(self, workspace_id: str, *, only_enabled: bool = False):
        return [dict(row) for row in self.rows.values() if row["workspace_id"] == workspace_id]

    def upsert_alert_channel(self, payload: dict) -> dict:
        channel_id = payload.get("channel_id") or f"chan-{len(self.rows) + 1}"
        row = {
            "channel_id": channel_id,
            "workspace_id": payload["workspace_id"],
            "name": payload["name"],
            "kind": payload.get("kind", "webhook"),
            "url": payload["url"],
            "min_severity": payload.get("min_severity", "warning"),
            "enabled": payload.get("enabled", True),
            "created_at": None,
            "updated_at": None,
        }
        self.rows[channel_id] = row
        return dict(row)

    def delete_alert_channel(self, workspace_id: str, channel_id: str) -> bool:
        row = self.rows.get(channel_id)
        if row is None or row["workspace_id"] != workspace_id:
            return False
        del self.rows[channel_id]
        return True


ADMIN = SimpleNamespace(user_id="admin-1", workspace_id="workspace-1")


def test_alert_channel_admin_crud_roundtrip() -> None:
    async def run() -> None:
        db = FakeChannelDb()
        created = await upsert_alert_channel(
            AlertChannelUpsertRequest(name="ops", url="https://hooks.example/x"), ADMIN, db
        )
        assert created.min_severity == "warning"
        assert created.workspace_id == "workspace-1"

        listed = await list_alert_channels(ADMIN, db)
        assert [c.name for c in listed.channels] == ["ops"]

        await delete_alert_channel(created.channel_id, ADMIN, db)
        assert (await list_alert_channels(ADMIN, db)).channels == []

    asyncio.run(run())


def test_alert_channel_delete_missing_is_404() -> None:
    async def run() -> None:
        try:
            await delete_alert_channel("ghost", ADMIN, FakeChannelDb())
        except HTTPException as exc:
            assert exc.status_code == 404
        else:
            raise AssertionError("expected HTTPException")

    asyncio.run(run())

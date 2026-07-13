"""알림 라우팅 룰 — severity 매칭 기준, 워커 채널 발송/폴백, 관리 API."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import httpx
import pytest

from conftest import ROOT, load_file
from fastapi import HTTPException

import domains.alert.router as alert_router
from domains.alert.delivery import AlertDeliveryResult, post_alert_webhook
from domains.alert.events import AlertRequestedBody
from domains.alert.repository import severity_matches
from domains.alert.router import (
    delete_alert_channel,
    list_alert_channels,
    upsert_alert_channel,
)
from domains.alert.router import (
    test_alert_channel as send_alert_channel_test,
)
from packages.contracts.gateway.requests import AlertChannelTestRequest, AlertChannelUpsertRequest


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


class StubWorkerDb:
    def __init__(self, channels: list[dict]) -> None:
        self.channels = channels
        self.requested: list[str] = []

    def list_alert_channels(self, workspace_id: str):
        self.requested.append(workspace_id)
        return self.channels


class AsyncStubWorkerDb(StubWorkerDb):
    async def list_alert_channels(self, workspace_id: str):
        return super().list_alert_channels(workspace_id)


def run_handler(module, evt, db):
    async def collect():
        ctx = SimpleNamespace(db=db, correlation_id="corr-1")
        return [body async for body in module.on_alert_requested(evt, ctx)]

    return asyncio.run(collect())


def test_worker_routes_to_matching_channels(monkeypatch) -> None:
    module = load_alert_worker()
    sent: list[tuple[str, dict]] = []

    async def stub_dispatch(alert, channel):
        sent.append((str(channel["name"]), alert.to_body()))
        return module.dispatched_body(alert, channel=str(channel["name"]), mode="webhook")

    monkeypatch.setattr(module, "dispatch_to_channel", stub_dispatch)
    db = StubWorkerDb(
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


def test_worker_accepts_async_channel_store(monkeypatch) -> None:
    module = load_alert_worker()
    sent: list[str] = []

    async def stub_dispatch(alert, channel):
        sent.append(str(channel["name"]))
        return module.dispatched_body(alert, channel=str(channel["name"]), mode="webhook")

    monkeypatch.setattr(module, "dispatch_to_channel", stub_dispatch)
    db = AsyncStubWorkerDb([{"name": "async-ops", "url": "http://hook", "min_severity": "info"}])

    bodies = run_handler(module, alert("critical"), db)

    assert sent == ["async-ops"]
    assert [body.channel for body in bodies] == ["async-ops"]


def test_worker_skips_channels_below_min_severity(monkeypatch) -> None:
    module = load_alert_worker()
    sent: list[str] = []

    async def stub_dispatch(alert, channel):
        sent.append(str(channel["name"]))
        return module.dispatched_body(alert, channel=str(channel["name"]), mode="webhook")

    monkeypatch.setattr(module, "dispatch_to_channel", stub_dispatch)
    db = StubWorkerDb([{"name": "critical-only", "url": "http://hook", "min_severity": "critical"}])

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
    db = StubWorkerDb([{"name": "ops", "url": "http://hook", "min_severity": "info"}])

    bodies = run_handler(module, alert("critical"), db)

    assert len(bodies) == 1
    assert type(bodies[0]).__name__ == "AlertRejectedBody"


def test_worker_without_channel_store_falls_back_to_provider() -> None:
    module = load_alert_worker()
    bodies = run_handler(module, alert("critical"), SimpleNamespace())  # 저장소 메서드 없음
    assert len(bodies) == 1
    assert bodies[0].channel == module.LOG_PROVIDER_NAME


# ── 관리 API ──────────────────────────────────────────────────


class StubChannelDb:
    def __init__(self) -> None:
        self.rows: dict[str, dict] = {}

    def list_alert_channels(self, workspace_id: str, *, only_enabled: bool = False):
        return [dict(row) for row in self.rows.values() if row["workspace_id"] == workspace_id]

    def get_alert_channel(self, workspace_id: str, channel_id: str) -> dict | None:
        row = self.rows.get(channel_id)
        if row is None or row["workspace_id"] != workspace_id:
            return None
        return dict(row)

    def upsert_alert_channel(self, payload: dict) -> dict:
        channel_id = payload.get("channel_id") or f"chan-{len(self.rows) + 1}"
        previous = self.rows.get(channel_id, {})
        test_result = {
            "last_tested_at": previous.get("last_tested_at"),
            "last_test_status": previous.get("last_test_status"),
            "last_test_detail": previous.get("last_test_detail"),
            "last_test_status_code": previous.get("last_test_status_code"),
        }
        if previous and previous.get("url") != payload["url"]:
            test_result = {
                "last_tested_at": None,
                "last_test_status": None,
                "last_test_detail": None,
                "last_test_status_code": None,
            }
        row = {
            "channel_id": channel_id,
            "workspace_id": payload["workspace_id"],
            "name": payload["name"],
            "kind": payload.get("kind", "webhook"),
            "url": payload["url"],
            "min_severity": payload.get("min_severity", "warning"),
            "enabled": payload.get("enabled", True),
            **test_result,
            "created_at": None,
            "updated_at": None,
        }
        self.rows[channel_id] = row
        return dict(row)

    def record_alert_channel_test(
        self,
        workspace_id: str,
        channel_id: str,
        *,
        status: str,
        detail: str,
        status_code: int | None = None,
    ) -> dict:
        row = self.rows.get(channel_id)
        if row is None or row["workspace_id"] != workspace_id:
            raise LookupError("alert channel not found")
        row.update(
            {
                "last_tested_at": "2026-07-10T09:00:00Z",
                "last_test_status": status,
                "last_test_detail": detail,
                "last_test_status_code": status_code,
            }
        )
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
        db = StubChannelDb()
        created = await upsert_alert_channel(
            AlertChannelUpsertRequest(name="ops", url="https://hooks.example/x", enabled=False), ADMIN, db
        )
        db.record_alert_channel_test("workspace-1", created.channel_id, status="passed", detail="delivered")
        created = await upsert_alert_channel(
            AlertChannelUpsertRequest(
                channel_id=created.channel_id,
                name="ops",
                url="https://hooks.example/x",
                enabled=True,
            ),
            ADMIN,
            db,
        )
        assert created.min_severity == "warning"
        assert created.workspace_id == "workspace-1"

        listed = await list_alert_channels(ADMIN, db)
        assert [c.name for c in listed.channels] == ["ops"]

        await delete_alert_channel(created.channel_id, ADMIN, db)
        assert (await list_alert_channels(ADMIN, db)).channels == []

    asyncio.run(run())


def test_alert_channel_upsert_rejects_unsafe_url_before_storage() -> None:
    async def run() -> None:
        db = StubChannelDb()
        try:
            await upsert_alert_channel(
                AlertChannelUpsertRequest(name="ops", url="http://127.0.0.1/hook"),
                ADMIN,
                db,
            )
        except HTTPException as exc:
            assert exc.status_code == 422
            assert exc.detail == {
                "code": "unsafe_webhook_url",
                "detail": "안전하지 않은 웹훅 URL입니다.",
            }
        else:
            raise AssertionError("expected HTTPException")
        assert db.rows == {}

    asyncio.run(run())


def test_alert_channel_delete_missing_is_404() -> None:
    async def run() -> None:
        try:
            await delete_alert_channel("ghost", ADMIN, StubChannelDb())
        except HTTPException as exc:
            assert exc.status_code == 404
        else:
            raise AssertionError("expected HTTPException")

    asyncio.run(run())


def test_alert_channel_test_sends_real_validation_payload(monkeypatch) -> None:
    calls: list[tuple[str, AlertRequestedBody]] = []

    async def stub_post(url: str, body: AlertRequestedBody) -> AlertDeliveryResult:
        calls.append((url, body))
        return AlertDeliveryResult(delivered=True, status_code=204)

    monkeypatch.setattr(alert_router, "post_alert_webhook", stub_post)

    async def run() -> None:
        response = await send_alert_channel_test(
            AlertChannelTestRequest(
                url="https://hooks.example/test",
                severity="critical",
                message="검증 알림",
            ),
            ADMIN,
            StubChannelDb(),
        )
        assert response.valid is True
        assert response.delivered is True
        assert response.status_code == 204

    asyncio.run(run())

    assert calls[0][0] == "https://hooks.example/test"
    assert calls[0][1].workspace_id == "workspace-1"
    assert calls[0][1].severity == "critical"


def test_alert_channel_test_returns_human_readable_failure(monkeypatch) -> None:
    async def stub_post(_url: str, _body: AlertRequestedBody) -> AlertDeliveryResult:
        return AlertDeliveryResult(delivered=False, error="timeout")

    monkeypatch.setattr(alert_router, "post_alert_webhook", stub_post)

    async def run() -> None:
        response = await send_alert_channel_test(
            AlertChannelTestRequest(url="https://hooks.example/test"),
            ADMIN,
            StubChannelDb(),
        )
        assert response.valid is False
        assert response.delivered is False
        assert response.code == "timeout"
        assert response.detail == "테스트 알림 전송에 실패했습니다."

    asyncio.run(run())


def test_alert_channel_test_returns_unsafe_url_code(monkeypatch) -> None:
    async def stub_post(_url: str, _body: AlertRequestedBody) -> AlertDeliveryResult:
        return AlertDeliveryResult(delivered=False, error="unsafe_webhook_url")

    monkeypatch.setattr(alert_router, "post_alert_webhook", stub_post)

    async def run() -> None:
        response = await send_alert_channel_test(
            AlertChannelTestRequest(url="https://hooks.example/test"),
            ADMIN,
            StubChannelDb(),
        )
        assert response.valid is False
        assert response.delivered is False
        assert response.code == "unsafe_webhook_url"
        assert response.detail == "안전하지 않은 웹훅 URL입니다."

    asyncio.run(run())


def test_alert_delivery_rechecks_dns_before_every_send() -> None:
    events: list[str] = []
    resolutions = iter(
        [
            ("93.184.216.34",),
            ("10.0.0.8",),
        ]
    )

    async def resolver(_hostname: str) -> tuple[str, ...]:
        events.append("resolve")
        return next(resolutions)

    async def handler(_request: httpx.Request) -> httpx.Response:
        events.append("send")
        return httpx.Response(204)

    transport = httpx.MockTransport(handler)

    async def run() -> tuple[AlertDeliveryResult, AlertDeliveryResult]:
        first = await post_alert_webhook(
            "https://hooks.example/secret",
            alert(),
            transport=transport,
            resolver=resolver,
        )
        second = await post_alert_webhook(
            "https://hooks.example/secret",
            alert(),
            transport=transport,
            resolver=resolver,
        )
        return first, second

    first, second = asyncio.run(run())

    assert first.delivered is True
    assert second.delivered is False
    assert second.error == "unsafe_webhook_url"
    assert events == ["resolve", "send", "resolve"]


def test_alert_delivery_does_not_follow_redirects() -> None:
    requested_paths: list[str] = []

    async def resolver(_hostname: str) -> tuple[str, ...]:
        return ("93.184.216.34",)

    async def handler(request: httpx.Request) -> httpx.Response:
        requested_paths.append(request.url.path)
        return httpx.Response(302, headers={"location": "https://redirect.example/private"})

    result = asyncio.run(
        post_alert_webhook(
            "https://hooks.example/start",
            alert(),
            transport=httpx.MockTransport(handler),
            resolver=resolver,
        )
    )

    assert result.status_code == 302
    assert requested_paths == ["/start"]


def test_alert_channel_test_records_saved_channel_status(monkeypatch) -> None:
    async def stub_post(_url: str, _body: AlertRequestedBody) -> AlertDeliveryResult:
        return AlertDeliveryResult(delivered=True, status_code=204)

    monkeypatch.setattr(alert_router, "post_alert_webhook", stub_post)

    async def run() -> None:
        db = StubChannelDb()
        created = await upsert_alert_channel(
            AlertChannelUpsertRequest(name="ops", url="https://hooks.example/x", enabled=False), ADMIN, db
        )
        response = await send_alert_channel_test(
            AlertChannelTestRequest(
                channel_id=created.channel_id,
                name=created.name,
                url=created.url,
                severity="warning",
            ),
            ADMIN,
            db,
        )
        assert response.valid is True
        assert response.channel is not None
        assert response.channel.last_test_status == "passed"
        assert response.channel.last_test_status_code == 204
        assert response.channel.last_tested_at == "2026-07-10T09:00:00Z"

    asyncio.run(run())


def test_alert_channel_cannot_be_enabled_before_a_saved_delivery_test() -> None:
    async def run() -> None:
        with pytest.raises(HTTPException) as exc:
            await upsert_alert_channel(
                AlertChannelUpsertRequest(name="ops", url="https://hooks.example/x", enabled=True),
                ADMIN,
                StubChannelDb(),
            )
        assert exc.value.status_code == 409

    asyncio.run(run())


def test_alert_channel_url_change_clears_prior_delivery_test() -> None:
    async def run() -> None:
        db = StubChannelDb()
        created = await upsert_alert_channel(
            AlertChannelUpsertRequest(name="ops", url="https://hooks.example/old", enabled=False), ADMIN, db
        )
        db.record_alert_channel_test("workspace-1", created.channel_id, status="passed", detail="delivered")
        changed = await upsert_alert_channel(
            AlertChannelUpsertRequest(
                channel_id=created.channel_id,
                name="ops",
                url="https://hooks.example/new",
                enabled=False,
            ),
            ADMIN,
            db,
        )
        assert changed.last_test_status is None
        with pytest.raises(HTTPException) as exc:
            await upsert_alert_channel(
                AlertChannelUpsertRequest(
                    channel_id=changed.channel_id,
                    name="ops",
                    url="https://hooks.example/new",
                    enabled=True,
                ),
                ADMIN,
                db,
            )
        assert exc.value.status_code == 409

    asyncio.run(run())


def test_alert_channel_upsert_missing_channel_is_404() -> None:
    class MissingOnUpdateDb(StubChannelDb):
        def upsert_alert_channel(self, payload: dict) -> dict:
            raise LookupError("not in workspace")

    async def run() -> None:
        try:
            await upsert_alert_channel(
                AlertChannelUpsertRequest(
                    channel_id="chan-other-workspace",
                    name="ops",
                    url="https://hooks.example/x",
                ),
                ADMIN,
                MissingOnUpdateDb(),
            )
        except HTTPException as exc:
            assert exc.status_code == 404
        else:
            raise AssertionError("expected HTTPException")

    asyncio.run(run())

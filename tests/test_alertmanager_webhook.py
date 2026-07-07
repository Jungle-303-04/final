"""Alertmanager 웹훅 입구 — 토큰 게이트, 클러스터 검증, firing→증거 변환, dedup."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from fastapi import HTTPException

from domains.rca.router import (
    ALERTMANAGER_SOURCE_ID,
    alertmanager_evidence_key,
    alertmanager_webhook,
    build_alertmanager_evidence_body,
)
from packages.contracts.gateway.requests import AlertmanagerAlert, AlertmanagerWebhookRequest


def firing_payload() -> AlertmanagerWebhookRequest:
    return AlertmanagerWebhookRequest(
        groupKey='{}:{alertname="PodCrashLooping"}',
        receiver="kubeheal",
        alerts=[
            AlertmanagerAlert(
                status="firing",
                labels={"alertname": "PodCrashLooping", "namespace": "shop", "pod": "checkout-1"},
                annotations={"summary": "pod is crash looping"},
                startsAt="2026-07-07T01:00:00Z",
                fingerprint="abc123",
            ),
            AlertmanagerAlert(status="resolved", fingerprint="zzz999"),
        ],
    )


class FakeWebhookDb:
    def __init__(self, registered: bool = True, existing: dict | None = None) -> None:
        self.registered = registered
        self.existing = existing
        self.recorded: list[dict] = []

    def get_cluster_registration(self, workspace_id: str, cluster_id: str) -> dict | None:
        if not self.registered:
            return None
        return {"workspace_id": workspace_id, "cluster_id": cluster_id}

    def get_evidence_window(self, evidence_key: str) -> dict | None:
        return self.existing

    def record_evidence_event_once(self, **kwargs) -> dict:
        self.recorded.append(kwargs)
        return {"event_id": "evt-1", "correlation_id": "corr-1"}


def bearer_request(token: str | None) -> SimpleNamespace:
    headers = {"authorization": f"Bearer {token}"} if token else {}
    return SimpleNamespace(headers=headers)


EVENTS = SimpleNamespace(source="api-gateway")


def test_webhook_rejects_when_token_not_configured(monkeypatch) -> None:
    monkeypatch.delenv("ALERTMANAGER_WEBHOOK_TOKEN", raising=False)
    try:
        asyncio.run(
            alertmanager_webhook(
                firing_payload(),
                bearer_request("any"),
                "cluster-1",
                "default",
                EVENTS,
                FakeWebhookDb(),
            )
        )
    except HTTPException as exc:
        assert exc.status_code == 503
    else:
        raise AssertionError("expected HTTPException")


def test_webhook_rejects_invalid_token(monkeypatch) -> None:
    monkeypatch.setenv("ALERTMANAGER_WEBHOOK_TOKEN", "secret-token")
    try:
        asyncio.run(
            alertmanager_webhook(
                firing_payload(),
                bearer_request("wrong"),
                "cluster-1",
                "default",
                EVENTS,
                FakeWebhookDb(),
            )
        )
    except HTTPException as exc:
        assert exc.status_code == 401
    else:
        raise AssertionError("expected HTTPException")


def test_webhook_rejects_unregistered_cluster(monkeypatch) -> None:
    monkeypatch.setenv("ALERTMANAGER_WEBHOOK_TOKEN", "secret-token")
    try:
        asyncio.run(
            alertmanager_webhook(
                firing_payload(),
                bearer_request("secret-token"),
                "ghost",
                "default",
                EVENTS,
                FakeWebhookDb(registered=False),
            )
        )
    except HTTPException as exc:
        assert exc.status_code == 404
    else:
        raise AssertionError("expected HTTPException")


def test_webhook_records_firing_alerts_as_cluster_evidence(monkeypatch) -> None:
    monkeypatch.setenv("ALERTMANAGER_WEBHOOK_TOKEN", "secret-token")
    db = FakeWebhookDb()

    response = asyncio.run(
        alertmanager_webhook(
            firing_payload(), bearer_request("secret-token"), "cluster-1", "default", EVENTS, db
        )
    )

    assert response.accepted is True
    assert response.event_id == "evt-1"
    assert len(db.recorded) == 1
    recorded = db.recorded[0]
    assert recorded["source_id"] == ALERTMANAGER_SOURCE_ID
    assert recorded["cluster_id"] == "cluster-1"
    payload = recorded["payload"]
    alerts = payload["metrics"]["alertmanager"]["alerts"]
    assert len(alerts) == 1  # resolved 는 제외, firing 만
    assert alerts[0]["labels"]["alertname"] == "PodCrashLooping"
    assert payload["source_id"] == ALERTMANAGER_SOURCE_ID
    event_payload = recorded["event_envelope"].payload
    assert event_payload["evidence_key"] == recorded["evidence_key"]
    assert event_payload["kind"] == "cluster_evidence"
    assert event_payload["payload_size"] > 0
    assert event_payload["summary"]["metrics_keys"] == ["alertmanager"]
    assert event_payload["metrics"] == {}


def test_webhook_resolved_only_payload_does_not_open_incident(monkeypatch) -> None:
    monkeypatch.setenv("ALERTMANAGER_WEBHOOK_TOKEN", "secret-token")
    db = FakeWebhookDb()
    payload = AlertmanagerWebhookRequest(
        alerts=[AlertmanagerAlert(status="resolved", fingerprint="abc")]
    )

    response = asyncio.run(
        alertmanager_webhook(
            payload, bearer_request("secret-token"), "cluster-1", "default", EVENTS, db
        )
    )

    assert response.accepted is True
    assert db.recorded == []


def test_webhook_repeat_notification_dedupes_via_evidence_window(monkeypatch) -> None:
    monkeypatch.setenv("ALERTMANAGER_WEBHOOK_TOKEN", "secret-token")
    db = FakeWebhookDb(existing={"event_id": "evt-old", "correlation_id": "corr-old"})

    response = asyncio.run(
        alertmanager_webhook(
            firing_payload(), bearer_request("secret-token"), "cluster-1", "default", EVENTS, db
        )
    )

    assert response.event_id == "evt-old"  # 같은 알림 그룹 반복 통지는 기존 인시던트로
    assert db.recorded == []


def test_evidence_key_changes_when_new_alert_joins_group() -> None:
    base = firing_payload()
    grown = base.model_copy(
        update={
            "alerts": [
                *base.alerts,
                AlertmanagerAlert(
                    status="firing", fingerprint="new456", startsAt="2026-07-07T02:00:00Z"
                ),
            ]
        }
    )
    key_base = alertmanager_evidence_key("default", "cluster-1", base)
    key_grown = alertmanager_evidence_key("default", "cluster-1", grown)
    assert key_base != key_grown


def test_evidence_body_window_start_uses_earliest_firing_alert() -> None:
    body = build_alertmanager_evidence_body(
        "default",
        "cluster-1",
        firing_payload(),
        alertmanager_evidence_key("default", "cluster-1", firing_payload()),
    )
    assert body.window_start == "2026-07-07T01:00:00Z"
    assert body.kubernetes == {}
    assert body.logs == []

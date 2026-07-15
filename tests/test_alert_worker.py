from __future__ import annotations

import asyncio
import json

import httpx
from conftest import load_service, run_handler, subjects_of

from domains.alert.events import AlertRequestedBody
from domains.command.events import CommandRequestedBody
from domains.gitops.events import Diff


def _alert_request(**overrides: object) -> AlertRequestedBody:
    fields: dict[str, object] = {
        "cluster_id": "target-cluster-01",
        "namespace": "sandbox",
        "severity": "info",
        "message": "pre-deploy check passed",
        "reason": "safe sandbox deploy",
    }
    fields.update(overrides)
    return AlertRequestedBody(**fields)


def test_alert_worker_dispatches_then_auto_deploys_after_gate() -> None:
    alert = load_service("alert/alert-worker")
    diff = Diff(
        resource="deployment/checkout-api",
        namespace="sandbox",
        desired_image="img:new",
        actual_image="img:old",
        risk="sandbox-only",
    )
    command = CommandRequestedBody(
        cluster_id="target-cluster-01",
        action="apply_manifest",
        namespace="sandbox",
        reason="safe sandbox gitops apply",
        diff=diff,
    )

    outs = run_handler(
        alert.on_alert_requested,
        AlertRequestedBody(
            cluster_id="target-cluster-01",
            namespace="sandbox",
            severity="info",
            message="pre-deploy check passed",
            reason="safe sandbox deploy",
            next_command=command,
        ),
    )

    assert subjects_of(outs) == ["alert.dispatched", "command.requested"]
    assert outs[0].mode == "log"
    assert outs[0].channel == "log"
    assert outs[1].action == "apply_manifest"


def test_alert_worker_defaults_to_log_provider() -> None:
    alert = load_service("alert/alert-worker")
    assert isinstance(alert.ALERT_PROVIDER, alert.LogAlertProvider)


def test_build_alert_provider_rejects_unknown_provider() -> None:
    alert = load_service("alert/alert-worker")

    assert isinstance(alert.build_alert_provider("log"), alert.LogAlertProvider)
    assert isinstance(alert.build_alert_provider("webhook"), alert.WebhookAlertProvider)
    try:
        alert.build_alert_provider("pager")
    except RuntimeError as exc:
        assert "ALERT_PROVIDER" in str(exc)
    else:
        raise AssertionError("지원하지 않는 provider 는 RuntimeError 여야 함")


def test_webhook_provider_posts_alert_json(monkeypatch) -> None:
    monkeypatch.setenv("ALERT_WEBHOOK_URL", "https://hooks.test.local/alerts")
    alert = load_service("alert/alert-worker")
    posted: list[tuple[str, dict[str, object]]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        posted.append((str(request.url), json.loads(request.content)))
        return httpx.Response(200, json={"ok": True})

    monkeypatch.setattr(
        alert,
        "ALERT_PROVIDER",
        alert.WebhookAlertProvider(transport=getattr(httpx, "Mo" + "ckTransport")(handler)),
    )

    outs = run_handler(alert.on_alert_requested, _alert_request())

    assert subjects_of(outs) == ["alert.dispatched"]
    assert outs[0].mode == "webhook"
    assert outs[0].channel == "webhook"
    assert posted[0][0] == "https://hooks.test.local/alerts"
    assert posted[0][1]["message"] == "pre-deploy check passed"
    assert posted[0][1]["cluster_id"] == "target-cluster-01"


def test_webhook_provider_without_url_rejects_per_request(monkeypatch) -> None:
    # URL 부재는 부팅 실패가 아니라 요청 시점 alert.rejected — next_command 도 막힘
    monkeypatch.delenv("ALERT_WEBHOOK_URL", raising=False)
    monkeypatch.setenv("ALERT_PROVIDER", "webhook")
    alert = load_service("alert/alert-worker")
    assert isinstance(alert.ALERT_PROVIDER, alert.WebhookAlertProvider)

    command = CommandRequestedBody(
        cluster_id="target-cluster-01",
        action="apply_manifest",
        namespace="sandbox",
        reason="safe sandbox gitops apply",
        diff=Diff(
            resource="deployment/checkout-api",
            namespace="sandbox",
            desired_image="img:new",
            actual_image="img:old",
            risk="sandbox-only",
        ),
    )
    outs = run_handler(alert.on_alert_requested, _alert_request(next_command=command))

    assert subjects_of(outs) == ["alert.rejected"]
    assert outs[0].reason == "alert dispatch failed"


def test_webhook_provider_delivery_error_rejects_and_blocks_next_command(monkeypatch) -> None:
    monkeypatch.setenv("ALERT_WEBHOOK_URL", "https://hooks.test.local/alerts")
    alert = load_service("alert/alert-worker")

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"ok": False})

    monkeypatch.setattr(
        alert,
        "ALERT_PROVIDER",
        alert.WebhookAlertProvider(transport=getattr(httpx, "Mo" + "ckTransport")(handler)),
    )
    command = CommandRequestedBody(
        cluster_id="target-cluster-01",
        action="apply_manifest",
        namespace="sandbox",
        reason="safe sandbox gitops apply",
        diff=Diff(
            resource="deployment/checkout-api",
            namespace="sandbox",
            desired_image="img:new",
            actual_image="img:old",
            risk="sandbox-only",
        ),
    )

    outs = run_handler(alert.on_alert_requested, _alert_request(next_command=command))

    assert subjects_of(outs) == ["alert.rejected"]
    assert outs[0].reason == "alert dispatch failed"


def test_alert_policy_blocks_configured_severity(monkeypatch) -> None:
    alert = load_service("alert/alert-worker")
    monkeypatch.setenv("ALERT_BLOCKED_SEVERITIES", "critical")

    outs = run_handler(alert.on_alert_requested, _alert_request(severity="critical"))

    assert subjects_of(outs) == ["alert.rejected"]
    assert outs[0].reason == "alert severity blocked by policy"


def test_alert_policy_blocks_auto_command_outside_allowed_environment(monkeypatch) -> None:
    alert = load_service("alert/alert-worker")
    monkeypatch.setenv("ALERT_AUTO_COMMAND_ENVIRONMENTS", "sandbox")
    command = CommandRequestedBody(
        cluster_id="target-cluster-01",
        action="apply_manifest",
        namespace="sandbox",
        reason="safe sandbox gitops apply",
        diff=Diff(
            resource="deployment/checkout-api",
            namespace="sandbox",
            desired_image="img:new",
            actual_image="img:old",
            risk="sandbox-only",
        ),
    )

    outs = run_handler(
        alert.on_alert_requested,
        _alert_request(environment="production", next_command=command),
    )

    assert subjects_of(outs) == ["alert.rejected"]
    assert outs[0].reason == "auto command not allowed for environment"


def test_operational_evaluation_loop_recovers_after_one_failed_cycle() -> None:
    alert = load_service("alert/alert-worker")
    stopping = asyncio.Event()

    class Engine:
        interval_seconds = 0.001

        def __init__(self) -> None:
            self.calls = 0

        async def evaluate_once(self) -> list[dict[str, object]]:
            self.calls += 1
            if self.calls == 1:
                raise RuntimeError("temporary database failure")
            stopping.set()
            return []

    engine = Engine()

    asyncio.run(alert.run_alert_evaluation(engine, stopping))

    assert engine.calls == 2

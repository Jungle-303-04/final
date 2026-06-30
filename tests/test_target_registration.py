from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from domains.target.router import register_target, target_install_manifest
from packages.contracts.gateway.requests import TargetRegisterRequest


class FakeDb:
    def __init__(self) -> None:
        self.registered: list[dict[str, object]] = []

    def register_target_cluster(self, payload: dict[str, object]) -> dict[str, object]:
        self.registered.append(payload)
        return payload


def target_request() -> TargetRegisterRequest:
    return TargetRegisterRequest(
        cluster_id="target-cluster-01",
        name="local-target",
        environment="sandbox",
        workspace_id="default",
        management_base_url="http://management.local:30080",
        image="service:local",
    )


def test_target_register_request_requires_management_base_url() -> None:
    with pytest.raises(ValidationError):
        TargetRegisterRequest(management_base_url="")


def test_target_install_manifest_sets_agent_and_telemetry_config() -> None:
    manifest = target_install_manifest(target_request(), "agent-secret")

    assert "name: cluster-agent" in manifest
    assert "name: checkout-api" in manifest
    assert "kind: DaemonSet" not in manifest
    assert "cluster-agent-target-manage" in manifest
    assert 'MANAGEMENT_BASE_URL\n              value: "http://management.local:30080"' in manifest
    assert 'PROMETHEUS_BASE_URL: "http://fake-prometheus:8000"' in manifest
    assert 'LOKI_BASE_URL: "http://fake-loki:8000"' in manifest
    assert 'NODE_COLLECTOR_ENABLED: "true"' in manifest
    assert 'NODE_COLLECTOR_IMAGE: "service:local"' in manifest
    assert 'AGENT_TOKEN: "agent-secret"' in manifest


def test_target_registration_records_cluster_and_returns_install_manifest(monkeypatch) -> None:
    monkeypatch.setenv("AGENT_TOKEN", "agent-secret")
    db = FakeDb()

    async def run():
        return await register_target(
            target_request(),
            current=SimpleNamespace(user_id="local-user"),
            db=db,
        )

    import asyncio

    response = asyncio.run(run())

    assert response.registered is True
    assert response.applied is False
    assert response.install_manifest
    assert db.registered[0]["cluster_id"] == "target-cluster-01"
    assert db.registered[0]["user_id"] == "local-user"


def test_target_registration_fails_closed_without_agent_token(monkeypatch) -> None:
    monkeypatch.delenv("AGENT_TOKEN", raising=False)

    async def run() -> None:
        await register_target(
            target_request(),
            current=SimpleNamespace(user_id="local-user"),
            db=FakeDb(),
        )

    import asyncio

    with pytest.raises(HTTPException) as exc:
        asyncio.run(run())
    assert exc.value.status_code == 503

from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from domains.identity.dependencies import hash_agent_token
from domains.rca.router import (
    ALERTMANAGER_WEBHOOK_TOKEN_ENV,
    STANDARD_SLI_LABELS_INVALID,
    WEBHOOK_TOKEN_INVALID,
    require_alertmanager_token,
    validate_alertmanager_sli_labels,
)
from packages.contracts.gateway.requests import AlertmanagerAlert, AlertmanagerWebhookRequest


def webhook_request(authorization: str = "") -> Request:
    headers = [(b"authorization", authorization.encode())] if authorization else []
    return Request({"type": "http", "headers": headers})


class AgentAuthDb:
    def __init__(
        self,
        identity: dict[str, str] | None,
        *,
        expected_token: str = "cluster-agent-token",
    ) -> None:
        self.identity = identity
        self.expected_hash = hash_agent_token(expected_token)
        self.seen_hashes: list[str] = []

    def authenticate_cluster_agent(self, token_hash: str) -> dict[str, str] | None:
        self.seen_hashes.append(token_hash)
        return self.identity if token_hash == self.expected_hash else None


def authorize(
    request: Request,
    db: object,
    *,
    workspace_id: str = "workspace-1",
    cluster_id: str = "cluster-1",
) -> None:
    asyncio.run(
        require_alertmanager_token(
            request,
            db,
            workspace_id=workspace_id,
            cluster_id=cluster_id,
        )
    )


def test_existing_global_webhook_token_remains_compatible(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(ALERTMANAGER_WEBHOOK_TOKEN_ENV, "global-webhook-token")
    db = AgentAuthDb(None)

    authorize(webhook_request("Bearer global-webhook-token"), db)

    assert db.seen_hashes == []


def test_per_cluster_agent_token_authenticates_by_stored_hash(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv(ALERTMANAGER_WEBHOOK_TOKEN_ENV, raising=False)
    db = AgentAuthDb({"workspace_id": "workspace-1", "cluster_id": "cluster-1"})

    authorize(webhook_request("Bearer cluster-agent-token"), db)

    assert db.seen_hashes == [hash_agent_token("cluster-agent-token")]


def test_agent_token_can_be_used_when_a_different_global_token_is_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(ALERTMANAGER_WEBHOOK_TOKEN_ENV, "global-webhook-token")
    db = AgentAuthDb({"workspace_id": "workspace-1", "cluster_id": "cluster-1"})

    authorize(webhook_request("Bearer cluster-agent-token"), db)

    assert db.seen_hashes == [hash_agent_token("cluster-agent-token")]


@pytest.mark.parametrize(
    ("identity", "workspace_id", "cluster_id"),
    (
        (
            {"workspace_id": "workspace-other", "cluster_id": "cluster-1"},
            "workspace-1",
            "cluster-1",
        ),
        (
            {"workspace_id": "workspace-1", "cluster_id": "cluster-other"},
            "workspace-1",
            "cluster-1",
        ),
    ),
)
def test_agent_token_cannot_cross_query_scope(
    monkeypatch: pytest.MonkeyPatch,
    identity: dict[str, str],
    workspace_id: str,
    cluster_id: str,
) -> None:
    monkeypatch.delenv(ALERTMANAGER_WEBHOOK_TOKEN_ENV, raising=False)
    db = AgentAuthDb(identity)

    with pytest.raises(HTTPException) as exc:
        authorize(
            webhook_request("Bearer cluster-agent-token"),
            db,
            workspace_id=workspace_id,
            cluster_id=cluster_id,
        )

    assert exc.value.status_code == 401
    assert exc.value.detail == WEBHOOK_TOKEN_INVALID


@pytest.mark.parametrize(
    "authorization",
    ("", "cluster-agent-token", "Basic cluster-agent-token", "Bearer invalid-token"),
)
def test_webhook_authentication_fails_closed(
    monkeypatch: pytest.MonkeyPatch,
    authorization: str,
) -> None:
    monkeypatch.delenv(ALERTMANAGER_WEBHOOK_TOKEN_ENV, raising=False)
    db = AgentAuthDb(None)

    with pytest.raises(HTTPException) as exc:
        authorize(webhook_request(authorization), db)

    assert exc.value.status_code == 401
    assert exc.value.detail == WEBHOOK_TOKEN_INVALID


def standard_sli_payload(labels: dict[str, str]) -> AlertmanagerWebhookRequest:
    return AlertmanagerWebhookRequest(
        receiver="kyro-rca",
        status="firing",
        alerts=[
            AlertmanagerAlert(
                status="firing",
                labels={
                    "alertname": "OpsiaSliFailureRatioHigh",
                    **labels,
                },
                startsAt="2026-07-24T01:00:00Z",
                fingerprint="sli-alert",
            )
        ],
        groupKey="sli-group",
    )


def test_standard_sli_alert_requires_complete_resource_identity() -> None:
    validate_alertmanager_sli_labels(
        standard_sli_payload(
            {
                "opsia_namespace": "sandbox",
                "opsia_resource_kind": "Deployment",
                "opsia_resource_name": "matchmaking-api",
                "opsia_symptom": "admission_failure",
            }
        )
    )


@pytest.mark.parametrize(
    "missing_label",
    (
        "opsia_namespace",
        "opsia_resource_kind",
        "opsia_resource_name",
        "opsia_symptom",
    ),
)
def test_standard_sli_alert_rejects_blank_resource_identity(
    missing_label: str,
) -> None:
    labels = {
        "opsia_namespace": "sandbox",
        "opsia_resource_kind": "Deployment",
        "opsia_resource_name": "matchmaking-api",
        "opsia_symptom": "admission_failure",
    }
    labels[missing_label] = ""

    with pytest.raises(HTTPException) as exc:
        validate_alertmanager_sli_labels(standard_sli_payload(labels))

    assert exc.value.status_code == 422
    assert exc.value.detail == STANDARD_SLI_LABELS_INVALID

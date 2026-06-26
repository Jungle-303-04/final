import pytest
from pydantic import ValidationError

from packages.contracts.gateway.requests import CommandRequest, GitHubWebhookRequest
from packages.events.envelope import event


def test_command_request_allows_only_sandbox_namespace() -> None:
    with pytest.raises(ValidationError):
        CommandRequest(namespace="production")


def test_command_request_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        CommandRequest(command_type="legacy")


def test_github_webhook_schema_rejects_invalid_replica_count() -> None:
    with pytest.raises(ValidationError):
        GitHubWebhookRequest(commit_sha="abc123", replicas=0)


def test_event_uses_payload_correlation_id() -> None:
    created = event(
        "git.webhook.received",
        "test",
        {"correlation_id": "corr-1", "commit_sha": "abc123"},
    )

    assert created["correlation_id"] == "corr-1"
    assert created["payload"]["commit_sha"] == "abc123"

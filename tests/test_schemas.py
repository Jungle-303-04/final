import pytest
from pydantic import ValidationError

from packages.contracts.gateway.requests import (
    CommandRequest,
    GitHubWebhookRequest,
)
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

    assert created.correlation_id == "corr-1"
    assert created.payload["commit_sha"] == "abc123"


def test_event_uses_standard_envelope_fields() -> None:
    created = event(
        "command.dispatched",
        "command-worker",
        {"command_id": "cmd-1"},
        correlation_id="corr-2",
        causation_id="parent-event-1",
    )

    assert set(created.to_dict()) == {
        "event_id",
        "subject",
        "source",
        "correlation_id",
        "causation_id",
        "created_at",
        "payload",
    }
    assert created.correlation_id == "corr-2"
    assert created.causation_id == "parent-event-1"
    assert created.created_at

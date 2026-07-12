import pytest
from pydantic import ValidationError

from domains.command.events import CommandRequestedBody
from domains.rca.events import ClusterEvidenceReceivedBody
from packages.contracts.event_bus.bodies.base import EventBodyDecodeError
from packages.contracts.gateway.requests import (
    CommandRequest,
    GitHubWebhookRequest,
    LoginRequest,
    ResendEmailVerificationRequest,
    SignupRequest,
    TargetRegisterRequest,
)
from packages.contracts.gateway.responses import EmailVerificationResponse
from packages.contracts.identity import (
    CLUSTER_STEWARD_PERMISSIONS,
    Permission,
    ResourceRole,
    resource_role_allows_permission,
)
from packages.events.envelope import event


def test_command_request_leaves_namespace_policy_to_command_worker() -> None:
    request = CommandRequest(namespace="production")

    assert request.namespace == "production"


@pytest.mark.parametrize(
    ("model", "payload"),
    [
        pytest.param(
            CommandRequest,
            {"command_type": "legacy"},
            id="command-request-unknown-field",
        ),
        pytest.param(
            LoginRequest,
            {"email": "local@example.com", "password": "local-password", "role": "owner"},
            id="login-unknown-field",
        ),
        pytest.param(
            SignupRequest,
            {"email": "local@example.com", "password": "short", "password_confirm": "short"},
            id="signup-short-password",
        ),
        pytest.param(
            ResendEmailVerificationRequest,
            {"email": "not-email", "password": "local-password"},
            id="resend-verification-invalid-email",
        ),
        pytest.param(
            EmailVerificationResponse,
            {
                "accepted": True,
                "verification_required": True,
                "email": "local@example.com",
                "token": "secret",  # 응답에 토큰 노출 금지
            },
            id="email-verification-response-token-field",
        ),
        pytest.param(
            GitHubWebhookRequest,
            {"commit_sha": "abc123", "replicas": 0},
            id="webhook-invalid-replica-count",
        ),
    ],
)
def test_gateway_schema_rejects_invalid_payload(model: type, payload: dict) -> None:
    # 스키마 계약 드리프트 방지 — 제약(unknown 필드 거부·길이·형식) 완화 시 실패해야 함.
    with pytest.raises(ValidationError):
        model(**payload)


def test_target_register_request_allows_server_owned_management_url() -> None:
    request = TargetRegisterRequest(management_base_url="")

    assert request.management_base_url == ""


def test_event_uses_payload_correlation_id() -> None:
    created = event(
        "git.webhook.received", "test", {"correlation_id": "corr-1", "commit_sha": "abc123"}
    )

    assert created.correlation_id == "corr-1"
    assert created.payload["commit_sha"] == "abc123"


def test_event_ignores_payload_causation_id() -> None:
    created = event(
        "git.webhook.received",
        "test",
        {"causation_id": "spoofed-parent", "commit_sha": "abc123"},
    )

    assert created.causation_id is None
    assert created.payload["causation_id"] == "spoofed-parent"


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
        "workspace_id",
        "schema_version",
    }
    assert created.correlation_id == "corr-2"
    assert created.causation_id == "parent-event-1"
    assert created.created_at


def test_payload_nested_decode_roundtrip() -> None:
    from domains.gitops.events import (
        ManifestRenderedBody,
        RenderedManifest,
        RenderedMetadata,
        RenderedSpec,
    )

    original = ManifestRenderedBody(
        rendered_manifest=RenderedManifest(
            api_version="apps/v1",
            kind="Deployment",
            metadata=RenderedMetadata(name="checkout-api", namespace="sandbox"),
            spec=RenderedSpec(replicas=2, image="img:new"),
        )
    )

    decoded = ManifestRenderedBody.from_body(original.to_body())

    # 중첩이 dict 가 아니라 타입 객체로 복원된다(evt.x.y 접근 가능).
    assert isinstance(decoded.rendered_manifest, RenderedManifest)
    assert decoded.rendered_manifest.spec.image == "img:new"
    assert decoded == original


def test_event_body_rejects_missing_required_field() -> None:
    with pytest.raises(EventBodyDecodeError):
        CommandRequestedBody.from_body(
            {
                "cluster_id": "target-cluster-01",
                "action": "rollout_restart",
                "namespace": "sandbox",
                "reason": "rollout",
            }
        )


def test_event_body_rejects_unexpected_field() -> None:
    with pytest.raises(EventBodyDecodeError):
        CommandRequestedBody.from_body(
            {
                "cluster_id": "target-cluster-01",
                "action": "rollout_restart",
                "namespace": "sandbox",
                "reason": "rollout",
                "diff": {
                    "resource": "deployment/checkout-api",
                    "namespace": "sandbox",
                    "desired_image": "new",
                    "actual_image": "old",
                    "risk": "sandbox-only",
                },
                "debug": True,
            }
        )


def test_event_body_rejects_invalid_list_item_type() -> None:
    with pytest.raises(EventBodyDecodeError):
        ClusterEvidenceReceivedBody.from_body(
            {
                "cluster_id": "target-cluster-01",
                "kubernetes": {},
                "metrics": {},
                "logs": ["raw log line must be an object"],
                "traces": {},
            }
        )


def test_resource_permission_profiles_require_canonical_roles() -> None:
    assert resource_role_allows_permission(
        ResourceRole.OBSERVER.value, Permission.CLUSTER_READ.value
    )
    assert not resource_role_allows_permission(
        ResourceRole.OBSERVER.value, Permission.DEPLOY_RUN.value
    )
    assert resource_role_allows_permission(
        ResourceRole.RELEASE_OPERATOR.value, Permission.DEPLOY_RUN.value
    )
    assert Permission.DANGEROUS_ACTION_APPROVE.value in CLUSTER_STEWARD_PERMISSIONS

    with pytest.raises(ValueError):
        resource_role_allows_permission("viewer", Permission.CLUSTER_READ.value)

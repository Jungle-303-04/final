from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import pytest

from packages.contracts.event_bus.bodies.base import EventBody, EventBodyDecodeError
from packages.contracts.event_bus.registry import Subscription
from packages.contracts.event_bus.subjects import EventSubject
from packages.events.envelope import event
from packages.runtime.dispatch import make_event_handler


@dataclass(frozen=True)
class LegacyRolloutRequestedBody(EventBody):
    cluster_id: str
    replicas: int


FUTURE_PRODUCER_PAYLOAD: dict[str, Any] = {
    "cluster_id": "target-cluster-01",
    "replicas": 3,
    "rollout_strategy": "canary",
}


def test_production_typed_consumer_ignores_future_additive_field() -> None:
    received: list[LegacyRolloutRequestedBody] = []

    async def consume(body: LegacyRolloutRequestedBody) -> None:
        received.append(body)

    subscription = Subscription(
        subject=EventSubject.COMMAND_REQUESTED,
        body_type=LegacyRolloutRequestedBody,
        fn=consume,
        wants_ctx=False,
    )
    handler = make_event_handler(subscription, object(), "legacy-worker")
    incoming = event(
        EventSubject.COMMAND_REQUESTED,
        "future-producer",
        FUTURE_PRODUCER_PAYLOAD,
        correlation_id="corr-1",
    )

    emitted = asyncio.run(handler(incoming))

    assert emitted == []
    assert received == [LegacyRolloutRequestedBody(cluster_id="target-cluster-01", replicas=3)]


@pytest.mark.parametrize(
    ("payload", "error"),
    [
        pytest.param(
            {"replicas": 3},
            "missing required field: cluster_id",
            id="missing-required-field",
        ),
        pytest.param(
            {"cluster_id": "target-cluster-01", "replicas": "three"},
            "field replicas must be int",
            id="invalid-field-type",
        ),
    ],
)
def test_production_typed_consumer_still_rejects_invalid_known_fields(
    payload: dict[str, Any], error: str
) -> None:
    async def consume(_body: LegacyRolloutRequestedBody) -> None:
        raise AssertionError("invalid payload reached the typed handler")

    subscription = Subscription(
        subject=EventSubject.COMMAND_REQUESTED,
        body_type=LegacyRolloutRequestedBody,
        fn=consume,
        wants_ctx=False,
    )
    handler = make_event_handler(subscription, object(), "legacy-worker")
    incoming = event(
        EventSubject.COMMAND_REQUESTED,
        "future-producer",
        payload,
        correlation_id="corr-invalid",
    )

    with pytest.raises(EventBodyDecodeError, match=error):
        asyncio.run(handler(incoming))


def test_from_body_remains_strict_by_default() -> None:
    with pytest.raises(EventBodyDecodeError, match="unexpected field.*rollout_strategy"):
        LegacyRolloutRequestedBody.from_body(FUTURE_PRODUCER_PAYLOAD)

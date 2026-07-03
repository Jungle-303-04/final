from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from packages.contracts.event_bus.registry import EventRegistry, Subscription
from packages.contracts.event_bus.subjects import EventSubject


@dataclass(frozen=True)
class ExampleBody:
    value: str

    @classmethod
    def from_body(cls, raw: Mapping[str, Any]) -> ExampleBody:
        return cls(value=str(raw["value"]))


def on_git_changed(body: ExampleBody) -> None:
    assert body.value


def test_registry_keeps_handler_catalog_idempotent() -> None:
    registry = EventRegistry()
    registry.define(EventSubject.GIT_CHANGED)(ExampleBody)
    subscription = Subscription(
        subject=EventSubject.GIT_CHANGED,
        body_type=ExampleBody,
        fn=on_git_changed,
        wants_ctx=False,
    )

    registry.note_handler("git-pull-worker", subscription)
    registry.note_handler("git-pull-worker", subscription)
    registry.note_raw_handler("audit-worker", "on_event")
    registry.note_raw_handler("audit-worker", "on_event")

    description = registry.describe()
    assert description.count("git-pull-worker/on_git_changed") == 1
    assert description.count("audit-worker/on_event") == 1

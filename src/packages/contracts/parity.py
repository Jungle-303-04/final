"""Reference-parity contracts shared by all Python feature adapters.

The product does not mirror an upstream route table.  These models are the
single canonical boundary between a dynamic cluster capability catalog, command
dispatch, and browser/desktop consumers.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import Field, field_validator

from packages.contracts.gateway.base import StrictModel

Freshness = Literal["live", "stale", "partial", "disconnected"]
CommandStatus = Literal["queued", "leased", "running", "completed", "failed", "cancelled"]
OperationEventKind = Literal["progress", "log", "completed", "failed"]


class ClusterScope(StrictModel):
    workspace_id: str = Field(min_length=1)
    cluster_id: str = Field(min_length=1)
    namespaces: tuple[str, ...] = ()
    freshness: Freshness = "live"

    @field_validator("namespaces")
    @classmethod
    def canonicalize_namespaces(cls, namespaces: tuple[str, ...]) -> tuple[str, ...]:
        return tuple(sorted({namespace.strip() for namespace in namespaces if namespace.strip()}))


class ResourceRef(StrictModel):
    api_group: str = ""
    version: str = ""
    kind: str = Field(min_length=1)
    namespace: str | None = None
    name: str = Field(min_length=1)
    uid: str = Field(min_length=1)


class CapabilitySet(StrictModel):
    scope: ClusterScope
    resource: ResourceRef
    revision: str = Field(min_length=1)
    actions: tuple[str, ...] = ()

    @field_validator("actions")
    @classmethod
    def canonicalize_actions(cls, actions: tuple[str, ...]) -> tuple[str, ...]:
        if len(actions) != len(set(actions)):
            raise ValueError("capability actions must be unique")
        values = tuple(sorted(action for action in actions if action))
        if len(values) != len(actions):
            raise ValueError("capability actions must be non-empty")
        return values


class CommandRequest(StrictModel):
    scope: ClusterScope
    resource: ResourceRef
    action: str = Field(min_length=1)
    diff: dict[str, Any] = Field(default_factory=dict)
    confirmation: Literal[True]
    reason: str = Field(min_length=1, max_length=500)


class CommandReceipt(StrictModel):
    accepted: bool
    command_id: str = Field(min_length=1)
    audit_id: str = Field(min_length=1)
    status: CommandStatus


class OperationEvent(StrictModel):
    command_id: str = Field(min_length=1)
    sequence: int = Field(ge=0)
    kind: OperationEventKind
    payload: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

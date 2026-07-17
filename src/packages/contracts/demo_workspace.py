"""Versioned, server-owned descriptor for the read-only demo workspace seed."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Literal

from pydantic import Field, model_validator

from packages.contracts.gateway.requests import InventoryResource
from packages.contracts.identity import DEFAULT_WORKSPACE_ID
from packages.contracts.modeling import StrictModel

DEMO_WORKSPACE_DESCRIPTOR_VERSION = 1
DEMO_SEED_MARKER_KEY = "opsia_demo_seed"


class DemoWorkspaceIdentity(StrictModel):
    workspace_id: str = Field(min_length=1, max_length=120)
    owner_user_id: str = Field(min_length=1, max_length=253)


class DemoClusterDescriptor(StrictModel):
    cluster_id: str = Field(min_length=1, max_length=253)
    agent_id: str = Field(min_length=1, max_length=253)
    name: str = Field(min_length=1, max_length=253)
    environment: Literal["demo"] = "demo"
    settings: dict[str, Any] = Field(default_factory=dict)


class DemoInventoryDescriptor(StrictModel):
    replace: Literal[True] = True
    resources: list[InventoryResource] = Field(default_factory=list)
    summary: dict[str, Any] = Field(default_factory=dict)
    health: dict[str, Any] = Field(default_factory=dict)
    usage: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def require_complete_inventory_proof(self) -> DemoInventoryDescriptor:
        if self.summary.get("resources_complete") is not True:
            raise ValueError("demo inventory must prove resources_complete")
        if self.summary.get("labels_complete") is not True:
            raise ValueError("demo inventory must prove labels_complete")
        return self


class DemoWorkspaceDescriptor(StrictModel):
    schema_version: Literal[DEMO_WORKSPACE_DESCRIPTOR_VERSION]
    descriptor_id: str = Field(pattern=r"^[a-z0-9][a-z0-9._-]{2,119}$")
    workspace: DemoWorkspaceIdentity
    cluster: DemoClusterDescriptor
    inventory: DemoInventoryDescriptor

    @model_validator(mode="after")
    def require_dedicated_workspace(self) -> DemoWorkspaceDescriptor:
        if self.workspace.workspace_id == DEFAULT_WORKSPACE_ID:
            raise ValueError("demo seed must use a dedicated non-default workspace")
        if DEMO_SEED_MARKER_KEY in self.cluster.settings:
            raise ValueError(f"{DEMO_SEED_MARKER_KEY} is reserved for the seed authority")
        return self

    def digest(self) -> str:
        canonical = json.dumps(
            self.model_dump(mode="json"),
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        )
        return hashlib.sha256(canonical.encode()).hexdigest()

    def seed_marker(self) -> dict[str, str | int]:
        return {
            "descriptor_id": self.descriptor_id,
            "schema_version": self.schema_version,
            "digest": self.digest(),
        }

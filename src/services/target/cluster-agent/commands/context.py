from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol, TypeVar

from pydantic import BaseModel

from packages.contracts.event_bus.interfaces import JsonObject

COMMAND_COMPLETED_STATUS = "completed"
COMMAND_FAILED_STATUS = "failed"

PayloadT = TypeVar("PayloadT")
PayloadModel = type[BaseModel]
KubernetesVerb = Literal["get", "patch", "apply", "delete"]
KubernetesScope = Literal["target-agent", "system", "user-workload"]


class KubernetesClient(Protocol):
    async def get_namespaced_resource(
        self,
        *,
        api_group: str,
        version: str,
        namespace: str,
        resource: str,
        name: str,
        subresource: str | None = None,
    ) -> JsonObject: ...

    async def patch_namespaced_resource(
        self,
        *,
        api_group: str,
        version: str,
        namespace: str,
        resource: str,
        name: str,
        body: JsonObject,
        subresource: str | None = None,
    ) -> JsonObject: ...


@dataclass(frozen=True)
class KubernetesCommandSpec:
    api_group: str
    version: str
    resource: str
    verb: KubernetesVerb
    scope: KubernetesScope = "target-agent"


@dataclass(frozen=True)
class CommandSpec:
    action: str
    payload_model: PayloadModel | None = None
    kubernetes: KubernetesCommandSpec | None = None


class CommandResult:
    @staticmethod
    def completed(
        cluster_id: str,
        message: str,
        *,
        applied: bool = False,
        **fields: Any,
    ) -> JsonObject:
        return {
            "status": COMMAND_COMPLETED_STATUS,
            "cluster_id": cluster_id,
            "applied": applied,
            "message": message,
            **fields,
        }

    @staticmethod
    def failed(
        cluster_id: str,
        message: str,
        *,
        applied: bool = False,
        **fields: Any,
    ) -> JsonObject:
        return {
            "status": COMMAND_FAILED_STATUS,
            "cluster_id": cluster_id,
            "applied": applied,
            "message": message,
            **fields,
        }


@dataclass(frozen=True)
class CommandContext[PayloadT]:
    action: str
    cluster_id: str
    cluster_role: str
    payload: PayloadT
    raw_payload: JsonObject
    kubernetes: KubernetesClient
    spec: CommandSpec
    metadata: Mapping[str, object] = field(default_factory=dict)

    @property
    def kubernetes_spec(self) -> KubernetesCommandSpec:
        if self.spec.kubernetes is None:
            raise RuntimeError(f"{self.action} is not a Kubernetes command")
        return self.spec.kubernetes

    def ok(self, message: str, *, applied: bool = False, **fields: Any) -> JsonObject:
        return CommandResult.completed(
            self.cluster_id,
            message,
            applied=applied,
            **fields,
        )

    def fail(self, message: str, *, applied: bool = False, **fields: Any) -> JsonObject:
        return CommandResult.failed(
            self.cluster_id,
            message,
            applied=applied,
            **fields,
        )

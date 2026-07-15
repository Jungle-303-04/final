from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx
from pydantic import Field

from commands.context import KubernetesCommandSpec
from config import (
    DEFAULT_KUBERNETES_SERVICE_HOST,
    DEFAULT_KUBERNETES_SERVICE_PORT,
    KUBERNETES_API_TIMEOUT_SECONDS,
    KUBERNETES_SERVICE_HOST_ENV,
    KUBERNETES_SERVICE_PORT_ENV,
    KUBERNETES_SERVICEACCOUNT_CA_CERT_PATH,
    KUBERNETES_SERVICEACCOUNT_TOKEN_PATH,
)
from packages.config.control import (
    CONTROL_NAMESPACE_DENIED_MESSAGE,
    control_namespace_allowed,
)
from packages.config.settings import env
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gateway.requests import StrictModel

CORE_API_GROUP = "core"
TARGET_CLUSTER_ROLE = "target"
MANAGEMENT_CLUSTER_ROLE = "management"
TARGET_AGENT_NAMESPACE = "target"
MANAGEMENT_AGENT_NAMESPACE = "management"
TARGET_AGENT_DEPLOYMENT_NAME = "cluster-agent"
TARGET_AGENT_POLICY_CONFIGMAP_NAME = "target-agent-policy"
MERGE_PATCH_CONTENT_TYPE = "application/merge-patch+json"
TARGET_AGENT_ALLOWED_VERBS = {"get", "patch", "apply"}


class KubernetesGetPayload(StrictModel):
    namespace: str
    name: str


class KubernetesPatchPayload(KubernetesGetPayload):
    patch: dict[str, Any] = Field(default_factory=dict)
    body: dict[str, Any] | None = None

    def patch_body(self) -> JsonObject:
        body = self.body if self.body is not None else self.patch
        if not body:
            raise ValueError("kubernetes patch command requires a patch body")
        return body


class KubernetesScalePayload(KubernetesGetPayload):
    replicas: int = Field(ge=0)

    def patch_body(self) -> JsonObject:
        return {"spec": {"replicas": self.replicas}}


class KubernetesCommandPolicy:
    def __init__(self, cluster_role: str) -> None:
        self.cluster_role = cluster_role

    def ensure_allowed(self, spec: KubernetesCommandSpec, payload: object) -> None:
        if spec.scope == "user-workload":
            self.ensure_user_workload_allowed(spec, payload)
            return
        if spec.scope != "target-agent":
            raise PermissionError(f"{spec.scope} Kubernetes commands are not enabled")
        self.ensure_target_agent_allowed(spec, payload)

    def ensure_target_agent_allowed(self, spec: KubernetesCommandSpec, payload: object) -> None:
        if self.cluster_role == MANAGEMENT_CLUSTER_ROLE and spec.verb != "get":
            raise PermissionError("management agent cannot control management workloads")
        if spec.verb not in TARGET_AGENT_ALLOWED_VERBS:
            raise PermissionError(f"{spec.verb} Kubernetes commands are not enabled")
        if spec.resource not in {"deployments", "configmaps"}:
            raise PermissionError(f"resource control is not enabled: {spec.resource}")

        namespace = self.field(payload, "namespace")
        name = self.field(payload, "name")
        expected_namespace = self.target_agent_namespace()
        if namespace != expected_namespace:
            raise PermissionError(f"{self.cluster_role} agent cannot control namespace {namespace}")

        if spec.resource == "deployments" and name != TARGET_AGENT_DEPLOYMENT_NAME:
            raise PermissionError("target-agent deployment control is name-scoped")
        if spec.resource == "configmaps" and name != TARGET_AGENT_POLICY_CONFIGMAP_NAME:
            raise PermissionError("target-agent configmap control is name-scoped")

    def ensure_user_workload_allowed(self, spec: KubernetesCommandSpec, payload: object) -> None:
        if self.cluster_role != TARGET_CLUSTER_ROLE:
            raise PermissionError("user workload control is only enabled on target clusters")
        if spec.verb != "patch":
            raise PermissionError(f"{spec.verb} user workload commands are not enabled")
        if spec.resource != "deployments":
            raise PermissionError(f"user workload control is not enabled: {spec.resource}")
        namespace = str(self.field(payload, "namespace"))
        self.field(payload, "name")
        if not control_namespace_allowed(namespace):
            raise PermissionError(CONTROL_NAMESPACE_DENIED_MESSAGE)

    def target_agent_namespace(self) -> str:
        if self.cluster_role == MANAGEMENT_CLUSTER_ROLE:
            return MANAGEMENT_AGENT_NAMESPACE
        return TARGET_AGENT_NAMESPACE

    def field(self, payload: object, name: str) -> object:
        value = getattr(payload, name, None)
        if isinstance(value, str) and value:
            return value
        raise PermissionError(f"kubernetes command payload requires {name}")


class KubernetesApiClient:
    def __init__(
        self,
        *,
        base_url: str | None = None,
        token_path: str = KUBERNETES_SERVICEACCOUNT_TOKEN_PATH,
        ca_cert_path: str = KUBERNETES_SERVICEACCOUNT_CA_CERT_PATH,
        timeout_seconds: int = KUBERNETES_API_TIMEOUT_SECONDS,
    ) -> None:
        self._base_url = base_url
        self.token_path = token_path
        self.ca_cert_path = ca_cert_path
        self.timeout_seconds = timeout_seconds

    async def get_namespaced_resource(
        self,
        *,
        api_group: str,
        version: str,
        namespace: str,
        resource: str,
        name: str,
        subresource: str | None = None,
    ) -> JsonObject:
        response = await self.request(
            "GET",
            self.namespaced_resource_path(
                api_group=api_group,
                version=version,
                namespace=namespace,
                resource=resource,
                name=name,
                subresource=subresource,
            ),
        )
        return self.response_body(response)

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
    ) -> JsonObject:
        response = await self.request(
            "PATCH",
            self.namespaced_resource_path(
                api_group=api_group,
                version=version,
                namespace=namespace,
                resource=resource,
                name=name,
                subresource=subresource,
            ),
            body=body,
            content_type=MERGE_PATCH_CONTENT_TYPE,
        )
        return self.response_body(response)

    async def delete_namespaced_resource(
        self,
        *,
        api_group: str,
        version: str,
        namespace: str,
        resource: str,
        name: str,
    ) -> JsonObject:
        response = await self.request(
            "DELETE",
            self.namespaced_resource_path(
                api_group=api_group,
                version=version,
                namespace=namespace,
                resource=resource,
                name=name,
            ),
            allow_not_found=True,
        )
        return {"deleted": response.status_code != 404, "status_code": response.status_code}

    async def delete_cluster_resource(
        self,
        *,
        api_group: str,
        version: str,
        resource: str,
        name: str,
    ) -> JsonObject:
        response = await self.request(
            "DELETE",
            self.cluster_resource_path(
                api_group=api_group,
                version=version,
                resource=resource,
                name=name,
            ),
            allow_not_found=True,
        )
        return {"deleted": response.status_code != 404, "status_code": response.status_code}

    async def request(
        self,
        method: str,
        path: str,
        *,
        body: JsonObject | None = None,
        content_type: str | None = None,
        allow_not_found: bool = False,
    ) -> httpx.Response:
        headers = self.auth_headers()
        if content_type is not None:
            headers["Content-Type"] = content_type
        async with httpx.AsyncClient(
            timeout=self.timeout_seconds,
            verify=self.ca_cert_path,
        ) as client:
            response = await client.request(
                method,
                f"{self.base_url()}{path}",
                headers=headers,
                json=body,
            )
            if allow_not_found and response.status_code == 404:
                return response
            response.raise_for_status()
            return response

    def namespaced_resource_path(
        self,
        *,
        api_group: str,
        version: str,
        namespace: str,
        resource: str,
        name: str,
        subresource: str | None = None,
    ) -> str:
        if api_group in {"", CORE_API_GROUP}:
            prefix = f"/api/{version}"
        else:
            prefix = f"/apis/{api_group}/{version}"
        path = f"{prefix}/namespaces/{namespace}/{resource}/{name}"
        return f"{path}/{subresource}" if subresource else path

    def cluster_resource_path(
        self,
        *,
        api_group: str,
        version: str,
        resource: str,
        name: str,
    ) -> str:
        prefix = (
            f"/api/{version}"
            if api_group in {"", CORE_API_GROUP}
            else f"/apis/{api_group}/{version}"
        )
        return f"{prefix}/{resource}/{name}"

    def base_url(self) -> str:
        if self._base_url is not None:
            return self._base_url.rstrip("/")
        host = env(KUBERNETES_SERVICE_HOST_ENV, DEFAULT_KUBERNETES_SERVICE_HOST)
        port = env(KUBERNETES_SERVICE_PORT_ENV, DEFAULT_KUBERNETES_SERVICE_PORT)
        return f"https://{host}:{port}"

    def auth_headers(self) -> dict[str, str]:
        token = Path(self.token_path).read_text(encoding="utf-8").strip()
        return {"Authorization": f"Bearer {token}"}

    def response_body(self, response: httpx.Response) -> JsonObject:
        if not response.content:
            return {}
        body = response.json()
        return body if isinstance(body, dict) else {"items": body}

from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any

import httpx
from pydantic import Field, model_validator

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
from packages.contracts.parity import ResourceRef

CORE_API_GROUP = "core"
KUBERNETES_DNS_LABEL_MAX_LENGTH = 63
KUBERNETES_GENERATED_NAME_SUFFIX_LENGTH = 5
TARGET_CLUSTER_ROLE = "target"
MANAGEMENT_CLUSTER_ROLE = "management"
TARGET_AGENT_NAMESPACE = "target"
MANAGEMENT_AGENT_NAMESPACE = "management"
TARGET_AGENT_DEPLOYMENT_NAME = "cluster-agent"
TARGET_AGENT_POLICY_CONFIGMAP_NAME = "target-agent-policy"
MERGE_PATCH_CONTENT_TYPE = "application/merge-patch+json"
TARGET_AGENT_ALLOWED_VERBS = {"get", "patch", "apply"}


def delete_options(
    preconditions: JsonObject | None,
    propagation_policy: str | None,
) -> JsonObject | None:
    if preconditions is None and propagation_policy is None:
        return None
    body: JsonObject = {"apiVersion": "v1", "kind": "DeleteOptions"}
    if preconditions is not None:
        body["preconditions"] = dict(preconditions)
    if propagation_policy is not None:
        body["propagationPolicy"] = propagation_policy
    return body


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


class KubernetesNodeSchedulingPayload(StrictModel):
    name: str = Field(
        min_length=1,
        max_length=253,
        pattern=r"^[a-z0-9](?:[-.a-z0-9]*[a-z0-9])?$",
    )
    unschedulable: bool


class KubernetesCronJobPayload(KubernetesGetPayload):
    name: str = Field(
        min_length=1,
        max_length=52,
        pattern=r"^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$",
    )
    resource_ref: ResourceRef

    @model_validator(mode="after")
    def validate_resource_ref(self) -> KubernetesCronJobPayload:
        resource = self.resource_ref
        if (
            resource.api_group != "batch"
            or resource.version != "v1"
            or resource.kind.casefold() != "cronjob"
            or resource.namespace != self.namespace
            or resource.name != self.name
        ):
            raise ValueError("CronJob payload ResourceRef does not match the command target")
        return self


def kubernetes_generate_name(
    resource_name: str,
    qualifier: str,
    *,
    max_length: int = KUBERNETES_DNS_LABEL_MAX_LENGTH,
    generated_suffix_length: int = KUBERNETES_GENERATED_NAME_SUFFIX_LENGTH,
) -> str:
    """Return a bounded generateName prefix with room for the API suffix."""

    infix = f"-{qualifier}-"
    name_budget = max_length - generated_suffix_length - len(infix)
    if name_budget < 1:
        raise ValueError("Kubernetes generated name budget is invalid")
    bounded_name = resource_name[:name_budget].rstrip("-")
    if not bounded_name:
        raise ValueError("Kubernetes generated name requires a resource name")
    return f"{bounded_name}{infix}"


def validate_cronjob_resource_ref(cronjob: JsonObject, expected: ResourceRef) -> None:
    metadata = cronjob.get("metadata")
    metadata_object = metadata if isinstance(metadata, dict) else {}
    api_version = str(cronjob.get("apiVersion") or "")
    expected_api_version = f"{expected.api_group}/{expected.version}"
    if (
        api_version != expected_api_version
        or str(cronjob.get("kind") or "").casefold() != expected.kind.casefold()
        or str(metadata_object.get("namespace") or "") != expected.namespace
        or str(metadata_object.get("name") or "") != expected.name
        or str(metadata_object.get("uid") or "") != expected.uid
    ):
        raise ValueError("selected CronJob identity is stale")


def cronjob_job_body(cronjob: JsonObject, *, namespace: str, name: str) -> JsonObject:
    """Build one exact Job from the observed CronJob jobTemplate."""

    metadata = cronjob.get("metadata")
    metadata_object = metadata if isinstance(metadata, dict) else {}
    if str(metadata_object.get("name") or "") != name:
        raise ValueError("CronJob identity changed before trigger")
    if str(metadata_object.get("namespace") or namespace) != namespace:
        raise ValueError("CronJob namespace changed before trigger")
    spec = cronjob.get("spec")
    spec_object = spec if isinstance(spec, dict) else {}
    template = spec_object.get("jobTemplate")
    template_object = template if isinstance(template, dict) else {}
    job_spec = template_object.get("spec")
    if not isinstance(job_spec, dict) or not job_spec:
        raise ValueError("CronJob jobTemplate.spec is unavailable")
    template_metadata = template_object.get("metadata")
    template_metadata_object = template_metadata if isinstance(template_metadata, dict) else {}
    job_metadata: JsonObject = {
        "generateName": kubernetes_generate_name(name, "manual"),
        "namespace": namespace,
    }
    for field in ("labels", "annotations"):
        value = template_metadata_object.get(field)
        if isinstance(value, dict):
            job_metadata[field] = deepcopy(value)
    uid = str(metadata_object.get("uid") or "")
    if uid:
        annotations = job_metadata.setdefault("annotations", {})
        if isinstance(annotations, dict):
            annotations["opsia.io/source-cronjob-uid"] = uid
    return {
        "apiVersion": "batch/v1",
        "kind": "Job",
        "metadata": job_metadata,
        "spec": deepcopy(job_spec),
    }


class KubernetesCommandPolicy:
    def __init__(self, cluster_role: str) -> None:
        self.cluster_role = cluster_role

    def ensure_allowed(
        self, spec: KubernetesCommandSpec, payload: object, *, direct_execution: bool = False
    ) -> None:
        if spec.scope == "user-workload":
            self.ensure_user_workload_allowed(spec, payload, direct_execution=direct_execution)
            return
        if spec.scope == "cluster-workload":
            self.ensure_cluster_workload_allowed(
                spec,
                payload,
                direct_execution=direct_execution,
            )
            return
        if spec.scope == "service-access":
            self.ensure_service_access_allowed(spec, payload)
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

    def ensure_user_workload_allowed(
        self, spec: KubernetesCommandSpec, payload: object, *, direct_execution: bool = False
    ) -> None:
        if self.cluster_role != TARGET_CLUSTER_ROLE and not direct_execution:
            raise PermissionError("user workload control is only enabled on target clusters")
        allowed = {
            ("apps", "v1", "deployments", "patch"),
            ("apps", "v1", "statefulsets", "patch"),
            ("apps", "v1", "daemonsets", "patch"),
            ("batch", "v1", "jobs", "create"),
            ("batch", "v1", "cronjobs", "patch"),
        }
        if (spec.api_group, spec.version, spec.resource, spec.verb) not in allowed:
            raise PermissionError(
                f"user workload control is not enabled: "
                f"{spec.api_group}/{spec.version}/{spec.resource}:{spec.verb}"
            )
        namespace = str(self.field(payload, "namespace"))
        self.field(payload, "name")
        if not control_namespace_allowed(namespace):
            raise PermissionError(CONTROL_NAMESPACE_DENIED_MESSAGE)

    def ensure_service_access_allowed(
        self,
        spec: KubernetesCommandSpec,
        payload: object,
    ) -> None:
        if (
            spec.api_group not in {"", CORE_API_GROUP}
            or spec.version != "v1"
            or spec.resource != "services"
            or spec.verb != "get"
        ):
            raise PermissionError("service access permits only core/v1 Service reads")
        resource = getattr(payload, "resource", None)
        namespace = getattr(resource, "namespace", None)
        name = getattr(resource, "name", None)
        uid = getattr(resource, "uid", None)
        if not all(isinstance(value, str) and value for value in (namespace, name, uid)):
            raise PermissionError("service access requires an exact namespaced Service")

    def ensure_cluster_workload_allowed(
        self,
        spec: KubernetesCommandSpec,
        payload: object,
        *,
        direct_execution: bool = False,
    ) -> None:
        if self.cluster_role != TARGET_CLUSTER_ROLE and not direct_execution:
            raise PermissionError("cluster workload control is only enabled on target clusters")
        if (
            spec.api_group not in {"", CORE_API_GROUP}
            or spec.version != "v1"
            or spec.resource != "nodes"
            or spec.verb != "patch"
        ):
            raise PermissionError("cluster workload control permits only core/v1 Node patches")
        self.field(payload, "name")

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

    async def get_cluster_resource(
        self,
        *,
        api_group: str,
        version: str,
        resource: str,
        name: str,
    ) -> JsonObject:
        response = await self.request(
            "GET",
            self.cluster_resource_path(
                api_group=api_group,
                version=version,
                resource=resource,
                name=name,
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

    async def patch_cluster_resource(
        self,
        *,
        api_group: str,
        version: str,
        resource: str,
        name: str,
        body: JsonObject,
    ) -> JsonObject:
        response = await self.request(
            "PATCH",
            self.cluster_resource_path(
                api_group=api_group,
                version=version,
                resource=resource,
                name=name,
            ),
            body=body,
            content_type=MERGE_PATCH_CONTENT_TYPE,
        )
        return self.response_body(response)

    async def create_namespaced_resource(
        self,
        *,
        api_group: str,
        version: str,
        namespace: str,
        resource: str,
        body: JsonObject,
    ) -> JsonObject:
        response = await self.request(
            "POST",
            self.namespaced_collection_path(
                api_group=api_group,
                version=version,
                namespace=namespace,
                resource=resource,
            ),
            body=body,
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
        preconditions: JsonObject | None = None,
        propagation_policy: str | None = None,
    ) -> JsonObject:
        body = delete_options(preconditions, propagation_policy)
        response = await self.request(
            "DELETE",
            self.namespaced_resource_path(
                api_group=api_group,
                version=version,
                namespace=namespace,
                resource=resource,
                name=name,
            ),
            body=body,
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
        preconditions: JsonObject | None = None,
        propagation_policy: str | None = None,
    ) -> JsonObject:
        body = delete_options(preconditions, propagation_policy)
        response = await self.request(
            "DELETE",
            self.cluster_resource_path(
                api_group=api_group,
                version=version,
                resource=resource,
                name=name,
            ),
            body=body,
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

    def namespaced_collection_path(
        self,
        *,
        api_group: str,
        version: str,
        namespace: str,
        resource: str,
    ) -> str:
        prefix = (
            f"/api/{version}"
            if api_group in {"", CORE_API_GROUP}
            else f"/apis/{api_group}/{version}"
        )
        return f"{prefix}/namespaces/{namespace}/{resource}"

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

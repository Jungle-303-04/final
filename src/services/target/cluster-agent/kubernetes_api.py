from __future__ import annotations

import os
from dataclasses import dataclass

import httpx

from packages.config.settings import env
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gitops import supported_kubernetes_resource


@dataclass(frozen=True)
class KubernetesManifestResource:
    kind: str
    api_version: str
    namespace: str
    name: str
    plural: str
    api_prefix: str
    manifest: JsonObject

    def collection_url(self, base_url: str) -> str:
        return f"{base_url}{self.api_prefix}/namespaces/{self.namespace}/{self.plural}"

    def resource_url(self, base_url: str) -> str:
        return f"{self.collection_url(base_url)}/{self.name}"


class KubernetesApiConfig:
    SERVICE_HOST_ENV = "KUBERNETES_SERVICE_HOST"
    SERVICE_PORT_ENV = "KUBERNETES_SERVICE_PORT_HTTPS"
    SERVICE_ACCOUNT_TOKEN_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/token"
    SERVICE_ACCOUNT_CA_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"
    HTTP_TIMEOUT_SECONDS = 20


def kubernetes_client(transport: httpx.AsyncBaseTransport | None = None) -> httpx.AsyncClient:
    verify: str | bool = (
        KubernetesApiConfig.SERVICE_ACCOUNT_CA_PATH
        if os.path.exists(KubernetesApiConfig.SERVICE_ACCOUNT_CA_PATH)
        else True
    )
    return httpx.AsyncClient(
        verify=verify,
        transport=transport,
        timeout=KubernetesApiConfig.HTTP_TIMEOUT_SECONDS,
    )


def kubernetes_headers(token: str, content_type: str | None = None) -> dict[str, str]:
    headers = {"authorization": f"Bearer {token}"}
    if content_type is not None:
        headers["content-type"] = content_type
    return headers


def kubernetes_api_base_url() -> str | None:
    host = env(KubernetesApiConfig.SERVICE_HOST_ENV, "")
    port = env(KubernetesApiConfig.SERVICE_PORT_ENV, "443")
    return f"https://{host}:{port}" if host else None


def service_account_token() -> str | None:
    if not os.path.exists(KubernetesApiConfig.SERVICE_ACCOUNT_TOKEN_PATH):
        return None
    with open(KubernetesApiConfig.SERVICE_ACCOUNT_TOKEN_PATH, encoding="utf-8") as token_file:
        return token_file.read().strip()


def kubernetes_manifest_resource(
    manifest: JsonObject,
    fallback_namespace: str,
) -> KubernetesManifestResource:
    kind = str(manifest.get("kind", ""))
    api_version = str(manifest.get("apiVersion", ""))
    metadata = manifest.get("metadata", {})
    if not isinstance(metadata, dict):
        raise ValueError("manifest metadata must be an object")
    name = str(metadata.get("name", ""))
    namespace = str(metadata.get("namespace") or fallback_namespace)
    if not kind or not api_version or not name:
        raise ValueError("manifest requires apiVersion, kind, and metadata.name")

    api_prefix, plural = kubernetes_resource_api(kind, api_version)
    normalized = {
        **manifest,
        "metadata": {
            **metadata,
            "namespace": namespace,
        },
    }
    return KubernetesManifestResource(
        kind=kind,
        api_version=api_version,
        namespace=namespace,
        name=name,
        plural=plural,
        api_prefix=api_prefix,
        manifest=normalized,
    )


def kubernetes_resource_api(kind: str, api_version: str) -> tuple[str, str]:
    contract = supported_kubernetes_resource(api_version, kind)
    return contract.api_prefix, contract.plural

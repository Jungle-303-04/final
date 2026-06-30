from __future__ import annotations

import os

import httpx

from packages.config.settings import env
from packages.contracts.event_bus.interfaces import JsonObject


class NodeCollectorManagerConfig:
    NODE_COLLECTOR_ENABLED_ENV = "NODE_COLLECTOR_ENABLED"
    NODE_COLLECTOR_IMAGE_ENV = "NODE_COLLECTOR_IMAGE"
    NODE_COLLECTOR_NAMESPACE_ENV = "NODE_COLLECTOR_NAMESPACE"
    NODE_COLLECTOR_NAME = "optional-node-collector"
    NODE_COLLECTOR_APP_LABEL = "optional-node-collector"
    NODE_COLLECTOR_CONTAINER_NAME = "node-collector"
    NODE_COLLECTOR_DEFAULT_IMAGE = "service:local"
    NODE_COLLECTOR_DEFAULT_NAMESPACE = "target"
    NODE_COLLECTOR_PORT = 9100
    NODE_COLLECTOR_COLLECT_INTERVAL_SECONDS = 15
    NODE_COLLECTOR_CREATED_MESSAGE = "node collector daemonset created"
    NODE_COLLECTOR_PATCHED_MESSAGE = "node collector daemonset reconciled"
    NODE_COLLECTOR_DRY_RUN_MESSAGE = "kubernetes api not configured; node collector dry-run only"
    NODE_COLLECTOR_DISABLED_MESSAGE = "node collector reconcile disabled"
    NODE_COLLECTOR_MANAGED_BY_LABEL = "ops.service/managed-by"
    NODE_COLLECTOR_MANAGED_BY_VALUE = "cluster-agent"

    KUBERNETES_SERVICE_HOST_ENV = "KUBERNETES_SERVICE_HOST"
    KUBERNETES_SERVICE_PORT_ENV = "KUBERNETES_SERVICE_PORT_HTTPS"
    SERVICE_ACCOUNT_TOKEN_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/token"
    SERVICE_ACCOUNT_CA_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"
    HTTP_TIMEOUT_SECONDS = 20


class NodeCollectorManager:
    """target cluster 노드마다 node collector DaemonSet 유지.

    인계 기준: target registration은 cluster-agent 설치까지만 담당.
    이후 collector rollout과 drift correction은 target-agent 경계에서 처리.
    TODO(target): inline DaemonSet을 Helm/Kustomize 렌더링 collector spec으로 교체
    """

    def __init__(
        self,
        *,
        enabled: bool,
        image: str,
        namespace: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.enabled = enabled
        self.image = image
        self.namespace = namespace
        self.transport = transport

    @classmethod
    def from_env(cls, transport: httpx.AsyncBaseTransport | None = None) -> NodeCollectorManager:
        return cls(
            enabled=truthy(env(NodeCollectorManagerConfig.NODE_COLLECTOR_ENABLED_ENV, "true")),
            image=env(
                NodeCollectorManagerConfig.NODE_COLLECTOR_IMAGE_ENV,
                NodeCollectorManagerConfig.NODE_COLLECTOR_DEFAULT_IMAGE,
            ),
            namespace=env(
                NodeCollectorManagerConfig.NODE_COLLECTOR_NAMESPACE_ENV,
                NodeCollectorManagerConfig.NODE_COLLECTOR_DEFAULT_NAMESPACE,
            ),
            transport=transport,
        )

    async def reconcile(self) -> tuple[bool, str]:
        if not self.enabled:
            return False, NodeCollectorManagerConfig.NODE_COLLECTOR_DISABLED_MESSAGE
        base_url = kubernetes_api_base_url()
        token = service_account_token()
        if not base_url or not token:
            return False, NodeCollectorManagerConfig.NODE_COLLECTOR_DRY_RUN_MESSAGE

        daemonset = self.daemonset()
        collection_url = f"{base_url}/apis/apps/v1/namespaces/{self.namespace}/daemonsets"
        resource_url = f"{collection_url}/{NodeCollectorManagerConfig.NODE_COLLECTOR_NAME}"
        async with kubernetes_client(self.transport) as client:
            current = await client.get(resource_url, headers=kubernetes_headers(token))
            if current.status_code == 404:
                created = await client.post(
                    collection_url,
                    json=daemonset,
                    headers=kubernetes_headers(token, "application/json"),
                )
                created.raise_for_status()
                return True, NodeCollectorManagerConfig.NODE_COLLECTOR_CREATED_MESSAGE

            current.raise_for_status()
            patched = await client.patch(
                resource_url,
                json={"metadata": daemonset["metadata"], "spec": daemonset["spec"]},
                headers=kubernetes_headers(token, "application/strategic-merge-patch+json"),
            )
            patched.raise_for_status()
        return True, NodeCollectorManagerConfig.NODE_COLLECTOR_PATCHED_MESSAGE

    def daemonset(self) -> JsonObject:
        labels = {
            "app": NodeCollectorManagerConfig.NODE_COLLECTOR_APP_LABEL,
            NodeCollectorManagerConfig.NODE_COLLECTOR_MANAGED_BY_LABEL: NodeCollectorManagerConfig.NODE_COLLECTOR_MANAGED_BY_VALUE,
        }
        return {
            "apiVersion": "apps/v1",
            "kind": "DaemonSet",
            "metadata": {
                "name": NodeCollectorManagerConfig.NODE_COLLECTOR_NAME,
                "namespace": self.namespace,
                "labels": labels,
            },
            "spec": {
                "selector": {
                    "matchLabels": {"app": NodeCollectorManagerConfig.NODE_COLLECTOR_APP_LABEL}
                },
                "updateStrategy": {"type": "RollingUpdate"},
                "template": {
                    "metadata": {
                        "annotations": {
                            "prometheus.io/path": "/metrics",
                            "prometheus.io/port": str(
                                NodeCollectorManagerConfig.NODE_COLLECTOR_PORT
                            ),
                            "prometheus.io/scrape": "true",
                        },
                        "labels": labels,
                    },
                    "spec": {
                        "tolerations": [{"operator": "Exists"}],
                        "containers": [node_collector_container(self.image)],
                    },
                },
            },
        }


def node_collector_container(image: str) -> JsonObject:
    return {
        "name": NodeCollectorManagerConfig.NODE_COLLECTOR_CONTAINER_NAME,
        "image": image,
        "imagePullPolicy": "IfNotPresent",
        "command": ["python", "src/services/target/node-collector/app.py"],
        "env": [
            {"name": "PORT", "value": str(NodeCollectorManagerConfig.NODE_COLLECTOR_PORT)},
            {
                "name": "COLLECT_INTERVAL_SECONDS",
                "value": str(NodeCollectorManagerConfig.NODE_COLLECTOR_COLLECT_INTERVAL_SECONDS),
            },
            {"name": "NODE_NAME", "valueFrom": {"fieldRef": {"fieldPath": "spec.nodeName"}}},
            {"name": "POD_NAME", "valueFrom": {"fieldRef": {"fieldPath": "metadata.name"}}},
            {
                "name": "POD_NAMESPACE",
                "valueFrom": {"fieldRef": {"fieldPath": "metadata.namespace"}},
            },
        ],
        "ports": [
            {"name": "metrics", "containerPort": NodeCollectorManagerConfig.NODE_COLLECTOR_PORT}
        ],
    }


def kubernetes_client(transport: httpx.AsyncBaseTransport | None = None) -> httpx.AsyncClient:
    verify: str | bool = (
        NodeCollectorManagerConfig.SERVICE_ACCOUNT_CA_PATH
        if os.path.exists(NodeCollectorManagerConfig.SERVICE_ACCOUNT_CA_PATH)
        else True
    )
    return httpx.AsyncClient(
        verify=verify,
        transport=transport,
        timeout=NodeCollectorManagerConfig.HTTP_TIMEOUT_SECONDS,
    )


def kubernetes_headers(token: str, content_type: str | None = None) -> dict[str, str]:
    headers = {"authorization": f"Bearer {token}"}
    if content_type is not None:
        headers["content-type"] = content_type
    return headers


def kubernetes_api_base_url() -> str | None:
    host = env(NodeCollectorManagerConfig.KUBERNETES_SERVICE_HOST_ENV, "")
    port = env(NodeCollectorManagerConfig.KUBERNETES_SERVICE_PORT_ENV, "443")
    return f"https://{host}:{port}" if host else None


def service_account_token() -> str | None:
    if not os.path.exists(NodeCollectorManagerConfig.SERVICE_ACCOUNT_TOKEN_PATH):
        return None
    with open(
        NodeCollectorManagerConfig.SERVICE_ACCOUNT_TOKEN_PATH, encoding="utf-8"
    ) as token_file:
        return token_file.read().strip()


def truthy(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}

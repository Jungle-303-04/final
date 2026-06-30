from __future__ import annotations

import os

import httpx
from settings import Settings

from packages.config.settings import env
from packages.contracts.event_bus.interfaces import JsonObject


class NodeCollectorManager:
    """Keeps the node collector DaemonSet on every target-cluster node.

    Team handoff: target registration installs only the cluster-agent. From that point,
    this target-agent boundary owns collector rollout and drift correction.
    TODO(target): replace this inline DaemonSet with a Helm/Kustomize-rendered collector spec.
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
            enabled=truthy(env(Settings.NODE_COLLECTOR_ENABLED_ENV, "true")),
            image=env(Settings.NODE_COLLECTOR_IMAGE_ENV, Settings.NODE_COLLECTOR_DEFAULT_IMAGE),
            namespace=env(
                Settings.NODE_COLLECTOR_NAMESPACE_ENV,
                Settings.NODE_COLLECTOR_DEFAULT_NAMESPACE,
            ),
            transport=transport,
        )

    async def reconcile(self) -> tuple[bool, str]:
        if not self.enabled:
            return False, Settings.NODE_COLLECTOR_DISABLED_MESSAGE
        base_url = kubernetes_api_base_url()
        token = service_account_token()
        if not base_url or not token:
            return False, Settings.NODE_COLLECTOR_DRY_RUN_MESSAGE

        daemonset = self.daemonset()
        collection_url = f"{base_url}/apis/apps/v1/namespaces/{self.namespace}/daemonsets"
        resource_url = f"{collection_url}/{Settings.NODE_COLLECTOR_NAME}"
        async with kubernetes_client(self.transport) as client:
            current = await client.get(resource_url, headers=kubernetes_headers(token))
            if current.status_code == 404:
                created = await client.post(
                    collection_url,
                    json=daemonset,
                    headers=kubernetes_headers(token, "application/json"),
                )
                created.raise_for_status()
                return True, Settings.NODE_COLLECTOR_CREATED_MESSAGE

            current.raise_for_status()
            patched = await client.patch(
                resource_url,
                json={"metadata": daemonset["metadata"], "spec": daemonset["spec"]},
                headers=kubernetes_headers(token, "application/strategic-merge-patch+json"),
            )
            patched.raise_for_status()
        return True, Settings.NODE_COLLECTOR_PATCHED_MESSAGE

    def daemonset(self) -> JsonObject:
        labels = {
            "app": Settings.NODE_COLLECTOR_APP_LABEL,
            Settings.NODE_COLLECTOR_MANAGED_BY_LABEL: Settings.NODE_COLLECTOR_MANAGED_BY_VALUE,
        }
        return {
            "apiVersion": "apps/v1",
            "kind": "DaemonSet",
            "metadata": {
                "name": Settings.NODE_COLLECTOR_NAME,
                "namespace": self.namespace,
                "labels": labels,
            },
            "spec": {
                "selector": {"matchLabels": {"app": Settings.NODE_COLLECTOR_APP_LABEL}},
                "updateStrategy": {"type": "RollingUpdate"},
                "template": {
                    "metadata": {
                        "annotations": {
                            "prometheus.io/path": "/metrics",
                            "prometheus.io/port": str(Settings.NODE_COLLECTOR_PORT),
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
        "name": Settings.NODE_COLLECTOR_CONTAINER_NAME,
        "image": image,
        "imagePullPolicy": "IfNotPresent",
        "command": ["python", "src/services/target/node-collector/app.py"],
        "env": [
            {"name": "PORT", "value": str(Settings.NODE_COLLECTOR_PORT)},
            {
                "name": "COLLECT_INTERVAL_SECONDS",
                "value": str(Settings.NODE_COLLECTOR_COLLECT_INTERVAL_SECONDS),
            },
            {"name": "NODE_NAME", "valueFrom": {"fieldRef": {"fieldPath": "spec.nodeName"}}},
            {"name": "POD_NAME", "valueFrom": {"fieldRef": {"fieldPath": "metadata.name"}}},
            {
                "name": "POD_NAMESPACE",
                "valueFrom": {"fieldRef": {"fieldPath": "metadata.namespace"}},
            },
        ],
        "ports": [{"name": "metrics", "containerPort": Settings.NODE_COLLECTOR_PORT}],
    }


def kubernetes_client(transport: httpx.AsyncBaseTransport | None = None) -> httpx.AsyncClient:
    verify: str | bool = (
        Settings.SERVICE_ACCOUNT_CA_PATH
        if os.path.exists(Settings.SERVICE_ACCOUNT_CA_PATH)
        else True
    )
    return httpx.AsyncClient(
        verify=verify,
        transport=transport,
        timeout=Settings.HTTP_TIMEOUT_SECONDS,
    )


def kubernetes_headers(token: str, content_type: str | None = None) -> dict[str, str]:
    headers = {"authorization": f"Bearer {token}"}
    if content_type is not None:
        headers["content-type"] = content_type
    return headers


def kubernetes_api_base_url() -> str | None:
    host = env(Settings.KUBERNETES_SERVICE_HOST_ENV, "")
    port = env(Settings.KUBERNETES_SERVICE_PORT_ENV, "443")
    return f"https://{host}:{port}" if host else None


def service_account_token() -> str | None:
    if not os.path.exists(Settings.SERVICE_ACCOUNT_TOKEN_PATH):
        return None
    with open(Settings.SERVICE_ACCOUNT_TOKEN_PATH, encoding="utf-8") as token_file:
        return token_file.read().strip()


def truthy(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}

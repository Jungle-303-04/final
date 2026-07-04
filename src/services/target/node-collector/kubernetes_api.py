from __future__ import annotations

from pathlib import Path

import httpx

from packages.config.settings import env

DEFAULT_KUBERNETES_SERVICE_HOST = "kubernetes.default.svc"
DEFAULT_KUBERNETES_SERVICE_PORT = "443"
KUBERNETES_SERVICE_HOST_ENV = "KUBERNETES_SERVICE_HOST"
KUBERNETES_SERVICE_PORT_ENV = "KUBERNETES_SERVICE_PORT_HTTPS"
KUBERNETES_SERVICEACCOUNT_DIR = "/var/run/secrets/kubernetes.io/serviceaccount"
KUBERNETES_SERVICEACCOUNT_TOKEN_PATH = f"{KUBERNETES_SERVICEACCOUNT_DIR}/token"
KUBERNETES_SERVICEACCOUNT_CA_CERT_PATH = f"{KUBERNETES_SERVICEACCOUNT_DIR}/ca.crt"
KUBERNETES_API_TIMEOUT_SECONDS_ENV = "KUBERNETES_API_TIMEOUT_SECONDS"  # k8s API 타임아웃 초(기본 5)
KUBERNETES_API_TIMEOUT_SECONDS = int(env(KUBERNETES_API_TIMEOUT_SECONDS_ENV, "5"))

# Kubernetes API responses are JSON objects with nested dict/list values.
# Keeping this alias local makes helper signatures shorter while we are still
# shaping the collector-specific payload model.
JsonObject = dict[str, object]


class KubernetesApiClient:
    # Builds and calls the in-cluster Kubernetes API using the Pod's ServiceAccount.
    def base_url(self) -> str:
        host = env(KUBERNETES_SERVICE_HOST_ENV, DEFAULT_KUBERNETES_SERVICE_HOST)
        port = env(KUBERNETES_SERVICE_PORT_ENV, DEFAULT_KUBERNETES_SERVICE_PORT)
        return f"https://{host}:{port}"

    def auth_headers(self) -> dict[str, str]:
        token = Path(KUBERNETES_SERVICEACCOUNT_TOKEN_PATH).read_text(encoding="utf-8").strip()
        return {"Authorization": f"Bearer {token}"}

    async def list_pods(self) -> JsonObject:
        # /api/v1/pods returns a PodList for the whole cluster.
        async with httpx.AsyncClient(
            timeout=KUBERNETES_API_TIMEOUT_SECONDS,
            verify=KUBERNETES_SERVICEACCOUNT_CA_CERT_PATH,
        ) as client:
            response = await client.get(
                f"{self.base_url()}/api/v1/pods",
                headers=self.auth_headers(),
            )
            response.raise_for_status()
            return response.json()


def pods_on_node(pods_payload: JsonObject, node_name: str) -> list[JsonObject]:
    # Kubernetes returns Pods under the top-level "items" field:
    # {"kind": "PodList", "items": [{...pod...}, ...]}
    items = pods_payload.get("items", [])
    if not isinstance(items, list):
        return []

    node_pods = []
    for pod in items:
        if not isinstance(pod, dict):
            continue

        spec = pod.get("spec", {})
        if not isinstance(spec, dict):
            continue

        # spec.nodeName is filled after the scheduler assigns a Pod to a node.
        if spec.get("nodeName") == node_name:
            node_pods.append(pod)

    return node_pods


def is_pod_ready(pod: JsonObject) -> bool:
    # Pod readiness lives in status.conditions, not in spec.
    # A Pod is Ready only when {"type": "Ready", "status": "True"} exists.
    status = pod.get("status", {})
    if not isinstance(status, dict):
        return False

    conditions = status.get("conditions", [])
    if not isinstance(conditions, list):
        return False

    for condition in conditions:
        if not isinstance(condition, dict):
            continue

        if condition.get("type") == "Ready":
            return condition.get("status") == "True"

    # Missing or malformed Ready condition is treated as not ready.
    return False


def count_not_ready_pods(pods: list[JsonObject]) -> int:
    return sum(1 for pod in pods if not is_pod_ready(pod))

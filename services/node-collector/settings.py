from __future__ import annotations

SERVICE_NAME = "node-collector"
SERVICE_HOST = "0.0.0.0"
SERVICE_PORT_ENV = "PORT"
DEFAULT_SERVICE_PORT = "9100"
LOG_LEVEL = "info"

NODE_NAME_ENV = "NODE_NAME"
POD_NAME_ENV = "POD_NAME"
POD_NAMESPACE_ENV = "POD_NAMESPACE"
COLLECT_INTERVAL_ENV = "COLLECT_INTERVAL_SECONDS"

# Kubernetes injects these env vars into Pods so in-cluster clients can find the API server.
KUBERNETES_SERVICE_HOST_ENV = "KUBERNETES_SERVICE_HOST"
KUBERNETES_SERVICE_PORT_ENV = "KUBERNETES_SERVICE_PORT"

DEFAULT_NODE_NAME = "unknown-node"
DEFAULT_POD_NAME = "node-collector"
DEFAULT_POD_NAMESPACE = "target"
DEFAULT_COLLECT_INTERVAL_SECONDS = "15"
DEFAULT_KUBERNETES_SERVICE_HOST = "kubernetes.default.svc"
DEFAULT_KUBERNETES_SERVICE_PORT = "443"

# Mounted automatically for the Pod's ServiceAccount.
# node-collector will use these files when calling the Kubernetes API with httpx.
KUBERNETES_SERVICEACCOUNT_DIR = "/var/run/secrets/kubernetes.io/serviceaccount"
KUBERNETES_SERVICEACCOUNT_TOKEN_PATH = f"{KUBERNETES_SERVICEACCOUNT_DIR}/token"
KUBERNETES_SERVICEACCOUNT_CA_CERT_PATH = f"{KUBERNETES_SERVICEACCOUNT_DIR}/ca.crt"

# Keep Kubernetes API calls short so /metrics does not hang during scraping.
KUBERNETES_API_TIMEOUT_SECONDS = 5

RUNTIME_NAME = "containerd"
METRIC_CONTENT_TYPE = "text/plain; version=0.0.4"

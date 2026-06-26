from __future__ import annotations

from packages.config.constants import EventSubject

SERVICE_NAME = "gitops-sync-worker"
SUBSCRIBE_SUBJECT = EventSubject.GIT_WEBHOOK_RECEIVED

DEFAULT_APP_NAME = "checkout-api"
DEFAULT_IMAGE = "ghcr.io/project/checkout-api:bad"
PREVIOUS_IMAGE = "ghcr.io/project/checkout-api:previous"
DEFAULT_REPLICAS = 2
TARGET_CLUSTER_ENV = "TARGET_CLUSTER_ID"
MANIFEST_API_VERSION = "apps/v1"
MANIFEST_KIND = "Deployment"
RESOURCE_REF = "deployment/checkout-api"
SYNC_ACTION = "apply_sandbox_manifest"
SYNC_REASON = "sync rendered manifest to sandbox namespace"
SYNC_RISK = "sandbox-only"

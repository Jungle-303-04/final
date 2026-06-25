from __future__ import annotations

import json
import uuid
from typing import Any

from packages.shared.constants import DEFAULT_TARGET_CLUSTER_ID, SANDBOX_NAMESPACE, EventSubject
from packages.shared.core import Database, EventBus, env, publish_and_record

SERVICE_NAME = "gitops-sync-worker"
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


class GitOpsSyncWorkflow:
    def __init__(self, bus: EventBus, db: Database) -> None:
        self.bus = bus
        self.db = db

    async def handle(self, evt: dict[str, Any]) -> None:
        payload = evt["payload"]
        commit_sha = payload.get("commit_sha") or str(uuid.uuid4())[:8]
        manifest = {
            "app": DEFAULT_APP_NAME,
            "image": payload.get("image", DEFAULT_IMAGE),
            "replicas": payload.get("replicas", DEFAULT_REPLICAS),
            "namespace": SANDBOX_NAMESPACE,
        }
        with self.db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into repo_changes (correlation_id, commit_sha, manifest)
                    values (%s, %s, %s)
                    """,
                    (evt["correlation_id"], commit_sha, json.dumps(manifest)),
                )

        rendered = {
            "apiVersion": MANIFEST_API_VERSION,
            "kind": MANIFEST_KIND,
            "metadata": {"name": manifest["app"], "namespace": manifest["namespace"]},
            "spec": {"replicas": manifest["replicas"], "image": manifest["image"]},
        }
        diff = {
            "resource": RESOURCE_REF,
            "namespace": SANDBOX_NAMESPACE,
            "desired_image": rendered["spec"]["image"],
            "actual_image": PREVIOUS_IMAGE,
            "risk": SYNC_RISK,
        }
        await publish_and_record(
            self.bus,
            self.db,
            EventSubject.GIT_CHANGED,
            SERVICE_NAME,
            {"commit_sha": commit_sha, "manifest": manifest},
            evt["correlation_id"],
        )
        await publish_and_record(
            self.bus,
            self.db,
            EventSubject.MANIFEST_RENDERED,
            SERVICE_NAME,
            {"rendered_manifest": rendered},
            evt["correlation_id"],
        )
        await publish_and_record(
            self.bus,
            self.db,
            EventSubject.DESIRED_DIFF_DETECTED,
            SERVICE_NAME,
            {"diff": diff},
            evt["correlation_id"],
        )
        await publish_and_record(
            self.bus,
            self.db,
            EventSubject.COMMAND_REQUESTED,
            SERVICE_NAME,
            {
                "cluster_id": env(TARGET_CLUSTER_ENV, DEFAULT_TARGET_CLUSTER_ID),
                "action": SYNC_ACTION,
                "namespace": SANDBOX_NAMESPACE,
                "reason": SYNC_REASON,
                "diff": diff,
            },
            evt["correlation_id"],
        )

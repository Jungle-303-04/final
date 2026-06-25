from __future__ import annotations

import json
import uuid
from typing import Any

from service.shared.core import Database, EventBus, env, publish_and_record


class GitOpsSyncWorkflow:
    def __init__(self, bus: EventBus, db: Database) -> None:
        self.bus = bus
        self.db = db

    async def handle(self, evt: dict[str, Any]) -> None:
        payload = evt["payload"]
        commit_sha = payload.get("commit_sha") or str(uuid.uuid4())[:8]
        manifest = {
            "app": "checkout-api",
            "image": payload.get("image", "ghcr.io/project/checkout-api:bad"),
            "replicas": payload.get("replicas", 2),
            "namespace": "sandbox",
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
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {"name": manifest["app"], "namespace": manifest["namespace"]},
            "spec": {"replicas": manifest["replicas"], "image": manifest["image"]},
        }
        diff = {
            "resource": "deployment/checkout-api",
            "namespace": "sandbox",
            "desired_image": rendered["spec"]["image"],
            "actual_image": "ghcr.io/project/checkout-api:previous",
            "risk": "sandbox-only",
        }
        await publish_and_record(
            self.bus,
            self.db,
            "git.changed",
            "gitops-sync-worker",
            {"commit_sha": commit_sha, "manifest": manifest},
            evt["correlation_id"],
        )
        await publish_and_record(
            self.bus,
            self.db,
            "manifest.rendered",
            "gitops-sync-worker",
            {"rendered_manifest": rendered},
            evt["correlation_id"],
        )
        await publish_and_record(
            self.bus,
            self.db,
            "desired.diff.detected",
            "gitops-sync-worker",
            {"diff": diff},
            evt["correlation_id"],
        )
        await publish_and_record(
            self.bus,
            self.db,
            "command.requested",
            "gitops-sync-worker",
            {
                "cluster_id": env("TARGET_CLUSTER_ID", "target-cluster-01"),
                "action": "apply_sandbox_manifest",
                "namespace": "sandbox",
                "reason": "sync rendered manifest to sandbox namespace",
                "diff": diff,
            },
            evt["correlation_id"],
        )

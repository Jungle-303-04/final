from __future__ import annotations

import uuid
from typing import Any

from settings import (
    DEFAULT_APP_NAME,
    DEFAULT_IMAGE,
    DEFAULT_REPLICAS,
    MANIFEST_API_VERSION,
    MANIFEST_KIND,
    PREVIOUS_IMAGE,
    RESOURCE_REF,
    SERVICE_NAME,
    SYNC_ACTION,
    SYNC_REASON,
    SYNC_RISK,
    TARGET_CLUSTER_ENV,
)

from packages.config.constants import DEFAULT_TARGET_CLUSTER_ID, SANDBOX_NAMESPACE, EventSubject
from packages.config.settings import env
from packages.contracts.interfaces import EventClient, RepoChangeStore


class GitOpsSyncWorkflow:
    def __init__(self, events: EventClient, repo: RepoChangeStore) -> None:
        self.events = events
        self.repo = repo

    async def handle(self, evt: dict[str, Any]) -> None:
        payload = evt["payload"]
        commit_sha = payload.get("commit_sha") or str(uuid.uuid4())[:8]
        manifest = {
            "app": DEFAULT_APP_NAME,
            "image": payload.get("image", DEFAULT_IMAGE),
            "replicas": payload.get("replicas", DEFAULT_REPLICAS),
            "namespace": SANDBOX_NAMESPACE,
        }
        self.repo.save_repo_change(evt["correlation_id"], commit_sha, manifest)

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
        await self.events.publish(
            EventSubject.GIT_CHANGED,
            SERVICE_NAME,
            {"commit_sha": commit_sha, "manifest": manifest},
            evt["correlation_id"],
        )
        await self.events.publish(
            EventSubject.MANIFEST_RENDERED,
            SERVICE_NAME,
            {"rendered_manifest": rendered},
            evt["correlation_id"],
        )
        await self.events.publish(
            EventSubject.DESIRED_DIFF_DETECTED,
            SERVICE_NAME,
            {"diff": diff},
            evt["correlation_id"],
        )
        await self.events.publish(
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

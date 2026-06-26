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

from packages.config.constants import DEFAULT_TARGET_CLUSTER_ID, SANDBOX_NAMESPACE
from packages.config.settings import env
from packages.contracts.event_bus.fields import CORRELATION_ID, PAYLOAD
from packages.contracts.event_bus.interfaces import EventClient
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.gateway import fields as gateway_fields
from packages.contracts.interfaces import RepoChangeStore

ACTUAL_IMAGE_FIELD = "actual_image"
APP_FIELD = "app"
API_VERSION_FIELD = "apiVersion"
COMMIT_SHA_FIELD = "commit_sha"
DESIRED_IMAGE_FIELD = "desired_image"
DIFF_FIELD = "diff"
IMAGE_FIELD = "image"
KIND_FIELD = "kind"
MANIFEST_FIELD = "manifest"
METADATA_FIELD = "metadata"
NAME_FIELD = "name"
PREVIOUS_IMAGE_FIELD = "previous_image"
RENDERED_MANIFEST_FIELD = "rendered_manifest"
REPLICAS_FIELD = "replicas"
RESOURCE_FIELD = "resource"
RISK_FIELD = "risk"
SPEC_FIELD = "spec"


class GitOpsSyncWorkflow:
    def __init__(self, events: EventClient, repo: RepoChangeStore) -> None:
        self.events = events
        self.repo = repo

    async def handle(self, evt: dict[str, Any]) -> None:
        payload = evt[PAYLOAD]
        commit_sha = payload.get(COMMIT_SHA_FIELD) or str(uuid.uuid4())[:8]
        manifest = {
            APP_FIELD: DEFAULT_APP_NAME,
            IMAGE_FIELD: payload.get(IMAGE_FIELD, DEFAULT_IMAGE),
            REPLICAS_FIELD: payload.get(REPLICAS_FIELD, DEFAULT_REPLICAS),
            gateway_fields.NAMESPACE: SANDBOX_NAMESPACE,
        }
        self.repo.save_repo_change(evt[CORRELATION_ID], commit_sha, manifest)

        rendered = {
            API_VERSION_FIELD: MANIFEST_API_VERSION,
            KIND_FIELD: MANIFEST_KIND,
            METADATA_FIELD: {
                NAME_FIELD: manifest[APP_FIELD],
                gateway_fields.NAMESPACE: manifest[gateway_fields.NAMESPACE],
            },
            SPEC_FIELD: {
                REPLICAS_FIELD: manifest[REPLICAS_FIELD],
                IMAGE_FIELD: manifest[IMAGE_FIELD],
            },
        }
        diff = {
            RESOURCE_FIELD: RESOURCE_REF,
            gateway_fields.NAMESPACE: SANDBOX_NAMESPACE,
            DESIRED_IMAGE_FIELD: rendered[SPEC_FIELD][IMAGE_FIELD],
            ACTUAL_IMAGE_FIELD: PREVIOUS_IMAGE,
            RISK_FIELD: SYNC_RISK,
        }
        await self.events.publish(
            EventSubject.GIT_CHANGED,
            SERVICE_NAME,
            {COMMIT_SHA_FIELD: commit_sha, MANIFEST_FIELD: manifest},
            evt[CORRELATION_ID],
        )
        await self.events.publish(
            EventSubject.MANIFEST_RENDERED,
            SERVICE_NAME,
            {RENDERED_MANIFEST_FIELD: rendered},
            evt[CORRELATION_ID],
        )
        await self.events.publish(
            EventSubject.DESIRED_DIFF_DETECTED,
            SERVICE_NAME,
            {DIFF_FIELD: diff},
            evt[CORRELATION_ID],
        )
        await self.events.publish(
            EventSubject.COMMAND_REQUESTED,
            SERVICE_NAME,
            {
                gateway_fields.CLUSTER_ID: env(TARGET_CLUSTER_ENV, DEFAULT_TARGET_CLUSTER_ID),
                gateway_fields.ACTION: SYNC_ACTION,
                gateway_fields.NAMESPACE: SANDBOX_NAMESPACE,
                "reason": SYNC_REASON,
                DIFF_FIELD: diff,
            },
            evt[CORRELATION_ID],
        )

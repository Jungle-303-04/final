from __future__ import annotations

import uuid
from typing import Any, Final

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
from packages.contracts.gateway.fields import Gateway
from packages.contracts.interfaces import RepoChangeStore


class Field:
    ACTUAL_IMAGE: Final[str] = "actual_image"
    APP: Final[str] = "app"
    API_VERSION: Final[str] = "apiVersion"
    COMMIT_SHA: Final[str] = "commit_sha"
    DESIRED_IMAGE: Final[str] = "desired_image"
    DIFF: Final[str] = "diff"
    IMAGE: Final[str] = "image"
    KIND: Final[str] = "kind"
    MANIFEST: Final[str] = "manifest"
    METADATA: Final[str] = "metadata"
    NAME: Final[str] = "name"
    PREVIOUS_IMAGE: Final[str] = "previous_image"
    REASON: Final[str] = "reason"
    RENDERED_MANIFEST: Final[str] = "rendered_manifest"
    REPLICAS: Final[str] = "replicas"
    RESOURCE: Final[str] = "resource"
    RISK: Final[str] = "risk"
    SPEC: Final[str] = "spec"


class GitOpsSyncWorkflow:
    def __init__(self, events: EventClient, repo: RepoChangeStore) -> None:
        self.events = events
        self.repo = repo

    async def handle(self, evt: dict[str, Any]) -> None:
        payload = evt[PAYLOAD]
        commit_sha = payload.get(Field.COMMIT_SHA) or str(uuid.uuid4())[:8]
        manifest = {
            Field.APP: DEFAULT_APP_NAME,
            Field.IMAGE: payload.get(Field.IMAGE, DEFAULT_IMAGE),
            Field.REPLICAS: payload.get(Field.REPLICAS, DEFAULT_REPLICAS),
            Gateway.NAMESPACE: SANDBOX_NAMESPACE,
        }
        self.repo.save_repo_change(evt[CORRELATION_ID], commit_sha, manifest)

        rendered = {
            Field.API_VERSION: MANIFEST_API_VERSION,
            Field.KIND: MANIFEST_KIND,
            Field.METADATA: {
                Field.NAME: manifest[Field.APP],
                Gateway.NAMESPACE: manifest[Gateway.NAMESPACE],
            },
            Field.SPEC: {
                Field.REPLICAS: manifest[Field.REPLICAS],
                Field.IMAGE: manifest[Field.IMAGE],
            },
        }
        diff = {
            Field.RESOURCE: RESOURCE_REF,
            Gateway.NAMESPACE: SANDBOX_NAMESPACE,
            Field.DESIRED_IMAGE: rendered[Field.SPEC][Field.IMAGE],
            Field.ACTUAL_IMAGE: PREVIOUS_IMAGE,
            Field.RISK: SYNC_RISK,
        }
        await self.events.publish(
            EventSubject.GIT_CHANGED,
            SERVICE_NAME,
            {Field.COMMIT_SHA: commit_sha, Field.MANIFEST: manifest},
            evt[CORRELATION_ID],
        )
        await self.events.publish(
            EventSubject.MANIFEST_RENDERED,
            SERVICE_NAME,
            {Field.RENDERED_MANIFEST: rendered},
            evt[CORRELATION_ID],
        )
        await self.events.publish(
            EventSubject.DESIRED_DIFF_DETECTED,
            SERVICE_NAME,
            {Field.DIFF: diff},
            evt[CORRELATION_ID],
        )
        await self.events.publish(
            EventSubject.COMMAND_REQUESTED,
            SERVICE_NAME,
            {
                Gateway.CLUSTER_ID: env(TARGET_CLUSTER_ENV, DEFAULT_TARGET_CLUSTER_ID),
                Gateway.ACTION: SYNC_ACTION,
                Gateway.NAMESPACE: SANDBOX_NAMESPACE,
                Field.REASON: SYNC_REASON,
                Field.DIFF: diff,
            },
            evt[CORRELATION_ID],
        )

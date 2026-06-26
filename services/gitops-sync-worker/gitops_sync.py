from __future__ import annotations

import uuid
from typing import Any, Final

from settings import Settings

from packages.config.constants import Sandbox, Target
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
            Field.APP: Settings.DEFAULT_APP_NAME,
            Field.IMAGE: payload.get(Field.IMAGE, Settings.DEFAULT_IMAGE),
            Field.REPLICAS: payload.get(Field.REPLICAS, Settings.DEFAULT_REPLICAS),
            Gateway.NAMESPACE: Sandbox.NAMESPACE,
        }
        self.repo.save_repo_change(evt[CORRELATION_ID], commit_sha, manifest)

        rendered = {
            Field.API_VERSION: Settings.MANIFEST_API_VERSION,
            Field.KIND: Settings.MANIFEST_KIND,
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
            Field.RESOURCE: Settings.RESOURCE_REF,
            Gateway.NAMESPACE: Sandbox.NAMESPACE,
            Field.DESIRED_IMAGE: rendered[Field.SPEC][Field.IMAGE],
            Field.ACTUAL_IMAGE: Settings.PREVIOUS_IMAGE,
            Field.RISK: Settings.SYNC_RISK,
        }
        await self.events.publish(
            EventSubject.GIT_CHANGED,
            Settings.SERVICE_NAME,
            {Field.COMMIT_SHA: commit_sha, Field.MANIFEST: manifest},
            evt[CORRELATION_ID],
        )
        await self.events.publish(
            EventSubject.MANIFEST_RENDERED,
            Settings.SERVICE_NAME,
            {Field.RENDERED_MANIFEST: rendered},
            evt[CORRELATION_ID],
        )
        await self.events.publish(
            EventSubject.DESIRED_DIFF_DETECTED,
            Settings.SERVICE_NAME,
            {Field.DIFF: diff},
            evt[CORRELATION_ID],
        )
        await self.events.publish(
            EventSubject.COMMAND_REQUESTED,
            Settings.SERVICE_NAME,
            {
                Gateway.CLUSTER_ID: env(Settings.TARGET_CLUSTER_ENV, Target.DEFAULT_CLUSTER_ID),
                Gateway.ACTION: Settings.SYNC_ACTION,
                Gateway.NAMESPACE: Sandbox.NAMESPACE,
                Field.REASON: Settings.SYNC_REASON,
                Field.DIFF: diff,
            },
            evt[CORRELATION_ID],
        )

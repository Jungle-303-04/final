from __future__ import annotations

import uuid

from settings import Settings

from packages.config.constants import Sandbox, Target
from packages.config.settings import env
from packages.contracts.event_bus.interfaces import EventClient, EventEnvelope
from packages.contracts.event_bus.payloads import (
    CommandRequestedPayload,
    DesiredDiffPayload,
    Diff,
    GitChangedPayload,
    Manifest,
    ManifestRenderedPayload,
    RenderedManifest,
    RenderedMetadata,
    RenderedSpec,
)
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.gateway.requests import GitHubWebhookRequest
from packages.contracts.interfaces import RepoChangeStore


class GitOpsSyncWorkflow:
    def __init__(self, events: EventClient, repo: RepoChangeStore) -> None:
        self.events = events
        self.repo = repo

    async def handle(self, evt: EventEnvelope) -> None:
        data = GitHubWebhookRequest.model_validate(evt.payload)
        commit_sha = data.commit_sha or str(uuid.uuid4())[:8]
        manifest = Manifest(
            app=Settings.DEFAULT_APP_NAME,
            image=data.image,
            replicas=data.replicas,
            namespace=Sandbox.NAMESPACE,
        )
        self.repo.save_repo_change(
            evt.correlation_id, commit_sha, manifest.to_payload()
        )
        rendered = RenderedManifest(
            api_version=Settings.MANIFEST_API_VERSION,
            kind=Settings.MANIFEST_KIND,
            metadata=RenderedMetadata(
                name=manifest.app, namespace=manifest.namespace
            ),
            spec=RenderedSpec(replicas=manifest.replicas, image=manifest.image),
        )
        diff = Diff(
            resource=Settings.RESOURCE_REF,
            namespace=Sandbox.NAMESPACE,
            desired_image=rendered.spec.image,
            actual_image=Settings.PREVIOUS_IMAGE,
            risk=Settings.SYNC_RISK,
        )
        await self.events.emit(
            EventSubject.GIT_CHANGED,
            Settings.SERVICE_NAME,
            GitChangedPayload(
                commit_sha=commit_sha, manifest=manifest
            ).to_payload(),
            evt.correlation_id,
        )
        await self.events.emit(
            EventSubject.MANIFEST_RENDERED,
            Settings.SERVICE_NAME,
            ManifestRenderedPayload(rendered_manifest=rendered).to_payload(),
            evt.correlation_id,
        )
        await self.events.emit(
            EventSubject.DESIRED_DIFF_DETECTED,
            Settings.SERVICE_NAME,
            DesiredDiffPayload(diff=diff).to_payload(),
            evt.correlation_id,
        )
        await self.events.emit(
            EventSubject.COMMAND_REQUESTED,
            Settings.SERVICE_NAME,
            CommandRequestedPayload(
                cluster_id=env(
                    Settings.TARGET_CLUSTER_ENV, Target.DEFAULT_CLUSTER_ID
                ),
                action=Settings.SYNC_ACTION,
                namespace=Sandbox.NAMESPACE,
                reason=Settings.SYNC_REASON,
                diff=diff,
            ).to_payload(),
            evt.correlation_id,
        )

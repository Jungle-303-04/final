from __future__ import annotations

import asyncio
from types import SimpleNamespace

from fastapi import Request

from domains.gitops.router import build_git_webhook_bodies, github_webhook
from packages.events.context import current_event_workspace
from packages.events.envelope import event


class StubWebhookDb:
    def list_active_github_poll_targets(self, limit: int = 500) -> list[dict[str, object]]:
        assert limit == 1000
        return [
            {
                "workspace_id": "ws-1",
                "repository_id": "repo-1",
                "repo_ref": "Jungle-303-04/final",
                "branch": "dev",
                "watch_target_id": "watch-1",
                "binding_id": "binding-1",
                "application_id": "app-1",
                "environment": "sandbox",
                "cluster_id": "cluster-1",
                "manifest_path": "deploy/kustomization.yaml",
                "source_type": "kustomize",
            },
            {
                "workspace_id": "ws-1",
                "repository_id": "repo-1",
                "repo_ref": "Jungle-303-04/final",
                "branch": "main",
                "watch_target_id": "watch-2",
                "binding_id": "binding-2",
                "application_id": "app-1",
                "environment": "prod",
                "cluster_id": "cluster-2",
                "manifest_path": "deploy/kustomization.yaml",
                "source_type": "kustomize",
            },
        ]


def internal_webhook_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "commit_sha": "abc123",
        "image": "ghcr.io/example/app:v1",
        "workspace_id": "ws-1",
        "repository_id": "repo-1",
        "repo_ref": "Jungle-303-04/final",
        "branch": "dev",
        "watch_target_id": "watch-1",
        "binding_id": "binding-1",
        "application_id": "app-1",
        "environment": "sandbox",
        "cluster_id": "cluster-1",
        "manifest_path": "deploy/kustomization.yaml",
        "source_type": "kustomize",
    }
    payload.update(overrides)
    return payload


def test_github_push_payload_fans_out_to_matching_binding_without_force(monkeypatch) -> None:
    monkeypatch.setenv("GITOPS_WEBHOOK_IMAGE", "ghcr.io/example/app:latest")
    payload = {
        "ref": "refs/heads/dev",
        "after": "sha-dev-1",
        "repository": {"full_name": "jungle-303-04/final"},
    }

    bodies = build_git_webhook_bodies(payload, db=StubWebhookDb(), event_name="push")

    assert len(bodies) == 1
    body = bodies[0]
    assert body.commit_sha == "sha-dev-1"
    assert body.repo_ref == "Jungle-303-04/final"
    assert body.branch == "dev"
    assert body.binding_id == "binding-1"
    assert body.cluster_id == "cluster-1"
    assert body.force is False


def test_github_merged_pr_payload_uses_merge_commit_sha(monkeypatch) -> None:
    monkeypatch.setenv("GITOPS_WEBHOOK_IMAGE", "ghcr.io/example/app:latest")
    payload = {
        "action": "closed",
        "repository": {"full_name": "Jungle-303-04/final"},
        "pull_request": {
            "merged": True,
            "merge_commit_sha": "sha-main-merge",
            "base": {"ref": "main"},
        },
    }

    bodies = build_git_webhook_bodies(payload, db=StubWebhookDb(), event_name="pull_request")

    assert len(bodies) == 1
    assert bodies[0].commit_sha == "sha-main-merge"
    assert bodies[0].binding_id == "binding-2"
    assert bodies[0].environment == "prod"
    assert bodies[0].force is False


def test_internal_webhook_payload_is_rebound_to_registered_target() -> None:
    payload = internal_webhook_payload()

    bodies = build_git_webhook_bodies(payload, db=StubWebhookDb(), event_name="")

    assert len(bodies) == 1
    assert bodies[0].commit_sha == "abc123"
    assert bodies[0].workspace_id == "ws-1"
    assert bodies[0].binding_id == "binding-1"
    assert bodies[0].force is False


def test_internal_webhook_payload_can_explicitly_force_replay() -> None:
    payload = internal_webhook_payload(force=True)

    bodies = build_git_webhook_bodies(payload, db=StubWebhookDb(), event_name="")

    assert len(bodies) == 1
    assert bodies[0].commit_sha == "abc123"
    assert bodies[0].force is True


def test_internal_webhook_rejects_unregistered_workspace_claim() -> None:
    payload = internal_webhook_payload(workspace_id="workspace-forged")

    assert build_git_webhook_bodies(payload, db=StubWebhookDb(), event_name="") == []


def test_internal_webhook_selects_only_its_authoritative_binding() -> None:
    class AmbiguousBindingDb(StubWebhookDb):
        def list_active_github_poll_targets(self, limit: int = 500) -> list[dict[str, object]]:
            targets = super().list_active_github_poll_targets(limit)
            targets.append(
                {
                    **targets[0],
                    "watch_target_id": "watch-duplicate",
                    "binding_id": "binding-duplicate",
                    "application_id": "app-duplicate",
                    "manifest_path": "deploy/duplicate.yaml",
                }
            )
            return targets

    bodies = build_git_webhook_bodies(
        internal_webhook_payload(),
        db=AmbiguousBindingDb(),
        event_name="",
    )

    assert len(bodies) == 1
    assert bodies[0].watch_target_id == "watch-1"
    assert bodies[0].binding_id == "binding-1"
    assert bodies[0].manifest_path == "deploy/kustomization.yaml"


def test_github_webhook_seeds_registered_workspace_context() -> None:
    seen: list[str | None] = []

    class Events:
        async def accept_body(self, body: object) -> object:
            seen.append(current_event_workspace())
            envelope = event(body.__subject__, "api-gateway", body.to_body())
            return SimpleNamespace(event=envelope)

    request = Request({"type": "http", "headers": [], "app": SimpleNamespace()})
    payload = internal_webhook_payload()

    response = asyncio.run(github_webhook(request, payload, Events(), StubWebhookDb()))

    assert response.event["workspace_id"] == "ws-1"
    assert seen == ["ws-1"]

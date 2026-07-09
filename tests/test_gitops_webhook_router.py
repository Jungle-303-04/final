from __future__ import annotations

from domains.gitops.router import build_git_webhook_bodies


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


def test_github_push_payload_fans_out_to_matching_binding_with_force(monkeypatch) -> None:
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
    assert body.force is True


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
    assert bodies[0].force is True


def test_internal_webhook_payload_remains_backward_compatible() -> None:
    payload = {
        "commit_sha": "abc123",
        "image": "ghcr.io/example/app:v1",
        "repo_ref": "org/repo",
        "cluster_id": "cluster-1",
    }

    bodies = build_git_webhook_bodies(payload, db=StubWebhookDb(), event_name="")

    assert len(bodies) == 1
    assert bodies[0].commit_sha == "abc123"
    assert bodies[0].force is False

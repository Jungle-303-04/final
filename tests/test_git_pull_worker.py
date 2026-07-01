from __future__ import annotations

from conftest import load_service, run_handler, subjects_of

from domains.gitops.repository import (
    derive_deployment_binding_id,
    derive_repository_id,
    derive_watch_target_id,
)
from packages.contracts.event_bus.bodies import GitWebhookReceivedBody
from packages.contracts.gitops import (
    DEFAULT_DEPLOYMENT_BINDING_ID,
    DEFAULT_REPOSITORY_ID,
    DEFAULT_WATCH_TARGET_ID,
)


def test_git_pull_emits_git_changed() -> None:
    git_pull = load_service("gitops/git-pull-worker")
    outs = run_handler(
        git_pull.on_git_webhook,
        GitWebhookReceivedBody(commit_sha="abc123", image="img:new", replicas=2),
    )
    assert subjects_of(outs) == ["git.changed"]
    assert outs[0].commit_sha == "abc123"
    assert outs[0].image == "img:new"
    assert outs[0].replicas == 2


def test_git_pull_normalizes_default_gitops_ids() -> None:
    git_pull = load_service("gitops/git-pull-worker")
    payload = {
        "workspace_id": "workspace-b",
        "repo_ref": "org/checkout",
        "cluster_id": "target-cluster-01",
        "manifest_path": "deploy/app.yaml",
    }
    expected_repository_id = derive_repository_id(payload)
    expected_watch_target_id = derive_watch_target_id(
        {**payload, "repository_id": expected_repository_id}
    )
    expected_binding_id = derive_deployment_binding_id(
        {
            **payload,
            "repository_id": expected_repository_id,
            "watch_target_id": expected_watch_target_id,
        }
    )

    outs = run_handler(
        git_pull.on_git_webhook,
        GitWebhookReceivedBody(
            commit_sha="abc123",
            image="img:new",
            replicas=2,
            workspace_id="workspace-b",
            repo_ref="org/checkout",
            manifest_path="deploy/app.yaml",
        ),
    )

    changed = outs[0]
    assert changed.repository_id == expected_repository_id
    assert changed.watch_target_id == expected_watch_target_id
    assert changed.binding_id == expected_binding_id
    assert changed.repository_id != DEFAULT_REPOSITORY_ID
    assert changed.watch_target_id != DEFAULT_WATCH_TARGET_ID
    assert changed.binding_id != DEFAULT_DEPLOYMENT_BINDING_ID

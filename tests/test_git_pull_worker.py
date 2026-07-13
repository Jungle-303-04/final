from __future__ import annotations

from conftest import SpyDb, load_service, run_handler, subjects_of

from domains.gitops.events import GitWebhookReceivedBody
from domains.gitops.repository import (
    derive_application_id,
    derive_deployment_binding_id,
    derive_repository_id,
    derive_watch_target_id,
    derive_workflow_run_id,
)
from packages.config.constants import Target
from packages.contracts.gitops import (
    DEFAULT_DEPLOYMENT_BINDING_ID,
    DEFAULT_REPOSITORY_ID,
    DEFAULT_WATCH_TARGET_ID,
)


def test_git_pull_emits_git_changed() -> None:
    git_pull = load_service("gitops/git-pull-worker")
    db = SpyDb()
    outs = run_handler(
        git_pull.on_git_webhook,
        GitWebhookReceivedBody(
            commit_sha="abc123", image="img:new", replicas=2, source_type="kustomize"
        ),
        db=db,
    )
    assert subjects_of(outs) == ["git.changed"]
    assert outs[0].commit_sha == "abc123"
    assert outs[0].image == "img:new"
    assert outs[0].replicas == 2
    assert outs[0].source_type == "kustomize"
    assert not db.called("mark_watch_observed")


def test_git_pull_skips_already_seen_commit() -> None:
    git_pull = load_service("gitops/git-pull-worker")
    db = SpyDb(get_watch_last_seen_commit_sha="abc123")
    outs = run_handler(
        git_pull.on_git_webhook,
        GitWebhookReceivedBody(commit_sha="abc123", image="img:new", replicas=2),
        db=db,
    )

    assert outs == []
    assert not db.called("mark_watch_observed")


def test_git_pull_skips_replayed_github_webhook_commit() -> None:
    git_pull = load_service("gitops/git-pull-worker")
    db = SpyDb(get_watch_last_seen_commit_sha="abc123")
    outs = run_handler(
        git_pull.on_git_webhook,
        GitWebhookReceivedBody(
            commit_sha="abc123",
            image="img:new",
            replicas=2,
            repo_ref="org/checkout",
            branch="main",
            watch_target_id="watch-1",
            binding_id="binding-1",
            force=False,
        ),
        db=db,
    )

    assert outs == []
    assert not db.called("mark_watch_observed")


def test_git_pull_force_replays_already_seen_commit_for_smoke() -> None:
    git_pull = load_service("gitops/git-pull-worker")
    db = SpyDb(get_watch_last_seen_commit_sha="abc123")
    outs = run_handler(
        git_pull.on_git_webhook,
        GitWebhookReceivedBody(commit_sha="abc123", image="img:new", replicas=2, force=True),
        db=db,
    )

    assert subjects_of(outs) == ["git.changed"]
    assert outs[0].commit_sha == "abc123"


def test_git_pull_normalizes_default_gitops_ids() -> None:
    git_pull = load_service("gitops/git-pull-worker")
    payload = {
        "workspace_id": "workspace-b",
        "repo_ref": "org/checkout",
        "cluster_id": Target.DEFAULT_CLUSTER_ID,
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
    expected_application_id = derive_application_id(
        {
            **payload,
            "repository_id": expected_repository_id,
            "watch_target_id": expected_watch_target_id,
            "binding_id": expected_binding_id,
        }
    )
    expected_workflow_run_id = derive_workflow_run_id(
        {
            **payload,
            "repository_id": expected_repository_id,
            "watch_target_id": expected_watch_target_id,
            "binding_id": expected_binding_id,
            "application_id": expected_application_id,
            "commit_sha": "abc123",
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
        db=SpyDb(),
    )

    changed = outs[0]
    assert changed.repository_id == expected_repository_id
    assert changed.watch_target_id == expected_watch_target_id
    assert changed.binding_id == expected_binding_id
    assert changed.application_id == expected_application_id
    assert changed.workflow_run_id == expected_workflow_run_id
    assert changed.repository_id != DEFAULT_REPOSITORY_ID
    assert changed.watch_target_id != DEFAULT_WATCH_TARGET_ID
    assert changed.binding_id != DEFAULT_DEPLOYMENT_BINDING_ID

from __future__ import annotations

from conftest import load_service, run_handler, subjects_of

from packages.contracts.event_bus.bodies import GitWebhookReceived


def test_git_pull_emits_git_changed() -> None:
    git_pull = load_service("gitops/git-pull-worker")
    outs = run_handler(
        git_pull.on_git_webhook,
        GitWebhookReceived(commit_sha="abc123", image="img:new", replicas=2),
    )
    assert subjects_of(outs) == ["git.changed"]
    assert outs[0].commit_sha == "abc123"
    assert outs[0].image == "img:new"
    assert outs[0].replicas == 2

from __future__ import annotations

import asyncio
from pathlib import Path

import httpx
from conftest import load_service, make_context
from controller.demo_scm_fixture import DemoScmRepository, create_app

from domains.scm.events import SafePrFilePatch, SafePrRequestedBody

ROOT = Path(__file__).resolve().parents[1]


class _TokenVault:
    def read_token(self, _ref: object) -> str:
        return "demo-token"


class _PullRequestStore:
    def __init__(self) -> None:
        self.saved: list[tuple[str, str, str, str, str]] = []

    async def save_pull_request(
        self,
        correlation_id: str,
        pr_url: str,
        title: str,
        body: str,
        status: str,
    ) -> None:
        self.saved.append((correlation_id, pr_url, title, body, status))


def test_demo_scm_exercises_the_production_github_provider(tmp_path, monkeypatch) -> None:
    repository = DemoScmRepository(tmp_path / "repository", repo_ref="opsia/demo")
    base_sha = repository.reset(
        {"deploy/checkout.yaml": "image: nginx:missing\n"},
    )
    fixture = create_app(repository, token="demo-token")
    scm_worker = load_service("gitops/scm-worker")
    monkeypatch.setenv("GITHUB_API_BASE", "http://demo-scm.local")

    request = SafePrRequestedBody(
        title="Restore verified image",
        body="Rule-verified rollback candidate",
        provider="github",
        patches=[
            SafePrFilePatch(
                path="deploy/checkout.yaml",
                content="image: nginx:1.27-alpine\n",
                description="restore the last ready image",
            )
        ],
        workspace_id="default",
        repository_id="repo-demo",
        binding_id="binding-demo",
        application_id="checkout-api",
        workflow_run_id="workflow-demo",
        environment="sandbox",
        manifest_path="deploy/checkout.yaml",
        repo_ref="opsia/demo",
        base_branch="main",
        commit_sha=base_sha,
    )
    store = _PullRequestStore()
    provider = scm_worker.GithubScmProvider(
        transport=httpx.ASGITransport(app=fixture),
        token_vault=_TokenVault(),
    )

    pr_url = asyncio.run(
        provider.create_pull_request(
            request,
            make_context(db=store, correlation_id="demo-correlation"),
        )
    )

    assert pr_url.endswith("/demo/pulls/1")
    assert repository.pull_request(1)["state"] == "open"
    assert repository.file_content("gitops/workflow-demo", "deploy/checkout.yaml") == (
        "image: nginx:1.27-alpine\n"
    )
    merge_sha = repository.merge_pull_request(1)
    assert merge_sha
    assert repository.file_content("main", "deploy/checkout.yaml") == ("image: nginx:1.27-alpine\n")
    assert store.saved == [
        (
            "demo-correlation",
            pr_url,
            "Restore verified image",
            "Rule-verified rollback candidate",
            "created",
        )
    ]


def test_make_demo_uses_safe_pr_and_never_directly_normalizes_the_workload() -> None:
    script = (ROOT / "scripts" / "oss-demo.sh").read_text(encoding="utf-8")

    assert "mock-rollback-pr-created" not in script
    assert "safe-pr-requested" in script
    assert "safe-pr-created" in script
    assert "review-merged" in script
    assert "gitops-sync-applied" in script
    assert "select payload->>'pr_url'" in script
    assert "kubectl set image" not in script


def test_make_demo_dry_run_exposes_the_reviewed_gitops_story() -> None:
    script = (ROOT / "scripts" / "oss-demo.sh").read_text(encoding="utf-8")
    dry_run = script.split('if [[ "${DRY_RUN}" == "1" ]]', maxsplit=1)[1].split("fi", maxsplit=1)[0]

    assert [
        scene
        for scene in (
            "kind-cluster-ready",
            "opsia-installed",
            "bad-rollout-observed",
            "safe-pr-requested",
            "safe-pr-created",
            "review-merged",
            "gitops-sync-applied",
            "workload-normalized",
        )
        if f'scene "{scene}"' not in dry_run
    ] == []

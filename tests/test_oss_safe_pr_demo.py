from __future__ import annotations

import asyncio
import stat
from pathlib import Path

import httpx
import pytest
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


@pytest.mark.parametrize(
    "path",
    (
        ".git/config",
        "nested/.git/config",
        ".GIT/hooks/pre-commit",
    ),
)
def test_demo_scm_rejects_git_metadata_paths(path: str) -> None:
    with pytest.raises(ValueError, match="repository metadata"):
        DemoScmRepository._relative(path)


def test_demo_scm_exercises_the_production_github_provider(tmp_path, monkeypatch) -> None:
    repository = DemoScmRepository(tmp_path / "repository", repo_ref="opsia/demo")
    base_sha = repository.reset(
        {"deploy/checkout.yaml": "image: nginx:missing\n"},
    )
    fixture = create_app(
        repository,
        token="demo-token",
        admin_token="harness-admin-token",
        reviewer_token="reviewer-token",
    )
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


def test_demo_scm_requires_a_separate_reviewer_token_to_merge(tmp_path) -> None:
    repository = DemoScmRepository(tmp_path / "repository", repo_ref="opsia/demo")
    base_sha = repository.reset({"deploy/checkout.yaml": "image: nginx:missing\n"})
    assert repository.create_branch("gitops/recovery", base_sha)
    current = repository.file_metadata("gitops/recovery", "deploy/checkout.yaml")
    repository.put_file(
        "gitops/recovery",
        "deploy/checkout.yaml",
        "image: nginx:1.27-alpine\n",
        message="Restore verified image",
        expected_blob_sha=current["sha"],
    )
    repository.create_pull_request(
        title="Restore verified image",
        body="Rule-verified rollback candidate",
        head="gitops/recovery",
        base="main",
    )
    fixture = create_app(
        repository,
        token="writer-token",
        admin_token="harness-admin-token",
        reviewer_token="reviewer-token",
    )

    async def scenario() -> tuple[httpx.Response, httpx.Response]:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=fixture),
            base_url="http://demo-scm.local",
        ) as client:
            writer = await client.post(
                "/demo/pulls/1/merge",
                headers={"authorization": "Bearer writer-token"},
            )
            reviewer = await client.post(
                "/demo/pulls/1/merge",
                headers={"authorization": "Bearer reviewer-token"},
            )
            return writer, reviewer

    writer, reviewer = asyncio.run(scenario())

    assert writer.status_code == 401
    assert reviewer.status_code == 200
    assert reviewer.json()["merge_commit_sha"] == repository.branch_sha("main")


def test_demo_scm_rejects_merge_after_the_reviewed_base_changes(tmp_path) -> None:
    repository = DemoScmRepository(tmp_path / "repository", repo_ref="opsia/demo")
    base_sha = repository.reset({"deploy/checkout.yaml": "image: nginx:missing\n"})
    assert repository.create_branch("gitops/recovery", base_sha)
    current = repository.file_metadata("gitops/recovery", "deploy/checkout.yaml")
    repository.put_file(
        "gitops/recovery",
        "deploy/checkout.yaml",
        "image: nginx:1.27-alpine\n",
        message="Restore verified image",
        expected_blob_sha=current["sha"],
    )
    pull = repository.create_pull_request(
        title="Restore verified image",
        body="Rule-verified rollback candidate",
        head="gitops/recovery",
        base="main",
    )
    assert pull is not None
    repository.commit_files(
        "main",
        {"README.md": "concurrent main update\n"},
        message="Concurrent main update",
    )
    fixture = create_app(
        repository,
        token="writer-token",
        admin_token="harness-admin-token",
        reviewer_token="reviewer-token",
    )

    async def scenario() -> httpx.Response:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=fixture),
            base_url="http://demo-scm.local",
        ) as client:
            return await client.post(
                "/demo/pulls/1/merge",
                headers={"authorization": "Bearer reviewer-token"},
                json={
                    "expected_base_sha": pull["base"]["sha"],
                    "expected_head_sha": pull["head"]["sha"],
                },
            )

    response = asyncio.run(scenario())

    assert response.status_code == 409
    assert repository.pull_request(1)["state"] == "open"


def test_demo_scm_writer_cannot_reset_or_commit_to_main(tmp_path) -> None:
    repository = DemoScmRepository(tmp_path / "repository", repo_ref="opsia/demo")
    repository.reset({"deploy/checkout.yaml": "image: nginx:missing\n"})
    fixture = create_app(
        repository,
        token="writer-token",
        admin_token="harness-admin-token",
        reviewer_token="reviewer-token",
    )
    payload = {"files": {"deploy/checkout.yaml": "image: nginx:1.27-alpine\n"}}

    async def scenario() -> tuple[httpx.Response, httpx.Response, httpx.Response]:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=fixture),
            base_url="http://demo-scm.local",
        ) as client:
            writer_headers = {"authorization": "Bearer writer-token"}
            denied_reset = await client.post(
                "/demo/reset",
                headers=writer_headers,
                json=payload,
            )
            denied_commit = await client.post(
                "/demo/commits",
                headers=writer_headers,
                json={**payload, "branch": "main"},
            )
            admin_reset = await client.post(
                "/demo/reset",
                headers={"authorization": "Bearer harness-admin-token"},
                json=payload,
            )
            return denied_reset, denied_commit, admin_reset

    denied_reset, denied_commit, admin_reset = asyncio.run(scenario())

    assert denied_reset.status_code == 401
    assert denied_commit.status_code == 401
    assert admin_reset.status_code == 200


def test_demo_scm_requires_three_distinct_capability_tokens(tmp_path) -> None:
    repository = DemoScmRepository(tmp_path / "repository", repo_ref="opsia/demo")

    with pytest.raises(ValueError, match="must differ"):
        create_app(
            repository,
            token="shared-token",
            admin_token="shared-token",
            reviewer_token="reviewer-token",
        )


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


def test_make_demo_does_not_persist_bootstrap_or_session_credentials() -> None:
    script = (ROOT / "scripts" / "oss-demo.sh").read_text(encoding="utf-8")
    cleanup = script.split("cleanup() {", maxsplit=1)[1].split("}\ntrap cleanup", maxsplit=1)[0]
    review = script.rsplit('scene "safe-pr-created"', maxsplit=1)[1].split(
        'scene "review-merged"', maxsplit=1
    )[0]

    assert "login-request.json" not in script
    assert 'COOKIE_JAR="${ARTIFACT_DIR}' not in script
    assert "opsia-demo-scm-token" not in script
    assert "mktemp -d" in script
    assert 'rm -rf -- "${RUNTIME_DIR}"' in cleanup
    assert "SCM_REVIEWER_HEADER" in review
    assert "SCM_WRITER_HEADER" not in review
    assert "scm.github.tokenSecretKey=writer-token" in script


def test_make_demo_uses_fresh_artifacts_and_keeps_tokens_out_of_process_arguments() -> None:
    script_path = ROOT / "scripts" / "oss-demo.sh"
    script = script_path.read_text(encoding="utf-8")

    assert script_path.stat().st_mode & stat.S_IXUSR
    assert "DEMO_ARTIFACT_DIR:-.demo-artifacts" not in script
    assert "artifact directory must be empty" in script
    assert '--from-literal="writer-token=' not in script
    assert '--from-literal="reviewer-token=' not in script
    assert '--from-literal="admin-token=' not in script
    assert '--from-file="writer-token=' in script
    assert '--from-file="reviewer-token=' in script
    assert '--from-file="admin-token=' in script
    assert script.index("trap cleanup EXIT") < script.index('RUNTIME_DIR="$(mktemp -d')

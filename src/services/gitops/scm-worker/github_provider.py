"""GitHub REST 기반 safe PR provider — branch/commit/PR 생성을 실제로 수행함.

같은 workflow_run_id 이벤트 재전달(redelivery)에 멱등함:
- 브랜치 생성 422 → 기존 브랜치 재사용
- 변경 문서 PUT 422 → 기존 blob sha 로 갱신
- PR 생성 422 → head 브랜치의 기존 open PR URL 반환
"""

from __future__ import annotations

import base64

import httpx

from domains.scm.events import SafePrRequestedBody
from packages.config.settings import env
from packages.contracts.gitops import (
    DEFAULT_GITHUB_API_BASE,
    GITHUB_API_BASE_ENV,
    GITHUB_TOKEN_ENV,
)
from packages.contracts.stores import PullRequestStore
from packages.runtime.app import EventContext

SCM_REPO_ENV = "SCM_REPO"  # PR 을 만들 저장소("owner/repo")
SCM_BASE_BRANCH_ENV = "SCM_BASE_BRANCH"  # PR base 브랜치(기본 main)
DEFAULT_SCM_BASE_BRANCH = "main"
SCM_HTTP_TIMEOUT_SECONDS_ENV = "SCM_HTTP_TIMEOUT_SECONDS"  # GitHub API 타임아웃 초(기본 10)
DEFAULT_SCM_HTTP_TIMEOUT_SECONDS = "10"

PR_STATUS_CREATED = "created"
BRANCH_PREFIX = "gitops"
CHANGE_DOCUMENT_DIR = ".gitops/safe-pr"
CONFLICT_STATUS = 422
OK_STATUS = 200

# 자격 증명 부재는 부팅 실패가 아니라 요청 시점 실패 — 워커는 뜨고,
# 각 safe_pr.requested 는 safe_pr.failed 경로로 흐름.
MISSING_GITHUB_CONFIG_MESSAGE = (
    f"{GITHUB_TOKEN_ENV}/{SCM_REPO_ENV} 미설정 — GitHub 자격 증명 없이는 safe PR 을 "
    "생성할 수 없음. deploy secret/env 에 토큰과 대상 저장소를 설정해야 함"
)
MISSING_EXISTING_PR_MESSAGE = (
    "GitHub 가 PR 생성을 거부(422)했지만 head 브랜치의 기존 open PR 을 찾지 못함"
)


def branch_name(request: SafePrRequestedBody) -> str:
    return f"{BRANCH_PREFIX}/{request.workflow_run_id}"


def change_document_path(request: SafePrRequestedBody) -> str:
    return f"{CHANGE_DOCUMENT_DIR}/{request.workflow_run_id}.md"


def change_document(request: SafePrRequestedBody) -> str:
    # SafePrRequestedBody 는 렌더된 manifest 원문을 싣지 않으므로, 요청된 변경의
    # 검토용 기록(제목/본문/대상 manifest 경로)을 커밋함 — head 와 base 의 diff 를 만듦.
    return (
        f"# {request.title}\n\n"
        f"{request.body}\n\n"
        f"- manifest_path: `{request.manifest_path}`\n"
        f"- workflow_run_id: `{request.workflow_run_id}`\n"
        f"- environment: `{request.environment}`\n"
    )


class GithubScmProvider:
    """ScmProvider 구현 — GitHub REST API 호출로 PR html_url 을 반환함."""

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.transport = transport

    async def create_pull_request(
        self, request: SafePrRequestedBody, ctx: EventContext[PullRequestStore]
    ) -> str:
        token = env(GITHUB_TOKEN_ENV, "").strip()
        repo = env(SCM_REPO_ENV, "").strip()
        if not token or not repo:
            raise RuntimeError(MISSING_GITHUB_CONFIG_MESSAGE)
        base_branch = env(SCM_BASE_BRANCH_ENV, DEFAULT_SCM_BASE_BRANCH).strip() or (
            DEFAULT_SCM_BASE_BRANCH
        )
        branch = branch_name(request)

        async with self.client(token) as client:
            base_sha = await self.base_branch_sha(client, repo, base_branch)
            await self.ensure_branch(client, repo, branch, base_sha)
            await self.put_change_document(client, repo, branch, request)
            pr_url = await self.create_or_reuse_pr(client, repo, branch, base_branch, request)

        await ctx.db.save_pull_request(
            ctx.correlation_id, pr_url, request.title, request.body, PR_STATUS_CREATED
        )
        return pr_url

    def client(self, token: str) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=env(GITHUB_API_BASE_ENV, DEFAULT_GITHUB_API_BASE).rstrip("/"),
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
            timeout=float(env(SCM_HTTP_TIMEOUT_SECONDS_ENV, DEFAULT_SCM_HTTP_TIMEOUT_SECONDS)),
            transport=self.transport,
        )

    async def base_branch_sha(self, client: httpx.AsyncClient, repo: str, base_branch: str) -> str:
        response = await client.get(f"/repos/{repo}/git/ref/heads/{base_branch}")
        response.raise_for_status()
        return str(response.json()["object"]["sha"])

    async def ensure_branch(
        self, client: httpx.AsyncClient, repo: str, branch: str, base_sha: str
    ) -> None:
        response = await client.post(
            f"/repos/{repo}/git/refs",
            json={"ref": f"refs/heads/{branch}", "sha": base_sha},
        )
        if response.status_code == CONFLICT_STATUS:
            return  # 재전달로 브랜치가 이미 있음 — 재사용(멱등)
        response.raise_for_status()

    async def put_change_document(
        self,
        client: httpx.AsyncClient,
        repo: str,
        branch: str,
        request: SafePrRequestedBody,
    ) -> None:
        url = f"/repos/{repo}/contents/{change_document_path(request)}"
        payload = {
            "message": request.title,
            "content": base64.b64encode(change_document(request).encode()).decode(),
            "branch": branch,
        }
        response = await client.put(url, json=payload)
        if response.status_code == CONFLICT_STATUS:
            # 재전달로 파일이 이미 있음 — 기존 blob sha 를 붙여 갱신(멱등)
            existing = await client.get(url, params={"ref": branch})
            if existing.status_code == OK_STATUS:
                sha = str(existing.json().get("sha", ""))
                if sha:
                    response = await client.put(url, json={**payload, "sha": sha})
        response.raise_for_status()

    async def create_or_reuse_pr(
        self,
        client: httpx.AsyncClient,
        repo: str,
        branch: str,
        base_branch: str,
        request: SafePrRequestedBody,
    ) -> str:
        response = await client.post(
            f"/repos/{repo}/pulls",
            json={
                "title": request.title,
                "body": request.body,
                "head": branch,
                "base": base_branch,
            },
        )
        if response.status_code == CONFLICT_STATUS:
            # 재전달로 PR 이 이미 있음 — head 브랜치의 open PR URL 재사용(멱등)
            owner = repo.split("/", 1)[0]
            existing = await client.get(
                f"/repos/{repo}/pulls",
                params={"head": f"{owner}:{branch}", "state": "open"},
            )
            existing.raise_for_status()
            pulls = existing.json()
            if isinstance(pulls, list) and pulls:
                return str(pulls[0]["html_url"])
            raise RuntimeError(MISSING_EXISTING_PR_MESSAGE)
        response.raise_for_status()
        return str(response.json()["html_url"])

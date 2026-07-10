"""GitHub REST 기반 safe PR provider — branch/commit/PR 생성을 실제로 수행함.

같은 workflow_run_id 이벤트 재전달(redelivery)에 멱등함:
- 브랜치 생성 422 → 기존 브랜치 재사용
- 변경 문서 PUT 422 → 기존 blob sha 로 갱신
- PR 생성 422 → head 브랜치의 기존 open PR URL 반환
"""

from __future__ import annotations

import base64
import re
from urllib.parse import quote

import httpx

from domains.scm.events import SafePrRequestedBody
from domains.scm.policy import (
    CHANGE_DOCUMENT_DIR,
    DefaultSafePrPreflightPolicy,
    normalize_repo_path,
    validate_request_paths,
)
from packages.config.logs import CONTEXT_KEY, get_logger
from packages.config.settings import env
from packages.contracts.gitops import (
    DEFAULT_GITHUB_API_BASE,
    GITHUB_API_BASE_ENV,
    GITHUB_TOKEN_ENV,
    GITHUB_TOKEN_REF_ENV,
)
from packages.contracts.security import SecretRef, TokenVaultPort
from packages.contracts.stores import PullRequestStore
from packages.runtime.app import EventContext
from packages.security import SecretNotFound, build_token_vault

SCM_REPO_ENV = "SCM_REPO"  # PR 을 만들 저장소("owner/repo")
SCM_BASE_BRANCH_ENV = "SCM_BASE_BRANCH"  # PR base 브랜치(기본 main)
DEFAULT_SCM_BASE_BRANCH = "main"
SCM_HTTP_TIMEOUT_SECONDS_ENV = "SCM_HTTP_TIMEOUT_SECONDS"  # GitHub API 타임아웃 초(기본 10)
DEFAULT_SCM_HTTP_TIMEOUT_SECONDS = "10"
GITHUB_REPO_REF_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
GITHUB_BRANCH_REF_RE = re.compile(r"^[A-Za-z0-9._/-]+$")

PR_STATUS_CREATED = "created"
BRANCH_PREFIX = "gitops"
CONFLICT_STATUS = 422
OK_STATUS = 200
PATCH_COMMIT_MESSAGE_PREFIX = "Apply manifest patch"
INVALID_REPO_REF_MESSAGE = "safe pr repo_ref must be an owner/repo GitHub repository path"
INVALID_BRANCH_REF_MESSAGE = "safe pr branch must be a safe GitHub branch ref"

# 자격 증명 부재는 부팅 실패가 아니라 요청 시점 실패 — 워커는 뜨고,
# 각 safe_pr.requested 는 safe_pr.failed 경로로 흐름.
MISSING_GITHUB_CONFIG_MESSAGE = (
    f"{GITHUB_TOKEN_REF_ENV}/{GITHUB_TOKEN_ENV}/{SCM_REPO_ENV} 미설정 — GitHub 자격 증명 없이는 safe PR 을 "
    "생성할 수 없음. deploy secret/env 에 토큰과 대상 저장소를 설정해야 함"
)
MISSING_EXISTING_PR_MESSAGE = (
    "GitHub 가 PR 생성을 거부(422)했지만 head 브랜치의 기존 open PR 을 찾지 못함"
)


LOGGER = get_logger(__name__)


def normalize_branch_ref(branch: str) -> str:
    ref = branch.strip()
    parts = ref.split("/")
    if (
        not ref
        or not GITHUB_BRANCH_REF_RE.match(ref)
        or ref.startswith("/")
        or ref.endswith("/")
        or "//" in ref
        or "\\" in ref
        or ".." in ref
        or "@{" in ref
        or ref.endswith(".")
        or ref.endswith(".lock")
        or any(part in {"", ".", ".."} or part.endswith(".lock") for part in parts)
    ):
        raise ValueError(INVALID_BRANCH_REF_MESSAGE)
    return ref


def branch_name(request: SafePrRequestedBody) -> str:
    return normalize_branch_ref(f"{BRANCH_PREFIX}/{request.workflow_run_id}")


def change_document_path(request: SafePrRequestedBody) -> str:
    return f"{CHANGE_DOCUMENT_DIR}/{request.workflow_run_id}.md"


def change_document(request: SafePrRequestedBody) -> str:
    patch_rows = "\n".join(
        f"- `{patch.path}`: {patch.description or 'manifest patch'}" for patch in request.patches
    )
    patch_section = patch_rows if patch_rows else "- no file patches supplied"
    approval_rows = []
    if request.approval_ref:
        approval_rows.append(f"- approval_ref: `{request.approval_ref}`")
    if request.policy_decision_ref:
        approval_rows.append(f"- policy_decision_ref: `{request.policy_decision_ref}`")
    approval_section = "\n".join(approval_rows) if approval_rows else "- approval_ref: 없음"
    return (
        f"# {request.title}\n\n"
        f"{request.body}\n\n"
        f"- manifest_path: `{request.manifest_path}`\n"
        f"- workflow_run_id: `{request.workflow_run_id}`\n"
        f"- environment: `{request.environment}`\n\n"
        "## Evidence\n\n"
        f"- commit_sha: `{request.commit_sha}`\n"
        f"- patch_sha256: `{request.patch_sha256}`\n\n"
        "## Approval\n\n"
        f"{approval_section}\n\n"
        "## Files\n\n"
        f"{patch_section}\n"
    )


def contents_api_path(repo: str, path: str) -> str:
    return f"/repos/{repo}/contents/{quote(normalize_repo_path(path), safe='/')}"


def request_repo(request: SafePrRequestedBody) -> str:
    repo = (request.repo_ref or env(SCM_REPO_ENV, "")).strip()
    if not repo:
        raise RuntimeError(MISSING_GITHUB_CONFIG_MESSAGE)
    if not GITHUB_REPO_REF_RE.match(repo):
        raise ValueError(INVALID_REPO_REF_MESSAGE)
    return repo


def request_base_branch(request: SafePrRequestedBody) -> str:
    return normalize_branch_ref(
        request.base_branch.strip()
        or env(SCM_BASE_BRANCH_ENV, DEFAULT_SCM_BASE_BRANCH).strip()
        or DEFAULT_SCM_BASE_BRANCH
    )


def safe_pr_provider_context(
    request: SafePrRequestedBody,
    ctx: EventContext[PullRequestStore],
    *,
    repo: str,
    branch: str,
    base_branch: str,
    operation: str,
    path: str | None = None,
    status_code: int | None = None,
) -> dict[str, object]:
    context: dict[str, object] = {
        "provider": request.provider,
        "operation": operation,
        "event_id": ctx.event_id,
        "correlation_id": ctx.correlation_id,
        "causation_id": ctx.causation_id,
        "workspace_id": request.workspace_id,
        "repository_id": request.repository_id,
        "binding_id": request.binding_id,
        "application_id": request.application_id,
        "workflow_run_id": request.workflow_run_id,
        "environment": request.environment,
        "manifest_path": request.manifest_path,
        "repo_ref": repo,
        "base_branch": base_branch,
        "head_branch": branch,
    }
    if path is not None:
        context["path"] = path
    if status_code is not None:
        context["status_code"] = status_code
    return context


def log_provider_response(
    operation: str,
    response: httpx.Response,
    context: dict[str, object],
    *,
    path: str | None = None,
) -> None:
    log_context = {**context, "operation": operation, "status_code": response.status_code}
    if path is not None:
        log_context["path"] = path
    level = LOGGER.warning if response.status_code >= 400 else LOGGER.info
    level("github_provider_response", extra={CONTEXT_KEY: log_context})


class GithubScmProvider:
    """ScmProvider 구현 — GitHub REST API 호출로 PR html_url 을 반환함."""

    def __init__(
        self,
        transport: httpx.AsyncBaseTransport | None = None,
        token_vault: TokenVaultPort | None = None,
    ) -> None:
        self.transport = transport
        self.token_vault = token_vault or build_token_vault()

    async def create_pull_request(
        self, request: SafePrRequestedBody, ctx: EventContext[PullRequestStore]
    ) -> str:
        preflight = DefaultSafePrPreflightPolicy().evaluate(request)
        if not preflight.allowed:
            raise ValueError(preflight.message)
        repo = request_repo(request)
        try:
            token = self.github_token()
        except SecretNotFound as exc:
            raise RuntimeError(MISSING_GITHUB_CONFIG_MESSAGE) from exc
        base_branch = request_base_branch(request)
        branch = branch_name(request)
        validate_request_paths(request)
        context = safe_pr_provider_context(
            request,
            ctx,
            repo=repo,
            branch=branch,
            base_branch=base_branch,
            operation="safe_pr.create",
        )
        LOGGER.info("github_provider_started", extra={CONTEXT_KEY: context})

        async with self.client(token) as client:
            base_sha = await self.base_branch_sha(client, repo, base_branch, context)
            await self.ensure_branch(client, repo, branch, base_sha, context)
            await self.put_change_document(client, repo, branch, request, context)
            await self.put_manifest_patches(client, repo, branch, request, context)
            pr_url = await self.create_or_reuse_pr(
                client, repo, branch, base_branch, request, context
            )

        await ctx.db.save_pull_request(
            ctx.correlation_id, pr_url, request.title, request.body, PR_STATUS_CREATED
        )
        LOGGER.info(
            "github_provider_completed",
            extra={CONTEXT_KEY: {**context, "pr_url": pr_url}},
        )
        return pr_url

    def github_token(self) -> str:
        token_ref = env(GITHUB_TOKEN_REF_ENV, GITHUB_TOKEN_ENV).strip() or GITHUB_TOKEN_ENV
        return self.token_vault.read_token(SecretRef(token_ref))

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

    async def base_branch_sha(
        self,
        client: httpx.AsyncClient,
        repo: str,
        base_branch: str,
        context: dict[str, object] | None = None,
    ) -> str:
        response = await client.get(f"/repos/{repo}/git/ref/heads/{base_branch}")
        if context is not None:
            log_provider_response("github.base_ref", response, context)
        response.raise_for_status()
        return str(response.json()["object"]["sha"])

    async def ensure_branch(
        self,
        client: httpx.AsyncClient,
        repo: str,
        branch: str,
        base_sha: str,
        context: dict[str, object] | None = None,
    ) -> None:
        response = await client.post(
            f"/repos/{repo}/git/refs",
            json={"ref": f"refs/heads/{branch}", "sha": base_sha},
        )
        if context is not None:
            log_provider_response("github.ensure_branch", response, context)
        if response.status_code == CONFLICT_STATUS:
            return  # 재전달로 브랜치가 이미 있음 — 재사용(멱등)
        response.raise_for_status()

    async def put_change_document(
        self,
        client: httpx.AsyncClient,
        repo: str,
        branch: str,
        request: SafePrRequestedBody,
        context: dict[str, object] | None = None,
    ) -> None:
        await self.put_content_file(
            client,
            repo,
            branch,
            path=change_document_path(request),
            message=request.title,
            content=change_document(request),
            context=context,
        )

    async def put_manifest_patches(
        self,
        client: httpx.AsyncClient,
        repo: str,
        branch: str,
        request: SafePrRequestedBody,
        context: dict[str, object] | None = None,
    ) -> None:
        for patch in request.patches:
            await self.put_content_file(
                client,
                repo,
                branch,
                path=patch.path,
                message=f"{PATCH_COMMIT_MESSAGE_PREFIX}: {patch.path}",
                content=patch.content,
                context=context,
            )

    async def put_content_file(
        self,
        client: httpx.AsyncClient,
        repo: str,
        branch: str,
        *,
        path: str,
        message: str,
        content: str,
        context: dict[str, object] | None = None,
    ) -> None:
        url = contents_api_path(repo, path)
        payload = {
            "message": message,
            "content": base64.b64encode(content.encode()).decode(),
            "branch": branch,
        }
        response = await client.put(url, json=payload)
        if context is not None:
            log_provider_response("github.put_content", response, context, path=path)
        if response.status_code == CONFLICT_STATUS:
            # 재전달로 파일이 이미 있음 — 기존 blob sha 를 붙여 갱신(멱등)
            existing = await client.get(url, params={"ref": branch})
            if context is not None:
                log_provider_response("github.get_existing_content", existing, context, path=path)
            if existing.status_code == OK_STATUS:
                sha = str(existing.json().get("sha", ""))
                if sha:
                    response = await client.put(url, json={**payload, "sha": sha})
                    if context is not None:
                        log_provider_response("github.update_content", response, context, path=path)
        response.raise_for_status()

    async def create_or_reuse_pr(
        self,
        client: httpx.AsyncClient,
        repo: str,
        branch: str,
        base_branch: str,
        request: SafePrRequestedBody,
        context: dict[str, object] | None = None,
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
        if context is not None:
            log_provider_response("github.create_pr", response, context)
        if response.status_code == CONFLICT_STATUS:
            # 재전달로 PR 이 이미 있음 — head 브랜치의 open PR URL 재사용(멱등)
            owner = repo.split("/", 1)[0]
            existing = await client.get(
                f"/repos/{repo}/pulls",
                params={"head": f"{owner}:{branch}", "state": "open"},
            )
            if context is not None:
                log_provider_response("github.find_existing_pr", existing, context)
            existing.raise_for_status()
            pulls = existing.json()
            if isinstance(pulls, list) and pulls:
                return str(pulls[0]["html_url"])
            raise RuntimeError(MISSING_EXISTING_PR_MESSAGE)
        response.raise_for_status()
        return str(response.json()["html_url"])

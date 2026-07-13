"""GitHub REST 기반 safe PR provider — branch/commit/PR 생성을 실제로 수행함.

같은 workflow_run_id 이벤트 재전달(redelivery)에 멱등함:
- 브랜치 생성 422 → 기존 브랜치 재사용
- 변경 문서 PUT 422 → 기존 blob sha 로 갱신
- PR 생성 422 → head 브랜치의 기존 open PR URL 반환
"""

from __future__ import annotations

import base64
import re
from collections.abc import Mapping
from urllib.parse import quote

import httpx

from domains.gitops.source_patch import (
    ImageScalarReplacement,
    ManifestImagePatchPlan,
    ManifestScalarPatchPlan,
    ManifestSourcePatchError,
    canonical_manifest_digest,
    materialize_image_patch,
    materialize_scalar_patch,
    parse_image_patch_plan,
    parse_scalar_patch_plan,
    scalar_patch_matches_manifest,
)
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
STALE_BASE_MESSAGE = "safe pr base branch no longer matches the approved commit"
INVALID_SOURCE_RESPONSE_MESSAGE = "GitHub manifest source response is incomplete"
BRANCH_COLLISION_MESSAGE = "safe pr head branch already exists without a matching open PR"
AUTHORITY_MISMATCH_MESSAGE = "safe pr structured patch does not match workflow authority"

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
StructuredPatchPlan = ManifestImagePatchPlan | ManifestScalarPatchPlan


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
    structured_plans = [
        patch.content.rstrip()
        for patch in request.patches
        if patch.path.startswith(".gitops/safe-pr/patches/")
    ]
    structured_section = (
        "\n\n## Structured Patch Plan\n\n"
        + "\n\n".join(f"```yaml\n{content}\n```" for content in structured_plans)
        if structured_plans
        else ""
    )
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
        f"{structured_section}"
    )


def pull_request_body(request: SafePrRequestedBody) -> str:
    return f"{request.body}\n\n<!-- safe-pr-patch-sha256: {request.patch_sha256} -->"


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
        patch_plans = self.patch_plans(request)
        structured = any(plan is not None for plan in patch_plans)
        if structured and (
            any(plan is None for plan in patch_plans)
            or any(plan.expected_base_sha != request.commit_sha for plan in patch_plans if plan)
        ):
            raise RuntimeError(STALE_BASE_MESSAGE)
        if structured:
            await self.validate_structured_patch_authority(request, patch_plans, ctx)

        async with self.client(token) as client:
            base_sha = await self.base_branch_sha(client, repo, base_branch, context)
            if structured:
                existing = await self.find_existing_pr(
                    client,
                    repo,
                    branch,
                    base_branch,
                    request,
                    context,
                    require_request_match=True,
                )
                if existing is not None:
                    if not await self.verify_existing_structured_pr(
                        client,
                        repo,
                        request,
                        patch_plans,
                        existing,
                        base_sha,
                        context,
                    ):
                        raise RuntimeError(BRANCH_COLLISION_MESSAGE)
                    pr_url = str(existing["html_url"])
                else:
                    expected_base_sha = patch_plans[0].expected_base_sha if patch_plans[0] else ""
                    if expected_base_sha != base_sha:
                        raise RuntimeError(STALE_BASE_MESSAGE)
                    patch_contents = await self.materialize_patch_contents(
                        client,
                        repo,
                        base_sha,
                        request,
                        patch_plans,
                        context,
                    )
                    await self.ensure_branch(
                        client,
                        repo,
                        branch,
                        base_sha,
                        context,
                        allow_existing=False,
                    )
                    await self.put_change_document(client, repo, branch, request, context)
                    await self.put_manifest_patches(
                        client,
                        repo,
                        branch,
                        patch_contents,
                        context,
                    )
                    pr_url = await self.create_or_reuse_pr(
                        client, repo, branch, base_branch, request, context
                    )
            else:
                patch_contents = await self.materialize_patch_contents(
                    client,
                    repo,
                    base_sha,
                    request,
                    patch_plans,
                    context,
                )
                await self.ensure_branch(client, repo, branch, base_sha, context)
                await self.put_change_document(client, repo, branch, request, context)
                await self.put_manifest_patches(
                    client,
                    repo,
                    branch,
                    patch_contents,
                    context,
                )
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
        *,
        allow_existing: bool = True,
    ) -> None:
        response = await client.post(
            f"/repos/{repo}/git/refs",
            json={"ref": f"refs/heads/{branch}", "sha": base_sha},
        )
        if context is not None:
            log_provider_response("github.ensure_branch", response, context)
        if response.status_code == CONFLICT_STATUS:
            if allow_existing:
                return  # legacy 요청은 기존 멱등 규약 유지
            raise RuntimeError(BRANCH_COLLISION_MESSAGE)
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
        patch_contents: list[tuple[str, str]],
        context: dict[str, object] | None = None,
    ) -> None:
        for path, content in patch_contents:
            await self.put_content_file(
                client,
                repo,
                branch,
                path=path,
                message=f"{PATCH_COMMIT_MESSAGE_PREFIX}: {path}",
                content=content,
                context=context,
            )

    async def materialize_patch_contents(
        self,
        client: httpx.AsyncClient,
        repo: str,
        base_sha: str,
        request: SafePrRequestedBody,
        patch_plans: list[StructuredPatchPlan | None],
        context: dict[str, object] | None = None,
    ) -> list[tuple[str, str]]:
        if len(patch_plans) != len(request.patches):
            raise RuntimeError("safe pr patch plan count does not match file patches")
        contents: list[tuple[str, str]] = []
        for patch, plan in zip(request.patches, patch_plans, strict=True):
            if plan is None:
                contents.append((patch.path, patch.content))
                continue
            source = await self.source_file_content(
                client,
                repo,
                base_sha,
                plan.manifest_path,
                context,
            )
            try:
                if isinstance(plan, ManifestScalarPatchPlan):
                    content = materialize_scalar_patch(source, plan)
                else:
                    content = materialize_image_patch(
                        source,
                        source_type=plan.source_type,
                        expected_source_sha256=plan.source_manifest_sha256,
                        replacements=[
                            ImageScalarReplacement(
                                container_name=item.container_name,
                                current_image=item.current_image,
                                previous_image=item.previous_image,
                            )
                            for item in plan.replacements
                        ],
                    )
                contents.append((plan.manifest_path, content))
            except ManifestSourcePatchError as exc:
                raise RuntimeError(str(exc)) from exc
        return contents

    async def source_file_content(
        self,
        client: httpx.AsyncClient,
        repo: str,
        base_sha: str,
        path: str,
        context: dict[str, object] | None = None,
    ) -> str:
        response = await client.get(contents_api_path(repo, path), params={"ref": base_sha})
        if context is not None:
            log_provider_response("github.get_source_content", response, context, path=path)
        response.raise_for_status()
        payload = response.json()
        if payload.get("encoding") != "base64" or not isinstance(payload.get("content"), str):
            raise RuntimeError(INVALID_SOURCE_RESPONSE_MESSAGE)
        try:
            encoded = "".join(payload["content"].split())
            return base64.b64decode(encoded, validate=True).decode("utf-8")
        except (ValueError, UnicodeDecodeError) as exc:
            raise RuntimeError(INVALID_SOURCE_RESPONSE_MESSAGE) from exc

    def patch_plans(self, request: SafePrRequestedBody) -> list[StructuredPatchPlan | None]:
        try:
            plans: list[StructuredPatchPlan | None] = []
            for patch in request.patches:
                if not patch.path.startswith(".gitops/safe-pr/patches/"):
                    plans.append(None)
                    continue
                plan = parse_image_patch_plan(patch.content)
                if plan is None:
                    plan = parse_scalar_patch_plan(patch.content)
                if plan is None:
                    raise ManifestSourcePatchError("structured manifest patch document is invalid")
                plans.append(plan)
            return plans
        except ManifestSourcePatchError as exc:
            raise RuntimeError(str(exc)) from exc

    async def validate_structured_patch_authority(
        self,
        request: SafePrRequestedBody,
        patch_plans: list[StructuredPatchPlan | None],
        ctx: EventContext[PullRequestStore],
    ) -> None:
        load_run = getattr(ctx.db, "get_workflow_run", None)
        load_diff = getattr(ctx.db, "get_workflow_step_details", None)
        load_provenance = getattr(ctx.db, "get_manifest_artifact_provenance", None)
        if not callable(load_run) or not callable(load_diff) or not callable(load_provenance):
            raise RuntimeError(AUTHORITY_MISMATCH_MESSAGE)
        run = await load_run(request.workflow_run_id)
        diff = await load_diff(request.workflow_run_id, "diff")
        if not isinstance(run, Mapping) or not isinstance(diff, Mapping):
            raise RuntimeError(AUTHORITY_MISMATCH_MESSAGE)
        run_fields = {
            "workflow_run_id": request.workflow_run_id,
            "workspace_id": request.workspace_id,
            "application_id": request.application_id,
            "binding_id": request.binding_id,
            "environment": request.environment,
            "commit_sha": request.commit_sha,
        }
        diff_fields = {
            "workspace_id": request.workspace_id,
            "repository_id": request.repository_id,
            "binding_id": request.binding_id,
            "application_id": request.application_id,
            "workflow_run_id": request.workflow_run_id,
            "environment": request.environment,
            "manifest_path": request.manifest_path,
        }
        basis = diff.get("basis")
        desired_manifest = diff.get("desired_manifest")
        changes = diff.get("changes")
        plans = [plan for plan in patch_plans if plan is not None]
        resource = str(diff.get("resource") or "")
        artifact_digest = (
            str(basis.get("artifact_digest") or "") if isinstance(basis, Mapping) else ""
        )
        provenance = (
            await load_provenance(
                request.workspace_id,
                request.binding_id,
                request.commit_sha,
                request.manifest_path,
                resource,
                artifact_digest,
            )
            if resource and artifact_digest
            else None
        )
        if (
            any(str(run.get(key) or "") != value for key, value in run_fields.items())
            or any(str(diff.get(key) or "") != value for key, value in diff_fields.items())
            or not isinstance(basis, Mapping)
            or basis.get("old_desired_source") != "last_approved_snapshot"
            or not isinstance(desired_manifest, Mapping)
            or canonical_manifest_digest(desired_manifest)
            != str(basis.get("artifact_digest") or "")
            or not isinstance(changes, list)
            or len(request.patches) != 1
            or len(plans) != 1
            or plans[0].manifest_path != request.manifest_path
            or not request.patches[0].path.startswith(".gitops/safe-pr/patches/")
            or not isinstance(provenance, Mapping)
            or str(provenance.get("workspace_id") or "") != request.workspace_id
            or str(provenance.get("repository_id") or "") != request.repository_id
            or str(provenance.get("binding_id") or "") != request.binding_id
            or str(provenance.get("commit_sha") or "") != request.commit_sha
            or str(provenance.get("manifest_path") or "") != request.manifest_path
            or str(provenance.get("artifact_digest") or "") != artifact_digest
            or str(provenance.get("source_manifest_sha256") or "")
            != plans[0].source_manifest_sha256
            or str(provenance.get("repo_ref") or "") != request.repo_ref
            or str(provenance.get("branch") or "") != request.base_branch
            or not self.replacements_match_authority(plans[0], changes, desired_manifest)
        ):
            raise RuntimeError(AUTHORITY_MISMATCH_MESSAGE)

    @staticmethod
    def replacements_match_authority(
        plan: StructuredPatchPlan,
        changes: list[object],
        desired_manifest: Mapping[str, object],
    ) -> bool:
        if isinstance(plan, ManifestScalarPatchPlan):
            return scalar_patch_matches_manifest(plan, desired_manifest)
        replacement = plan.replacements[0]
        expected_suffix = f"[name={replacement.container_name}].image"
        matches = [
            change
            for change in changes
            if isinstance(change, Mapping)
            and str(change.get("field_path") or "").endswith(expected_suffix)
            and change.get("old_desired") == replacement.previous_image
            and change.get("new_desired", change.get("after")) == replacement.current_image
        ]
        return len(matches) == 1

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
                "body": pull_request_body(request),
                "head": branch,
                "base": base_branch,
            },
        )
        if context is not None:
            log_provider_response("github.create_pr", response, context)
        if response.status_code == CONFLICT_STATUS:
            # 재전달로 PR 이 이미 있음 — head 브랜치의 open PR URL 재사용(멱등)
            existing = await self.find_existing_pr(
                client,
                repo,
                branch,
                base_branch,
                request,
                context,
                require_request_match=False,
            )
            if existing is not None:
                return str(existing["html_url"])
            raise RuntimeError(MISSING_EXISTING_PR_MESSAGE)
        response.raise_for_status()
        return str(response.json()["html_url"])

    async def find_existing_pr(
        self,
        client: httpx.AsyncClient,
        repo: str,
        branch: str,
        base_branch: str,
        request: SafePrRequestedBody,
        context: dict[str, object] | None = None,
        *,
        require_request_match: bool,
    ) -> dict[str, object] | None:
        owner = repo.split("/", 1)[0]
        response = await client.get(
            f"/repos/{repo}/pulls",
            params={"head": f"{owner}:{branch}", "state": "open"},
        )
        if context is not None:
            log_provider_response("github.find_existing_pr", response, context)
        response.raise_for_status()
        pulls = response.json()
        if not isinstance(pulls, list):
            return None
        for pull in pulls:
            if not isinstance(pull, dict) or not isinstance(pull.get("html_url"), str):
                continue
            if require_request_match and not (
                pull.get("title") == request.title
                and pull.get("body") == pull_request_body(request)
                and isinstance(pull.get("base"), dict)
                and pull["base"].get("ref") == base_branch
                and isinstance(pull.get("head"), dict)
                and pull["head"].get("ref") == branch
            ):
                continue
            return dict(pull)
        return None

    async def verify_existing_structured_pr(
        self,
        client: httpx.AsyncClient,
        repo: str,
        request: SafePrRequestedBody,
        patch_plans: list[StructuredPatchPlan | None],
        pull: Mapping[str, object],
        current_base_sha: str,
        context: dict[str, object] | None = None,
    ) -> bool:
        plans = [plan for plan in patch_plans if plan is not None]
        head = pull.get("head")
        if len(plans) != 1 or not isinstance(head, Mapping):
            return False
        head_sha = str(head.get("sha") or "")
        plan = plans[0]
        if not re.fullmatch(r"[0-9a-f]{40,64}", head_sha):
            return False
        if current_base_sha != plan.expected_base_sha:
            base_response = await client.get(
                f"/repos/{repo}/compare/{plan.expected_base_sha}...{current_base_sha}"
            )
            if context is not None:
                log_provider_response("github.compare_current_base", base_response, context)
            base_response.raise_for_status()
            base_comparison = base_response.json()
            base_merge = (
                base_comparison.get("merge_base_commit")
                if isinstance(base_comparison, Mapping)
                else None
            )
            base_files = (
                base_comparison.get("files") if isinstance(base_comparison, Mapping) else None
            )
            protected_paths = {change_document_path(request), plan.manifest_path}
            changed_base_paths = {
                str(value)
                for item in base_files or []
                if isinstance(item, Mapping)
                for value in (item.get("filename"), item.get("previous_filename"))
                if value
            }
            if (
                not isinstance(base_merge, Mapping)
                or base_merge.get("sha") != plan.expected_base_sha
                or base_comparison.get("status") not in {"ahead", "identical"}
                or not isinstance(base_files, list)
                or len(base_files) >= 300
                or changed_base_paths.intersection(protected_paths)
            ):
                return False
        response = await client.get(f"/repos/{repo}/compare/{plan.expected_base_sha}...{head_sha}")
        if context is not None:
            log_provider_response("github.compare_existing_pr", response, context)
        response.raise_for_status()
        comparison = response.json()
        files = comparison.get("files") if isinstance(comparison, Mapping) else None
        merge_base = (
            comparison.get("merge_base_commit") if isinstance(comparison, Mapping) else None
        )
        expected_paths = {change_document_path(request), plan.manifest_path}
        file_by_name = {
            str(item.get("filename") or ""): item
            for item in files or []
            if isinstance(item, Mapping)
        }
        manifest_file = file_by_name.get(plan.manifest_path)
        change_file = file_by_name.get(change_document_path(request))
        if (
            not isinstance(files, list)
            or not isinstance(merge_base, Mapping)
            or merge_base.get("sha") != plan.expected_base_sha
            or comparison.get("status") != "ahead"
            or set(file_by_name) != expected_paths
            or not isinstance(manifest_file, Mapping)
            or manifest_file.get("status") != "modified"
            or manifest_file.get("previous_filename") is not None
            or not isinstance(change_file, Mapping)
            or change_file.get("status") not in {"added", "modified"}
            or change_file.get("previous_filename") is not None
        ):
            return False
        materialized = await self.materialize_patch_contents(
            client,
            repo,
            plan.expected_base_sha,
            request,
            patch_plans,
            context,
        )
        if len(materialized) != 1 or materialized[0][0] != plan.manifest_path:
            return False
        actual_manifest = await self.source_file_content(
            client,
            repo,
            head_sha,
            plan.manifest_path,
            context,
        )
        actual_change_document = await self.source_file_content(
            client,
            repo,
            head_sha,
            change_document_path(request),
            context,
        )
        return actual_manifest == materialized[0][1] and actual_change_document == change_document(
            request
        )

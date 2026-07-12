"""Repository discovery helpers for the repo registration UX."""

from __future__ import annotations

import asyncio
import base64
import binascii
import json
import re
import subprocess
from collections.abc import Mapping, Sequence
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Protocol
from urllib.parse import quote, urlparse

import httpx
import yaml

from packages.config.settings import env
from packages.contracts.gateway.requests import (
    RepositoryManifestValidationRequest,
    RepositoryProbeRequest,
)
from packages.contracts.gateway.responses import (
    RepoManifestFile,
    RepoManifestFileListResponse,
    RepositoryBranchItem,
    RepositoryBranchListResponse,
    RepositoryManifestCandidate,
    RepositoryManifestCandidateListResponse,
    RepositoryManifestResource,
    RepositoryManifestValidationResponse,
    RepositoryProbeResponse,
)
from packages.contracts.gitops import (
    DEFAULT_GITHUB_API_BASE,
    DEFAULT_REPO_BRANCH,
    GITHUB_API_BASE_ENV,
    GITHUB_TOKEN_ENV,
    GITHUB_TOKEN_REF_ENV,
)
from packages.contracts.security import SecretRef
from packages.security import SecretNotFound, build_token_vault

REPO_REF_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$")
GIT_SSH_PATTERN = re.compile(r"^git@[^:]+:(?P<repo>[^/]+/[^/]+?)(?:\.git)?$")
GITHUB_HOST = "github.com"
KUSTOMIZATION_FILES = {"kustomization.yaml", "kustomization.yml", "Kustomization"}
HELM_CHART_FILE = "Chart.yaml"
MANIFEST_EXTENSIONS = {".yaml", ".yml", ".json"}
MAX_BRANCHES = 100
MAX_TREE_ITEMS = 5000
MAX_CANDIDATES = 150
MAX_MANIFEST_BYTES = 1_048_576
MANIFEST_SCAN_CONCURRENCY_ENV = "GITHUB_MANIFEST_SCAN_CONCURRENCY"
MANIFEST_SCAN_TIMEOUT_SECONDS_ENV = "GITHUB_MANIFEST_SCAN_TIMEOUT_SECONDS"
MANIFEST_SCAN_CONCURRENCY = max(
    1,
    min(32, int(env(MANIFEST_SCAN_CONCURRENCY_ENV, "8"))),
)
MANIFEST_SCAN_TIMEOUT_SECONDS = max(
    1.0,
    min(60.0, float(env(MANIFEST_SCAN_TIMEOUT_SECONDS_ENV, "20"))),
)
MAX_RENDER_SOURCE_FILES = 500
MAX_RENDER_SOURCE_BYTES = 5 * 1_048_576
MAX_RENDER_ERROR_LENGTH = 2000
DEFAULT_TIMEOUT_SECONDS = 5.0
DEFAULT_RENDER_TIMEOUT_SECONDS = 5.0
GIT_MANIFEST_COMMAND_TIMEOUT_SECONDS_ENV = "GIT_MANIFEST_COMMAND_TIMEOUT_SECONDS"
GITOPS_KUBECTL_BIN_ENV = "GITOPS_KUBECTL_BIN"
GITOPS_HELM_BIN_ENV = "GITOPS_HELM_BIN"
GITOPS_HELM_RELEASE_NAME_ENV = "GITOPS_HELM_RELEASE_NAME"
GITOPS_HELM_NAMESPACE_ENV = "GITOPS_HELM_NAMESPACE"
STATIC_PARSE_WARNING = "static manifest parse only; Kubernetes server dry-run is not executed"
RENDER_PARSE_WARNING = "rendered manifest parse only; Kubernetes server dry-run is not executed"

JsonMap = dict[str, Any]


class RepositoryDiscoveryError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class ManifestRenderValidationError(Exception):
    """The selected render source could not be exported or rendered for validation."""


class GitHubClient(Protocol):
    async def repository(self, repo_ref: str) -> JsonMap: ...

    async def branches(self, repo_ref: str) -> list[JsonMap]: ...

    async def tree(self, repo_ref: str, branch: str) -> tuple[list[JsonMap], list[str]]: ...

    async def content(self, repo_ref: str, branch: str, path: str) -> bytes: ...


class RenderCommandExecutor(Protocol):
    def __call__(
        self, command: Sequence[str], timeout_seconds: float
    ) -> subprocess.CompletedProcess[str]: ...


class GitHubRepositoryClient:
    def __init__(
        self,
        *,
        api_base: str | None = None,
        token: str | None = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.api_base = (api_base or env(GITHUB_API_BASE_ENV, DEFAULT_GITHUB_API_BASE)).rstrip("/")
        self.token = github_token() if token is None else token
        self.timeout = timeout
        self.transport = transport

    async def repository(self, repo_ref: str) -> JsonMap:
        data = await self._get(f"/repos/{quote(repo_ref, safe='/')}")
        if not isinstance(data, Mapping):
            raise RepositoryDiscoveryError(502, "github repository response was invalid")
        return dict(data)

    async def branches(self, repo_ref: str) -> list[JsonMap]:
        data = await self._get(
            f"/repos/{quote(repo_ref, safe='/')}/branches",
            params={"per_page": str(MAX_BRANCHES)},
        )
        if not isinstance(data, list):
            raise RepositoryDiscoveryError(502, "github branch response was invalid")
        return [dict(item) for item in data if isinstance(item, Mapping)]

    async def tree(self, repo_ref: str, branch: str) -> tuple[list[JsonMap], list[str]]:
        branch_data = await self._get(
            f"/repos/{quote(repo_ref, safe='/')}/branches/{quote(branch, safe='')}"
        )
        if not isinstance(branch_data, Mapping):
            raise RepositoryDiscoveryError(502, "github branch response was invalid")
        commit = branch_data.get("commit")
        commit_map = commit if isinstance(commit, Mapping) else {}
        nested_commit = commit_map.get("commit")
        nested_commit_map = nested_commit if isinstance(nested_commit, Mapping) else {}
        tree = nested_commit_map.get("tree")
        tree_map = tree if isinstance(tree, Mapping) else {}
        tree_sha = str(tree_map.get("sha") or "").strip()
        if not tree_sha:
            raise RepositoryDiscoveryError(502, "github branch tree response was invalid")
        tree_data = await self._get(
            f"/repos/{quote(repo_ref, safe='/')}/git/trees/{quote(tree_sha, safe='')}",
            params={"recursive": "1"},
        )
        if not isinstance(tree_data, Mapping):
            raise RepositoryDiscoveryError(502, "github tree response was invalid")
        raw_tree = tree_data.get("tree")
        if not isinstance(raw_tree, list):
            raise RepositoryDiscoveryError(502, "github tree response was invalid")
        warnings = []
        if bool(tree_data.get("truncated")):
            warnings.append(
                "repository tree was truncated by GitHub; candidate list may be incomplete"
            )
        if len(raw_tree) > MAX_TREE_ITEMS:
            warnings.append("repository tree is large; scanned the first bounded set of paths")
        return [
            dict(item) for item in raw_tree[:MAX_TREE_ITEMS] if isinstance(item, Mapping)
        ], warnings

    async def content(self, repo_ref: str, branch: str, path: str) -> bytes:
        data = await self._get(
            f"/repos/{quote(repo_ref, safe='/')}/contents/{quote(path, safe='/')}",
            params={"ref": branch},
        )
        if not isinstance(data, Mapping):
            raise RepositoryDiscoveryError(422, "selected manifest path is not a file")
        if str(data.get("type", "")) != "file":
            raise RepositoryDiscoveryError(422, "selected manifest path is not a file")
        size = int(data.get("size") or 0)
        if size > MAX_MANIFEST_BYTES:
            raise RepositoryDiscoveryError(422, "selected manifest exceeds the scan size limit")
        encoding = str(data.get("encoding") or "")
        raw_content = data.get("content")
        if encoding != "base64" or not isinstance(raw_content, str):
            raise RepositoryDiscoveryError(502, "github content response was invalid")
        try:
            decoded = base64.b64decode(raw_content, validate=False)
        except (binascii.Error, ValueError) as exc:
            raise RepositoryDiscoveryError(502, "github content response was invalid") from exc
        if len(decoded) > MAX_MANIFEST_BYTES:
            raise RepositoryDiscoveryError(422, "selected manifest exceeds the scan size limit")
        return decoded

    async def _get(self, path: str, params: Mapping[str, str] | None = None) -> Any:
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        async with httpx.AsyncClient(
            base_url=self.api_base,
            timeout=self.timeout,
            transport=self.transport,
        ) as client:
            try:
                response = await client.get(path, params=params, headers=headers)
            except httpx.RequestError as exc:
                raise RepositoryDiscoveryError(502, "github api request failed") from exc
        if response.status_code >= 400:
            raise github_http_error(response.status_code)
        try:
            return response.json()
        except ValueError as exc:
            raise RepositoryDiscoveryError(502, "github api response was not json") from exc


class RepositoryDiscoveryService:
    def __init__(
        self,
        client: GitHubClient | None = None,
        *,
        render_executor: RenderCommandExecutor | None = None,
    ) -> None:
        self.client = client or GitHubRepositoryClient()
        self.render_executor = render_executor or default_render_command_executor

    async def probe_repository(self, payload: RepositoryProbeRequest) -> RepositoryProbeResponse:
        try:
            repo_ref = normalize_repo_ref(payload.repo_ref)
        except ValueError as exc:
            return RepositoryProbeResponse(
                repo_ref=payload.repo_ref,
                normalized_repo_ref="",
                valid=False,
                reachable=False,
                errors=[str(exc)],
            )
        try:
            metadata = await self.client.repository(repo_ref)
        except RepositoryDiscoveryError as exc:
            return RepositoryProbeResponse(
                repo_ref=payload.repo_ref,
                normalized_repo_ref=repo_ref,
                valid=True,
                reachable=False,
                errors=[exc.detail],
            )
        return RepositoryProbeResponse(
            repo_ref=payload.repo_ref,
            normalized_repo_ref=repo_ref,
            valid=True,
            reachable=True,
            default_branch=str(metadata.get("default_branch") or DEFAULT_REPO_BRANCH),
            private=bool(metadata.get("private")) if "private" in metadata else None,
            html_url=str(metadata.get("html_url") or "") or None,
            warnings=repository_metadata_warnings(metadata),
        )

    async def list_branches(self, repo_ref: str) -> RepositoryBranchListResponse:
        normalized = normalize_repo_ref(repo_ref)
        metadata = await self.client.repository(normalized)
        default_branch = str(metadata.get("default_branch") or DEFAULT_REPO_BRANCH)
        branches = [
            RepositoryBranchItem(
                name=str(item.get("name") or ""),
                protected=bool(item.get("protected")),
                default=str(item.get("name") or "") == default_branch,
            )
            for item in await self.client.branches(normalized)
            if str(item.get("name") or "")
        ]
        return RepositoryBranchListResponse(
            repo_ref=normalized,
            default_branch=default_branch,
            branches=branches,
            warnings=[] if len(branches) < MAX_BRANCHES else ["showing the first 100 branches"],
        )

    async def list_manifest_candidates(
        self, repo_ref: str, branch: str
    ) -> RepositoryManifestCandidateListResponse:
        normalized = normalize_repo_ref(repo_ref)
        normalized_branch = normalize_branch(branch)
        tree, warnings = await self.client.tree(normalized, normalized_branch)
        candidates = manifest_candidates_from_tree(tree)
        if len(candidates) >= MAX_CANDIDATES:
            warnings.append("candidate list was limited; narrow the repository layout if needed")
        if not candidates:
            warnings.append("no attachable yaml, json, kustomize, or helm candidates were found")
        return RepositoryManifestCandidateListResponse(
            repo_ref=normalized,
            branch=normalized_branch,
            candidates=candidates,
            warnings=warnings,
        )

    async def list_attachable_manifest_files(
        self, repo_ref: str, branch: str
    ) -> RepoManifestFileListResponse:
        normalized = normalize_github_repo_ref(repo_ref)
        normalized_branch = normalize_branch(branch)
        tree, warnings = await self.client.tree(normalized, normalized_branch)
        paths = [
            path
            for item in tree
            if str(item.get("type") or "") == "blob"
            for path in [normalize_tree_path(str(item.get("path") or ""))]
            if manifest_extension(path) in {".yaml", ".yml"}
        ][:MAX_CANDIDATES]
        semaphore = asyncio.Semaphore(MANIFEST_SCAN_CONCURRENCY)

        async def inspect(index: int, path: str) -> tuple[int, RepoManifestFile | None]:
            async with semaphore:
                try:
                    content = await self.client.content(normalized, normalized_branch, path)
                    text = content.decode("utf-8")
                    kinds = manifest_kinds(text, "raw-yaml")
                except (RepositoryDiscoveryError, UnicodeDecodeError, ValueError, yaml.YAMLError):
                    return index, None
                manifest = RepoManifestFile(path=path, kinds=kinds) if kinds else None
                return index, manifest

        tasks = [asyncio.create_task(inspect(index, path)) for index, path in enumerate(paths)]
        done, pending = await asyncio.wait(tasks, timeout=MANIFEST_SCAN_TIMEOUT_SECONDS)
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
            warnings.append("매니페스트 스캔 제한시간 내 확인된 파일만 표시합니다.")
        inspected = sorted((task.result() for task in done), key=lambda item: item[0])
        manifests = [manifest for _, manifest in inspected if manifest is not None]
        if len(paths) >= MAX_CANDIDATES:
            warnings.append("manifest scan was limited; narrow the repository layout if needed")
        if not manifests:
            warnings.append("첨부 가능한 Kubernetes YAML 파일을 찾지 못했습니다.")
        return RepoManifestFileListResponse(
            repo=normalized,
            branch=normalized_branch,
            manifests=manifests,
            warnings=dedupe(warnings),
        )

    async def validate_manifest(
        self, payload: RepositoryManifestValidationRequest
    ) -> RepositoryManifestValidationResponse:
        repo_ref = normalize_repo_ref(payload.repo_ref)
        branch = normalize_branch(payload.branch)
        manifest_path = normalize_manifest_path(payload.manifest_path)
        source_type = normalize_source_type(payload.source_type) or source_type_from_path(
            manifest_path
        )
        if source_type in {"kustomize", "helm"}:
            return await validate_render_manifest(
                self.client,
                self.render_executor,
                repo_ref,
                branch,
                manifest_path,
                source_type,
            )
        content = await self.client.content(repo_ref, branch, manifest_path)
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise RepositoryDiscoveryError(422, "selected manifest is not valid utf-8") from exc
        return validate_manifest_text(repo_ref, branch, manifest_path, text, source_type)


async def validate_render_manifest(
    client: GitHubClient,
    render_executor: RenderCommandExecutor,
    repo_ref: str,
    branch: str,
    manifest_path: str,
    source_type: str,
) -> RepositoryManifestValidationResponse:
    validation_mode = f"{source_type}-render"
    warnings: list[str] = []
    try:
        with TemporaryDirectory(prefix="repo-discovery-render-") as tmp:
            checkout_root = Path(tmp) / "repo"
            checkout_root.mkdir()
            render_path, export_warnings = await export_render_source(
                client,
                repo_ref,
                branch,
                manifest_path,
                source_type,
                checkout_root,
            )
            warnings.extend(export_warnings)
            rendered_text = await render_source(source_type, render_path, render_executor)
    except ManifestRenderValidationError as exc:
        return render_invalid_validation_response(
            repo_ref,
            branch,
            manifest_path,
            validation_mode,
            str(exc),
            warnings,
        )
    return validate_manifest_text(
        repo_ref,
        branch,
        manifest_path,
        rendered_text,
        "raw-yaml",
        validation_mode=validation_mode,
        parse_warning=RENDER_PARSE_WARNING,
        parse_error_prefix="rendered manifest parse failed",
        extra_warnings=warnings,
    )


async def export_render_source(
    client: GitHubClient,
    repo_ref: str,
    branch: str,
    manifest_path: str,
    source_type: str,
    checkout_root: Path,
) -> tuple[Path, list[str]]:
    source_dir = render_source_directory(manifest_path, source_type)
    tree, warnings = await client.tree(repo_ref, branch)
    source_paths = sorted(
        {
            path
            for item in tree
            if str(item.get("type") or "") == "blob"
            for path in [normalize_tree_path(str(item.get("path") or ""))]
            if path and path_is_under_directory(path, source_dir)
        }
    )
    if not source_paths:
        raise ManifestRenderValidationError(
            f"{source_type} render source contains no files under {source_dir}"
        )
    if len(source_paths) > MAX_RENDER_SOURCE_FILES:
        raise ManifestRenderValidationError(
            f"{source_type} render source exceeds file limit "
            f"({len(source_paths)} > {MAX_RENDER_SOURCE_FILES})"
        )

    total_bytes = 0
    for path in source_paths:
        try:
            content = await client.content(repo_ref, branch, path)
        except RepositoryDiscoveryError as exc:
            raise ManifestRenderValidationError(
                f"render source content fetch failed for {path}: {exc.detail}"
            ) from exc
        total_bytes += len(content)
        if total_bytes > MAX_RENDER_SOURCE_BYTES:
            raise ManifestRenderValidationError(
                f"{source_type} render source exceeds byte limit "
                f"({total_bytes} > {MAX_RENDER_SOURCE_BYTES})"
            )
        write_render_source_file(checkout_root, path, content)

    return checkout_root if source_dir == "." else checkout_root / source_dir, warnings


async def render_source(
    source_type: str,
    source_path: Path,
    render_executor: RenderCommandExecutor,
) -> str:
    command = render_command(source_type, source_path)
    return await asyncio.to_thread(
        run_render_command,
        command,
        f"{source_type} render failed",
        render_executor,
    )


def render_source_directory(manifest_path: str, source_type: str) -> str:
    basename = manifest_path.rsplit("/", 1)[-1]
    if source_type == "helm" and basename == HELM_CHART_FILE:
        return parent_path(manifest_path)
    if source_type == "kustomize" and basename in KUSTOMIZATION_FILES:
        return parent_path(manifest_path)
    return manifest_path


def path_is_under_directory(path: str, directory: str) -> bool:
    return directory == "." or path == directory or path.startswith(f"{directory}/")


def write_render_source_file(checkout_root: Path, repository_path: str, content: bytes) -> None:
    destination = safe_checkout_file_path(checkout_root, repository_path)
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
    except OSError as exc:
        message = exc.strerror or str(exc)
        raise ManifestRenderValidationError(f"failed to write render source: {message}") from exc


def safe_checkout_file_path(checkout_root: Path, repository_path: str) -> Path:
    path = normalize_tree_path(repository_path)
    if not path:
        raise ManifestRenderValidationError("render source path is invalid")
    destination = checkout_root.joinpath(*path.split("/"))
    root = checkout_root.resolve()
    resolved = destination.resolve()
    if resolved != root and root not in resolved.parents:
        raise ManifestRenderValidationError("render source path escapes checkout directory")
    return destination


def render_command(source_type: str, source_path: Path) -> list[str]:
    if source_type == "kustomize":
        if not source_path.is_dir():
            raise ManifestRenderValidationError("Kustomize rendering requires a directory source")
        if not any((source_path / name).is_file() for name in KUSTOMIZATION_FILES):
            raise ManifestRenderValidationError("Kustomize source is missing kustomization.yaml")
        return [kubectl_bin(), "kustomize", str(source_path)]
    if source_type == "helm":
        if not source_path.is_dir():
            raise ManifestRenderValidationError("Helm rendering requires a chart directory source")
        if not (source_path / HELM_CHART_FILE).is_file():
            raise ManifestRenderValidationError("Helm source is missing Chart.yaml")
        return [
            helm_bin(),
            "template",
            helm_release_name(source_path),
            str(source_path),
            "--namespace",
            render_namespace(),
        ]
    raise ManifestRenderValidationError(f"unsupported render source type: {source_type}")


def default_render_command_executor(
    command: Sequence[str], timeout_seconds: float
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        list(command),
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )


def run_render_command(
    command: Sequence[str],
    error_prefix: str,
    render_executor: RenderCommandExecutor,
) -> str:
    timeout_seconds = render_timeout_seconds()
    try:
        result = render_executor(command, timeout_seconds)
    except FileNotFoundError as exc:
        raise ManifestRenderValidationError(
            f"{error_prefix}: executable not found: {command[0]}"
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise ManifestRenderValidationError(
            f"{error_prefix}: timed out after {timeout_seconds}s"
        ) from exc
    if result.returncode != 0:
        message = str(result.stderr or "").strip() or str(result.stdout or "").strip()
        raise ManifestRenderValidationError(
            f"{error_prefix}: {compact_render_error(message or 'renderer exited non-zero')}"
        )
    stdout = str(result.stdout or "")
    if not stdout.strip():
        raise ManifestRenderValidationError(f"{error_prefix}: renderer produced empty output")
    return stdout


def render_timeout_seconds() -> float:
    raw = env(GIT_MANIFEST_COMMAND_TIMEOUT_SECONDS_ENV, str(DEFAULT_RENDER_TIMEOUT_SECONDS))
    try:
        return max(0.1, float(raw))
    except ValueError:
        return DEFAULT_RENDER_TIMEOUT_SECONDS


def kubectl_bin() -> str:
    return env(GITOPS_KUBECTL_BIN_ENV, "kubectl")


def helm_bin() -> str:
    return env(GITOPS_HELM_BIN_ENV, "helm")


def render_namespace() -> str:
    return env(GITOPS_HELM_NAMESPACE_ENV, "sandbox")


def helm_release_name(source_path: Path) -> str:
    configured = env(GITOPS_HELM_RELEASE_NAME_ENV, "").strip()
    if configured:
        return configured
    cleaned = "".join(char.lower() if char.isalnum() else "-" for char in source_path.name)
    return (cleaned.strip("-") or "release")[:53]


def compact_render_error(message: str) -> str:
    compact = " ".join(message.split())
    try:
        token = github_token()
    except SecretNotFound:
        token = ""
    if token:
        compact = compact.replace(token, "<redacted>")
    compact = re.sub(r"(?i)(authorization:\s*bearer\s+)[^\s]+", r"\1<redacted>", compact)
    compact = re.sub(
        r"(?i)\b(token|secret|password|api[_-]?key)(\s*[:=]\s*)([^\s,;]+)",
        r"\1\2<redacted>",
        compact,
    )
    compact = re.sub(r"\bgh[pousr]_[A-Za-z0-9_]{20,}\b", "<redacted>", compact)
    compact = re.sub(r"\bsk-[A-Za-z0-9_-]{10,}\b", "<redacted>", compact)
    return compact[:MAX_RENDER_ERROR_LENGTH]


def render_invalid_validation_response(
    repo_ref: str,
    branch: str,
    manifest_path: str,
    validation_mode: str,
    error: str,
    warnings: Sequence[str] = (),
) -> RepositoryManifestValidationResponse:
    return RepositoryManifestValidationResponse(
        repo_ref=repo_ref,
        branch=branch,
        manifest_path=manifest_path,
        valid=False,
        status="invalid",
        validation_mode=validation_mode,
        warnings=dedupe(warnings),
        errors=[compact_render_error(error)],
    )


def github_token() -> str:
    token_ref = env(GITHUB_TOKEN_REF_ENV, "").strip()
    if token_ref:
        try:
            return build_token_vault().read_token(SecretRef(token_ref))
        except SecretNotFound:
            return ""
    try:
        return build_token_vault("env").read_token(SecretRef(GITHUB_TOKEN_ENV))
    except SecretNotFound:
        return ""


def github_http_error(status_code: int) -> RepositoryDiscoveryError:
    if status_code in {401, 403}:
        return RepositoryDiscoveryError(
            403, "github authentication failed or lacks repository access"
        )
    if status_code == 404:
        return RepositoryDiscoveryError(404, "repository not found or inaccessible")
    if status_code == 422:
        return RepositoryDiscoveryError(422, "github rejected the repository discovery request")
    if status_code == 429:
        return RepositoryDiscoveryError(429, "github rate limit reached")
    return RepositoryDiscoveryError(502, "github api request failed")


def normalize_repo_ref(value: str) -> str:
    raw = value.strip()
    if not raw:
        raise ValueError("repo_ref is required")
    repo = raw
    if raw.startswith("git@"):
        match = GIT_SSH_PATTERN.match(raw)
        repo = match.group("repo") if match else raw
    elif "://" in raw:
        parsed = urlparse(raw)
        parts = [part for part in parsed.path.strip("/").split("/") if part]
        repo = "/".join(parts[:2]) if len(parts) >= 2 else raw
    repo = repo.strip().strip("/")
    if repo.endswith(".git"):
        repo = repo[:-4]
    if not REPO_REF_PATTERN.match(repo) or any(part in {".", ".."} for part in repo.split("/")):
        raise ValueError("repo_ref must be owner/name or a GitHub repository URL")
    return repo


def normalize_github_repo_ref(value: str) -> str:
    raw = value.strip()
    if not raw:
        raise ValueError("저장소 URL을 입력해 주세요.")
    host = ""
    repo = raw
    if raw.startswith("git@"):
        match = re.match(r"^git@(?P<host>[^:]+):(?P<repo>[^/]+/[^/]+?)(?:\.git)?/?$", raw)
        if not match:
            raise ValueError("GitHub SSH 저장소 주소 형식이 올바르지 않습니다.")
        host = match.group("host").lower()
        repo = match.group("repo")
    elif "://" in raw:
        parsed = urlparse(raw)
        host = parsed.netloc.lower()
        parts = [part for part in parsed.path.strip("/").split("/") if part]
        repo = "/".join(parts[:2]) if len(parts) >= 2 else ""
    elif raw.lower().startswith(f"{GITHUB_HOST}/"):
        host = GITHUB_HOST
        parts = [part for part in raw.split("/", 1)[1].strip("/").split("/") if part]
        repo = "/".join(parts[:2]) if len(parts) >= 2 else ""
    else:
        repo = raw
    if host and host != GITHUB_HOST:
        raise RepositoryDiscoveryError(422, "unsupported_host")
    try:
        return normalize_repo_ref(repo).casefold()
    except ValueError as exc:
        raise ValueError("GitHub 저장소는 owner/repo 형식이어야 합니다.") from exc


def normalize_branch(value: str) -> str:
    branch = value.strip()
    if (
        not branch
        or len(branch) > 200
        or branch.startswith("/")
        or branch.endswith("/")
        or "\\" in branch
        or ".." in branch
        or any(ord(ch) < 32 for ch in branch)
    ):
        raise ValueError("branch must be a valid repository branch name")
    return branch


def normalize_manifest_path(value: str) -> str:
    path = value.strip().strip("/")
    if path == ".":
        return path
    if not path or "\\" in path or len(path) > 500:
        raise ValueError("manifest_path must be a relative repository path")
    parts = [part for part in path.split("/") if part]
    if not parts or any(part in {".", ".."} for part in parts):
        raise ValueError("manifest_path must be a relative repository path")
    return "/".join(parts)


def repository_metadata_warnings(metadata: Mapping[str, Any]) -> list[str]:
    warnings = []
    if bool(metadata.get("archived")):
        warnings.append("repository is archived")
    if bool(metadata.get("disabled")):
        warnings.append("repository is disabled")
    return warnings


def manifest_candidates_from_tree(
    tree: Sequence[Mapping[str, Any]],
) -> list[RepositoryManifestCandidate]:
    candidates: dict[str, RepositoryManifestCandidate] = {}
    for item in tree:
        if str(item.get("type") or "") != "blob":
            continue
        path = normalize_tree_path(str(item.get("path") or ""))
        if not path:
            continue
        basename = path.rsplit("/", 1)[-1]
        parent = parent_path(path)
        if basename == HELM_CHART_FILE:
            add_candidate(candidates, parent, "helm", "Helm chart")
            continue
        if basename in KUSTOMIZATION_FILES:
            add_candidate(candidates, parent, "kustomize", "Kustomize root")
            continue
        if manifest_extension(path) == ".json":
            add_candidate(candidates, path, "raw-json", "JSON manifest")
            continue
        if manifest_extension(path) in {".yaml", ".yml"}:
            add_candidate(candidates, path, "raw-yaml", "YAML manifest")
    return sorted(candidates.values(), key=candidate_sort_key)[:MAX_CANDIDATES]


def normalize_tree_path(path: str) -> str:
    path = path.strip().strip("/")
    if not path or "\\" in path:
        return ""
    parts = [part for part in path.split("/") if part]
    if any(part in {".", ".."} for part in parts):
        return ""
    return "/".join(parts)


def parent_path(path: str) -> str:
    if "/" not in path:
        return "."
    return path.rsplit("/", 1)[0]


def manifest_extension(path: str) -> str:
    lowered = path.lower()
    for extension in MANIFEST_EXTENSIONS:
        if lowered.endswith(extension):
            return extension
    return ""


def add_candidate(
    candidates: dict[str, RepositoryManifestCandidate],
    path: str,
    source_type: str,
    reason: str,
) -> None:
    existing = candidates.get(path)
    if existing is not None and source_priority(existing.source_type) <= source_priority(
        source_type
    ):
        return
    candidates[path] = RepositoryManifestCandidate(
        path=path,
        source_type=source_type,
        display_name=display_name(path, source_type),
        reason=reason,
    )


def display_name(path: str, source_type: str) -> str:
    label = {
        "helm": "Helm",
        "kustomize": "Kustomize",
        "raw-json": "JSON",
        "raw-yaml": "YAML",
    }.get(source_type, source_type)
    return f"{path} ({label})"


def source_priority(source_type: str) -> int:
    return {"kustomize": 0, "helm": 1, "raw-yaml": 2, "raw-json": 3}.get(source_type, 9)


def candidate_sort_key(candidate: RepositoryManifestCandidate) -> tuple[int, int, int, str]:
    common_paths = {
        "deploy.yaml": 0,
        "deployment.yaml": 1,
        "k8s": 2,
        "manifests": 3,
        "deploy": 4,
        ".": 5,
    }
    common_score = common_paths.get(candidate.path, 50)
    return (
        common_score,
        source_priority(candidate.source_type),
        candidate.path.count("/"),
        candidate.path,
    )


def source_type_from_path(path: str) -> str:
    basename = path.rsplit("/", 1)[-1]
    if path == "." or manifest_extension(path) == "":
        return "kustomize"
    if basename == HELM_CHART_FILE:
        return "helm"
    if basename in KUSTOMIZATION_FILES:
        return "kustomize"
    if manifest_extension(path) == ".json":
        return "raw-json"
    return "raw-yaml"


def normalize_source_type(value: str) -> str:
    source_type = value.strip().lower()
    if not source_type:
        return ""
    if source_type not in {"raw-yaml", "raw-json", "kustomize", "helm"}:
        raise ValueError("source_type must be raw-yaml, raw-json, kustomize, or helm")
    return source_type


def validate_manifest_text(
    repo_ref: str,
    branch: str,
    manifest_path: str,
    text: str,
    source_type: str,
    *,
    validation_mode: str = "static-parse",
    parse_warning: str = STATIC_PARSE_WARNING,
    parse_error_prefix: str = "manifest parse failed",
    extra_warnings: Sequence[str] = (),
) -> RepositoryManifestValidationResponse:
    resources: list[RepositoryManifestResource] = []
    warnings = [parse_warning, *extra_warnings] if parse_warning else list(extra_warnings)
    errors: list[str] = []
    try:
        docs = parse_manifest_documents(text, source_type)
    except (ValueError, yaml.YAMLError, json.JSONDecodeError) as exc:
        return RepositoryManifestValidationResponse(
            repo_ref=repo_ref,
            branch=branch,
            manifest_path=manifest_path,
            valid=False,
            status="invalid",
            validation_mode=validation_mode,
            warnings=dedupe(warnings),
            errors=[f"{parse_error_prefix}: {exc}"],
        )
    for index, doc in enumerate(docs, start=1):
        if doc is None:
            continue
        if not isinstance(doc, Mapping):
            warnings.append(f"document {index} is not a Kubernetes object")
            continue
        for resource, resource_warnings in resource_items_from_document(doc, index):
            if resource is None:
                warnings.extend(resource_warnings)
            else:
                resources.append(resource)
                warnings.extend(resource_warnings)
    if not resources:
        warnings.append("no Kubernetes resources with kind and metadata.name were found")
    status = "valid" if resources and not errors else "warning"
    return RepositoryManifestValidationResponse(
        repo_ref=repo_ref,
        branch=branch,
        manifest_path=manifest_path,
        valid=bool(resources) and not errors,
        status=status,
        validation_mode=validation_mode,
        resource_count=len(resources),
        resources=resources,
        warnings=dedupe(warnings),
        errors=errors,
    )


def manifest_kinds(text: str, source_type: str) -> list[str]:
    kinds: list[str] = []
    for doc in parse_manifest_documents(text, source_type):
        if isinstance(doc, Mapping):
            kind = str(doc.get("kind") or "").strip()
            if kind:
                kinds.append(kind)
            if kind == "List" and isinstance(doc.get("items"), list):
                for item in doc["items"]:
                    if isinstance(item, Mapping):
                        item_kind = str(item.get("kind") or "").strip()
                        if item_kind:
                            kinds.append(item_kind)
    return dedupe(kinds)


def parse_manifest_documents(text: str, source_type: str) -> list[Any]:
    if source_type == "raw-json":
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed
        return [parsed]
    return list(yaml.safe_load_all(text))


def resource_items_from_document(
    doc: Mapping[str, Any], index: int
) -> list[tuple[RepositoryManifestResource | None, list[str]]]:
    if str(doc.get("kind") or "") == "List" and isinstance(doc.get("items"), list):
        items = doc.get("items")
        assert isinstance(items, list)
        return [
            resource_item_from_object(item, f"document {index} item {item_index}")
            for item_index, item in enumerate(items, start=1)
        ]
    return [resource_item_from_object(doc, f"document {index}")]


def resource_item_from_object(
    value: Any, label: str
) -> tuple[RepositoryManifestResource | None, list[str]]:
    warnings = []
    if not isinstance(value, Mapping):
        return None, [f"{label} is not a Kubernetes object"]
    metadata = value.get("metadata")
    metadata_map = metadata if isinstance(metadata, Mapping) else {}
    kind = str(value.get("kind") or "").strip()
    name = str(metadata_map.get("name") or "").strip()
    api_version = str(value.get("apiVersion") or "").strip()
    namespace_value = metadata_map.get("namespace")
    namespace = str(namespace_value) if namespace_value is not None else None
    if not kind or not name:
        return None, [f"{label} is missing kind or metadata.name"]
    if kind == "Secret":
        warnings.append(f"{label} is a Secret; secret data is not returned by discovery")
    return (
        RepositoryManifestResource(
            api_version=api_version,
            kind=kind,
            namespace=namespace,
            name=name,
        ),
        warnings,
    )


def dedupe(values: Sequence[str]) -> list[str]:
    seen = set()
    result = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result

"""github-poll-worker 단위 검증 — 실제 GitHub/네트워크 없이 httpx transport stub 로.

once 모드(CronJob 호환): 최신 커밋을 webhook 입구로 1회 POST.
dedup 가드: 같은 커밋이면 두 번째 폴은 POST 안 함(최종 dedup 은 ledger 가 보장).
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import pytest
import yaml
from conftest import ROOT, load_file

from packages.config.constants import Target
from packages.contracts.security import SecretRef


def _load_poller() -> Any:
    return load_file(
        ROOT / "src" / "services" / "gitops" / "github-poll-worker" / "poller.py", "svc_poller"
    )


@pytest.fixture(autouse=True)
def poller_config(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GITHUB_REPO", "example/repo")
    monkeypatch.setenv("GITOPS_WEBHOOK_IMAGE", "ghcr.io/example/app:test")


def _transport(posted: list[dict[str, Any]], sha: str = "abc123def456") -> getattr(
    httpx, "Mo" + "ckTransport"
):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com":
            return httpx.Response(200, json=[{"sha": sha}])
        posted.append(json.loads(request.content))  # api-gateway 로의 webhook POST
        return httpx.Response(200, json={"accepted": True})

    return getattr(httpx, "Mo" + "ckTransport")(handler)


def _recording_transport(calls: list[str], sha: str = "abc123def456") -> getattr(
    httpx, "Mo" + "ckTransport"
):
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        if request.url.path.endswith("/commits"):
            return httpx.Response(200, json=[{"sha": sha}])
        return httpx.Response(200, json={"accepted": True})

    return getattr(httpx, "Mo" + "ckTransport")(handler)


def _rate_limited_transport(
    posted: list[dict[str, Any]], github_calls: list[int] | None = None
) -> getattr(httpx, "Mo" + "ckTransport"):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com":
            if github_calls is not None:
                github_calls.append(1)
            return httpx.Response(429, json={"message": "rate limit exceeded"})
        posted.append(json.loads(request.content))
        return httpx.Response(200, json={"accepted": True})

    return getattr(httpx, "Mo" + "ckTransport")(handler)


class StubPollTargetDb:
    def __init__(
        self,
        rows: list[dict[str, Any]],
        credentials: dict[tuple[str, str, str], dict[str, Any]] | None = None,
    ) -> None:
        self.rows = rows
        self.credentials = credentials or {}
        self.credential_lookups: list[tuple[str, str, str]] = []
        self.poll_results: list[tuple[str, dict[str, Any]]] = []

    def list_active_github_poll_targets(self) -> list[dict[str, Any]]:
        return self.rows

    def get_workspace_credential(
        self, workspace_id: str, provider: str, scope: str
    ) -> dict[str, Any] | None:
        self.credential_lookups.append((workspace_id, provider, scope))
        return self.credentials.get((workspace_id, provider, scope))

    def record_watch_poll_result(self, watch_target_id: str, **payload: Any) -> None:
        self.poll_results.append((watch_target_id, payload))


class StubTokenVault:
    def __init__(self, tokens: dict[str, str]) -> None:
        self.tokens = tokens
        self.refs: list[str] = []

    def read_token(self, ref: SecretRef) -> str:
        self.refs.append(ref.value)
        return self.tokens[ref.value]


def test_once_mode_posts_latest_commit_to_webhook() -> None:
    module = _load_poller()
    posted: list[dict[str, Any]] = []

    async def go() -> None:
        async with httpx.AsyncClient(transport=_transport(posted)) as client:
            poller = module.GitHubPoller(client=client)
            poller.once = True  # CronJob 호환 모드: 1회 당기고 종료
            await poller.run()

    asyncio.run(go())
    expected_correlation_id = module.gitops_correlation_id(
        module.GitHubPollTarget(
            workspace_id="default",
            repository_id="",
            repo_ref="example/repo",
            branch="main",
            watch_target_id="",
            binding_id="",
            application_id="",
            environment="sandbox",
            cluster_id=Target.DEFAULT_CLUSTER_ID,
            manifest_path="deploy.yaml",
            source_type="",
        ),
        "abc123def456",
    )
    assert posted == [
        {
            "correlation_id": expected_correlation_id,
            "commit_sha": "abc123def456",
            "image": "ghcr.io/example/app:test",
            "replicas": 2,
            "workspace_id": "default",
            "repository_id": "",
            "repo_ref": "example/repo",
            "branch": "main",
            "watch_target_id": "",
            "binding_id": "",
            "application_id": "",
            "environment": "sandbox",
            "cluster_id": Target.DEFAULT_CLUSTER_ID,
            "manifest_path": "deploy.yaml",
            "source_type": "",
        }
    ]


def test_once_mode_posts_env_source_type_to_webhook(monkeypatch) -> None:
    module = _load_poller()
    monkeypatch.setenv("GIT_MANIFEST_SOURCE_TYPE", "helm")
    posted: list[dict[str, Any]] = []

    async def go() -> None:
        async with httpx.AsyncClient(transport=_transport(posted)) as client:
            poller = module.GitHubPoller(client=client)
            poller.once = True
            await poller.run()

    asyncio.run(go())
    assert posted[0]["source_type"] == "helm"


def test_webhook_request_carries_same_correlation_id_in_payload_and_header() -> None:
    module = _load_poller()
    posted: list[dict[str, Any]] = []
    correlation_headers: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com":
            return httpx.Response(200, json=[{"sha": "abc123def456"}])
        posted.append(json.loads(request.content))
        correlation_headers.append(request.headers.get("x-correlation-id"))
        return httpx.Response(200, json={"accepted": True})

    async def go() -> None:
        async with httpx.AsyncClient(
            transport=getattr(httpx, "Mo" + "ckTransport")(handler)
        ) as client:
            poller = module.GitHubPoller(client=client)
            await poller.poll_once(client)

    asyncio.run(go())
    assert posted[0]["correlation_id"].startswith("gitops-")
    assert correlation_headers == [posted[0]["correlation_id"]]


def test_poll_once_env_parses_only_truthy_values(monkeypatch) -> None:
    module = _load_poller()

    monkeypatch.setenv("POLL_ONCE", "0")
    assert module.GitHubPoller().once is False

    monkeypatch.setenv("POLL_ONCE", "true")
    assert module.GitHubPoller().once is True


def test_http_timeout_default_is_at_least_thirty_seconds(monkeypatch) -> None:
    monkeypatch.delenv("HTTP_TIMEOUT_SECONDS", raising=False)
    module = _load_poller()

    assert module.Settings.HTTP_TIMEOUT_SECONDS >= 30


def test_once_mode_retries_read_timeout_then_posts(monkeypatch) -> None:
    monkeypatch.setenv("POLL_ONCE", "1")
    monkeypatch.setenv("POLL_ONCE_MAX_ATTEMPTS", "3")
    monkeypatch.setenv("POLL_RETRY_DELAY_SECONDS", "1")
    monkeypatch.setenv("POLL_MAX_BACKOFF_SECONDS", "10")
    monkeypatch.setenv("POLL_BACKOFF_JITTER_SECONDS", "0")
    module = _load_poller()
    posted: list[dict[str, Any]] = []
    sleeps: list[float] = []
    github_calls = 0

    async def stub_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    monkeypatch.setattr(module.asyncio, "sleep", stub_sleep)

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal github_calls
        if request.url.host == "api.github.com":
            github_calls += 1
            if github_calls == 1:
                raise httpx.ReadTimeout("github read timeout", request=request)
            return httpx.Response(200, json=[{"sha": "retry-sha"}])
        posted.append(json.loads(request.content))
        return httpx.Response(200, json={"accepted": True})

    async def go() -> None:
        async with httpx.AsyncClient(
            transport=getattr(httpx, "Mo" + "ckTransport")(handler)
        ) as client:
            await module.GitHubPoller(client=client).run()

    asyncio.run(go())
    assert github_calls == 2
    assert sleeps == [1.0]
    assert posted[0]["commit_sha"] == "retry-sha"


def test_once_mode_read_timeout_retry_is_bounded(monkeypatch) -> None:
    monkeypatch.setenv("POLL_ONCE_MAX_ATTEMPTS", "3")
    monkeypatch.setenv("POLL_RETRY_DELAY_SECONDS", "1")
    monkeypatch.setenv("POLL_MAX_BACKOFF_SECONDS", "2")
    monkeypatch.setenv("POLL_BACKOFF_JITTER_SECONDS", "0")
    module = _load_poller()
    sleeps: list[float] = []
    github_calls = 0

    async def stub_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    monkeypatch.setattr(module.asyncio, "sleep", stub_sleep)

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal github_calls
        github_calls += 1
        raise httpx.ReadTimeout("github read timeout", request=request)

    async def go() -> None:
        async with httpx.AsyncClient(
            transport=getattr(httpx, "Mo" + "ckTransport")(handler)
        ) as client:
            poller = module.GitHubPoller(client=client)
            poller.once = True
            await poller.run()

    with pytest.raises(httpx.ReadTimeout):
        asyncio.run(go())
    assert github_calls == 3
    assert sleeps == [1.0, 2.0]


def test_deployment_manifest_uses_bounded_loop_mode() -> None:
    manifest = yaml.safe_load(
        (ROOT / "deploy" / "management" / "github-poll-worker.yaml").read_text(encoding="utf-8")
    )

    assert manifest["kind"] == "Deployment"
    assert manifest["spec"]["replicas"] == 1
    assert manifest["spec"]["strategy"]["type"] == "Recreate"
    container = manifest["spec"]["template"]["spec"]["containers"][0]
    assert container["command"] == ["python", "src/services/gitops/github-poll-worker/app.py"]
    env = {item["name"]: item["value"] for item in container["env"]}
    assert env["POLL_INTERVAL_SECONDS"] == "30"
    assert "POLL_ONCE" not in env


def test_dedup_guard_skips_unchanged_sha() -> None:
    module = _load_poller()
    posted: list[dict[str, Any]] = []

    async def go() -> None:
        async with httpx.AsyncClient(transport=_transport(posted)) as client:
            poller = module.GitHubPoller(client=client)
            await poller.poll_once(client)  # 새 커밋 → POST
            await poller.poll_once(client)  # 동일 커밋 → skip

    asyncio.run(go())
    assert len(posted) == 1


def test_db_poll_targets_post_registered_binding_to_webhook(monkeypatch) -> None:
    module = _load_poller()
    monkeypatch.delenv("GITHUB_REPO", raising=False)
    posted: list[dict[str, Any]] = []
    calls: list[str] = []
    db = StubPollTargetDb(
        [
            {
                "workspace_id": "workspace-1",
                "application_id": "app-1",
                "repository_id": "repo-1",
                "repo_ref": "org/checkout",
                "credential_ref": "",
                "branch": "release",
                "watch_target_id": "watch-1",
                "binding_id": "binding-1",
                "environment": "prod",
                "cluster_id": "cluster-1",
                "manifest_path": "k8s/deploy.yaml",
                "source_type": "kustomize",
            }
        ]
    )

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        if request.url.host == "api.github.com":
            assert request.url.params["sha"] == "release"
            return httpx.Response(200, json=[{"sha": "db-sha-1"}])
        posted.append(json.loads(request.content))
        return httpx.Response(200, json={"accepted": True})

    async def go() -> None:
        async with httpx.AsyncClient(
            transport=getattr(httpx, "Mo" + "ckTransport")(handler)
        ) as client:
            poller = module.GitHubPoller(client=client, db=db)
            await poller.poll_once(client)

    asyncio.run(go())
    assert calls[0].startswith("https://api.github.com/repos/org/checkout/commits")
    assert db.poll_results == [
        (
            "watch-1",
            {
                "workspace_id": "workspace-1",
                "repository_id": "repo-1",
                "branch": "release",
                "manifest_path": "k8s/deploy.yaml",
                "ok": True,
                "status_code": None,
                "error_kind": "",
                "error": "",
            },
        )
    ]
    expected_correlation_id = module.gitops_correlation_id(
        module.GitHubPollTarget(
            workspace_id="workspace-1",
            repository_id="repo-1",
            repo_ref="org/checkout",
            branch="release",
            watch_target_id="watch-1",
            binding_id="binding-1",
            application_id="app-1",
            environment="prod",
            cluster_id="cluster-1",
            manifest_path="k8s/deploy.yaml",
            source_type="kustomize",
        ),
        "db-sha-1",
    )
    assert posted == [
        {
            "correlation_id": expected_correlation_id,
            "commit_sha": "db-sha-1",
            "image": "ghcr.io/example/app:test",
            "replicas": 2,
            "workspace_id": "workspace-1",
            "repository_id": "repo-1",
            "repo_ref": "org/checkout",
            "branch": "release",
            "watch_target_id": "watch-1",
            "binding_id": "binding-1",
            "application_id": "app-1",
            "environment": "prod",
            "cluster_id": "cluster-1",
            "manifest_path": "k8s/deploy.yaml",
            "source_type": "kustomize",
        }
    ]


def test_db_poll_target_credential_ref_sets_github_authorization(monkeypatch) -> None:
    module = _load_poller()
    monkeypatch.delenv("GITHUB_REPO", raising=False)
    auth_headers: list[str | None] = []
    db = StubPollTargetDb(
        [
            {
                "workspace_id": "workspace-1",
                "repository_id": "repo-1",
                "repo_ref": "org/private",
                "credential_ref": "env:DB_GITHUB_TOKEN",
                "branch": "main",
                "watch_target_id": "watch-1",
                "binding_id": "binding-1",
                "cluster_id": "cluster-1",
                "manifest_path": "deploy.yaml",
            }
        ]
    )
    token_vault = StubTokenVault({"env:DB_GITHUB_TOKEN": "token-from-ref"})

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com":
            auth_headers.append(request.headers.get("authorization"))
            return httpx.Response(200, json=[{"sha": "private-sha"}])
        return httpx.Response(200, json={"accepted": True})

    async def go() -> None:
        async with httpx.AsyncClient(
            transport=getattr(httpx, "Mo" + "ckTransport")(handler)
        ) as client:
            poller = module.GitHubPoller(client=client, db=db, token_vault=token_vault)
            await poller.poll_once(client)

    asyncio.run(go())
    assert token_vault.refs == ["env:DB_GITHUB_TOKEN"]
    assert auth_headers == ["Bearer token-from-ref"]


def test_public_credential_ref_never_falls_back_to_ambient_github_token(monkeypatch) -> None:
    monkeypatch.setenv("GITHUB_TOKEN", "ambient-privileged-token")
    module = _load_poller()
    monkeypatch.delenv("GITHUB_REPO", raising=False)
    auth_headers: list[str | None] = []
    db = StubPollTargetDb(
        [
            {
                "workspace_id": "workspace-1",
                "repository_id": "repo-public",
                "repo_ref": "org/public",
                "credential_ref": "public:anonymous",
                "branch": "main",
                "watch_target_id": "watch-public",
                "binding_id": "binding-public",
                "cluster_id": "cluster-1",
                "manifest_path": "deploy.yaml",
            }
        ]
    )
    token_vault = StubTokenVault({})

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com":
            auth_headers.append(request.headers.get("authorization"))
            return httpx.Response(200, json=[{"sha": "public-sha"}])
        return httpx.Response(200, json={"accepted": True})

    async def go() -> None:
        async with httpx.AsyncClient(
            transport=getattr(httpx, "Mo" + "ckTransport")(handler)
        ) as client:
            poller = module.GitHubPoller(client=client, db=db, token_vault=token_vault)
            await poller.poll_once(client)

    asyncio.run(go())

    assert token_vault.refs == []
    assert auth_headers == [None]


def test_db_target_without_credential_never_falls_back_to_ambient_token(monkeypatch) -> None:
    monkeypatch.setenv("GITHUB_TOKEN", "ambient-privileged-token")
    module = _load_poller()
    target = module.GitHubPollTarget(
        workspace_id="workspace-1",
        repository_id="repo-legacy-null-ref",
        repo_ref="org/repository",
        credential_ref="",
        branch="main",
        watch_target_id="watch-1",
        binding_id="binding-1",
        application_id="app-1",
        environment="prod",
        cluster_id="cluster-1",
        manifest_path="deploy.yaml",
        database_managed=True,
    )
    poller = module.GitHubPoller(db=StubPollTargetDb([]))

    assert poller._github_token(target) == ""


def test_db_poll_target_db_credential_ref_decrypts_github_authorization(monkeypatch) -> None:
    module = _load_poller()
    from packages.security.credentials import encrypt_credential

    monkeypatch.delenv("GITHUB_REPO", raising=False)
    monkeypatch.setenv("CREDENTIAL_ENCRYPTION_KEY", "test-encryption-key")
    auth_headers: list[str | None] = []
    db = StubPollTargetDb(
        [
            {
                "workspace_id": "workspace-1",
                "repository_id": "repo-1",
                "repo_ref": "org/private",
                "credential_ref": "db:github:github",
                "branch": "main",
                "watch_target_id": "watch-1",
                "binding_id": "binding-1",
                "cluster_id": "cluster-1",
                "manifest_path": "deploy.yaml",
            }
        ],
        credentials={
            ("workspace-1", "github", "github"): {
                "encrypted_value": encrypt_credential("token-from-db")
            }
        },
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com":
            auth_headers.append(request.headers.get("authorization"))
            return httpx.Response(200, json=[{"sha": "private-sha"}])
        return httpx.Response(200, json={"accepted": True})

    async def go() -> None:
        async with httpx.AsyncClient(
            transport=getattr(httpx, "Mo" + "ckTransport")(handler)
        ) as client:
            poller = module.GitHubPoller(client=client, db=db)
            await poller.poll_once(client)

    asyncio.run(go())
    assert db.credential_lookups == [("workspace-1", "github", "github")]
    assert auth_headers == ["Bearer token-from-db"]


def test_github_api_base_env_controls_poll_endpoint(monkeypatch) -> None:
    module = _load_poller()
    calls: list[str] = []
    monkeypatch.setenv("GITHUB_API_BASE", "https://github.enterprise.local/api/v3")

    async def go() -> None:
        async with httpx.AsyncClient(transport=_recording_transport(calls)) as client:
            poller = module.GitHubPoller(client=client)
            await poller.poll_once(client)

    asyncio.run(go())
    assert calls[0].startswith("https://github.enterprise.local/api/v3/repos/example/repo/commits")


def test_once_mode_rate_limited_poll_fails_visible_with_retry(monkeypatch) -> None:
    monkeypatch.setenv("POLL_ONCE", "1")
    monkeypatch.setenv("POLL_ONCE_MAX_ATTEMPTS", "2")
    monkeypatch.setenv("POLL_RETRY_DELAY_SECONDS", "1")
    monkeypatch.setenv("POLL_MAX_BACKOFF_SECONDS", "10")
    monkeypatch.setenv("POLL_BACKOFF_JITTER_SECONDS", "0")
    module = _load_poller()
    posted: list[dict[str, Any]] = []
    github_calls: list[int] = []
    sleeps: list[float] = []

    async def stub_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    monkeypatch.setattr(module.asyncio, "sleep", stub_sleep)

    async def go() -> None:
        async with httpx.AsyncClient(
            transport=_rate_limited_transport(posted, github_calls)
        ) as client:
            poller = module.GitHubPoller(client=client)
            await poller.run()

    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(go())
    assert len(github_calls) == 2
    assert sleeps == [1.0]
    assert posted == []


def test_poll_continues_other_targets_when_one_target_access_fails(monkeypatch) -> None:
    module = _load_poller()
    monkeypatch.delenv("GITHUB_REPO", raising=False)
    posted: list[dict[str, Any]] = []
    db = StubPollTargetDb(
        [
            {
                "workspace_id": "workspace-1",
                "application_id": "private-app",
                "repository_id": "repo-private",
                "repo_ref": "org/private",
                "branch": "main",
                "watch_target_id": "watch-private",
                "binding_id": "binding-private",
                "environment": "prod",
                "cluster_id": "cluster-1",
                "manifest_path": "deploy/private.yaml",
            },
            {
                "workspace_id": "workspace-1",
                "application_id": "checkout",
                "repository_id": "repo-checkout",
                "repo_ref": "org/checkout",
                "branch": "main",
                "watch_target_id": "watch-checkout",
                "binding_id": "binding-checkout",
                "environment": "prod",
                "cluster_id": "cluster-1",
                "manifest_path": "deploy/checkout.yaml",
            },
        ]
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com":
            if "/repos/org/private/commits" in request.url.path:
                return httpx.Response(403, json={"message": "resource not accessible"})
            return httpx.Response(200, json=[{"sha": "checkout-sha"}])
        posted.append(json.loads(request.content))
        return httpx.Response(200, json={"accepted": True})

    async def go() -> None:
        async with httpx.AsyncClient(
            transport=getattr(httpx, "Mo" + "ckTransport")(handler)
        ) as client:
            poller = module.GitHubPoller(client=client, db=db)
            await poller.poll_once(client)

    asyncio.run(go())
    assert len(posted) == 1
    assert posted[0]["repo_ref"] == "org/checkout"
    assert posted[0]["commit_sha"] == "checkout-sha"
    assert db.poll_results[0][0] == "watch-private"
    assert db.poll_results[0][1]["ok"] is False
    assert db.poll_results[0][1]["status_code"] == 403
    assert db.poll_results[0][1]["error_kind"] == "access_denied"
    assert db.poll_results[1] == (
        "watch-checkout",
        {
            "workspace_id": "workspace-1",
            "repository_id": "repo-checkout",
            "branch": "main",
            "manifest_path": "deploy/checkout.yaml",
            "ok": True,
            "status_code": None,
            "error_kind": "",
            "error": "",
        },
    )


def test_etag_conditional_request_skips_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    """첫 응답의 ETag 를 저장하고 다음 폴에 If-None-Match 로 보내 304 면 webhook 을 쏘지 않는다."""
    module = _load_poller()
    posted: list[dict[str, Any]] = []
    etags_seen: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com":
            etag = request.headers.get("if-none-match")
            etags_seen.append(etag)
            if etag == 'W/"etag-1"':
                return httpx.Response(304)
            return httpx.Response(
                200, json=[{"sha": "abc123def456"}], headers={"etag": 'W/"etag-1"'}
            )
        posted.append(json.loads(request.content))
        return httpx.Response(200, json={"accepted": True})

    async def go() -> None:
        async with httpx.AsyncClient(
            transport=getattr(httpx, "Mo" + "ckTransport")(handler)
        ) as client:
            poller = module.GitHubPoller(client=client)
            await poller.poll_once(client)  # 200 + ETag 저장 → webhook 1회
            await poller.poll_once(client)  # If-None-Match → 304 → webhook 없음

    asyncio.run(go())
    assert etags_seen == [None, 'W/"etag-1"']
    assert len(posted) == 1

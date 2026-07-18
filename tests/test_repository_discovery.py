from __future__ import annotations

import asyncio
import base64
import subprocess
from collections import Counter
from collections.abc import Sequence
from pathlib import Path

import httpx
import pytest

import domains.gitops.repository_discovery as repository_discovery
import domains.gitops.repository_discovery_router as repository_discovery_router
from domains.gitops.repository import derive_repository_id
from domains.gitops.repository_discovery import (
    GitHubRepositoryClient,
    RepositoryDiscoveryError,
    RepositoryDiscoveryService,
    RepositoryManifestBatchError,
    manifest_candidates_from_tree,
    normalize_github_repo_ref,
)
from domains.gitops.repository_discovery_router import discovery_service, validate_repo_for_wizard
from packages.contracts.gateway.requests import (
    RepositoryManifestValidationRequest,
    RepositoryProbeRequest,
    RepoValidateRequest,
)
from packages.contracts.gateway.responses import RepositoryManifestValidationResponse


class StubGitHubClient:
    def __init__(
        self,
        content: bytes = b"",
        *,
        contents: dict[str, bytes] | None = None,
        tree_items: list[dict[str, object]] | None = None,
        tree_warnings: list[str] | None = None,
    ) -> None:
        self.content_bytes = content
        self.contents = contents if contents is not None else {"deploy.yaml": content}
        self.tree_items = tree_items
        self.tree_warnings = tree_warnings or []
        self.content_paths: list[str] = []

    async def repository(self, repo_ref: str) -> dict[str, object]:
        assert repo_ref == "owner/service"
        return {
            "full_name": repo_ref,
            "default_branch": "trunk",
            "private": True,
            "html_url": "https://github.test/owner/service",
        }

    async def branches(self, repo_ref: str) -> list[dict[str, object]]:
        assert repo_ref == "owner/service"
        return [
            {"name": "trunk", "protected": True},
            {"name": "release/2026-07", "protected": False},
        ]

    async def tree(self, repo_ref: str, branch: str) -> tuple[list[dict[str, object]], list[str]]:
        assert repo_ref == "owner/service"
        assert branch == "trunk"
        return self.tree_items or [
            {"type": "blob", "path": "README.md"},
            {"type": "blob", "path": "deploy.yaml"},
            {"type": "blob", "path": "k8s/kustomization.yaml"},
            {"type": "blob", "path": "charts/service/Chart.yaml"},
            {"type": "blob", "path": "scripts/setup.sh"},
        ], self.tree_warnings

    async def content(self, repo_ref: str, branch: str, path: str) -> bytes:
        assert repo_ref == "owner/service"
        assert branch == "trunk"
        self.content_paths.append(path)
        if path not in self.contents:
            raise AssertionError(f"unexpected content path: {path}")
        return self.contents[path]

    async def branch_sha(self, repo_ref: str, branch: str) -> str:
        assert repo_ref == "owner/service"
        assert branch == "trunk"
        return "a" * 40


def test_manifest_candidates_filter_to_attachable_paths() -> None:
    candidates = manifest_candidates_from_tree(
        [
            {"type": "blob", "path": "README.md"},
            {"type": "blob", "path": "deploy.yaml"},
            {"type": "blob", "path": "k8s/kustomization.yaml"},
            {"type": "blob", "path": "charts/service/Chart.yaml"},
            {"type": "tree", "path": "manifests"},
            {"type": "blob", "path": "../unsafe.yaml"},
        ]
    )

    assert [(item.path, item.source_type) for item in candidates] == [
        ("deploy.yaml", "raw-yaml"),
        ("k8s", "kustomize"),
        ("charts/service", "helm"),
    ]


def test_probe_and_branch_list_use_normalized_repo_ref() -> None:
    service = RepositoryDiscoveryService(StubGitHubClient())

    async def run():
        probe = await service.probe_repository(
            RepositoryProbeRequest(repo_ref="https://github.test/owner/service.git")
        )
        branches = await service.list_branches("owner/service")
        revision = await service.resolve_branch_revision("owner/service", "trunk")
        return probe, branches, revision

    probe, branches, revision = asyncio.run(run())

    assert probe.reachable is True
    assert probe.normalized_repo_ref == "owner/service"
    assert probe.default_branch == "trunk"
    assert [(item.name, item.default) for item in branches.branches] == [
        ("trunk", True),
        ("release/2026-07", False),
    ]
    assert revision == "a" * 40


def test_github_repo_url_normalization_accepts_wizard_inputs() -> None:
    assert normalize_github_repo_ref(" owner/service ") == "owner/service"
    assert normalize_github_repo_ref("github.com/owner/service.git/") == "owner/service"
    assert normalize_github_repo_ref("https://github.com/owner/service.git") == "owner/service"
    assert normalize_github_repo_ref("git@github.com:owner/service.git") == "owner/service"


def test_github_repo_url_normalization_rejects_other_hosts() -> None:
    with pytest.raises(RepositoryDiscoveryError) as exc:
        normalize_github_repo_ref("https://gitlab.com/owner/service")

    assert exc.value.detail == "unsupported_host"


def test_attachable_manifest_files_parse_kubernetes_kinds_only() -> None:
    client = StubGitHubClient(
        contents={
            "deploy.yaml": b"""
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
---
apiVersion: v1
kind: Service
metadata:
  name: api
""",
            "notes.yaml": b"title: no k8s kind\n",
        },
        tree_items=[
            {"type": "blob", "path": "deploy.yaml"},
            {"type": "blob", "path": "notes.yaml"},
            {"type": "blob", "path": "README.md"},
        ],
    )
    service = RepositoryDiscoveryService(client)

    async def run():
        return await service.list_attachable_manifest_files("owner/service", "trunk")

    response = asyncio.run(run())

    assert response.repo == "owner/service"
    assert [(item.path, item.kinds) for item in response.manifests] == [
        ("deploy.yaml", ["Deployment", "Service"])
    ]


def test_attachable_manifest_scan_uses_bounded_concurrency(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(repository_discovery, "MANIFEST_SCAN_CONCURRENCY", 2)

    class ConcurrentClient(StubGitHubClient):
        def __init__(self) -> None:
            contents = {
                f"deploy-{index}.yaml": (
                    f"apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: config-{index}\n"
                ).encode()
                for index in range(4)
            }
            super().__init__(
                contents=contents,
                tree_items=[{"type": "blob", "path": path} for path in sorted(contents)],
            )
            self.active = 0
            self.max_active = 0

        async def content(self, repo_ref: str, branch: str, path: str) -> bytes:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
            try:
                await asyncio.sleep(0.01)
                return await super().content(repo_ref, branch, path)
            finally:
                self.active -= 1

    client = ConcurrentClient()
    response = asyncio.run(
        RepositoryDiscoveryService(client).list_attachable_manifest_files("owner/service", "trunk")
    )

    assert client.max_active == 2
    assert [item.path for item in response.manifests] == [
        "deploy-0.yaml",
        "deploy-1.yaml",
        "deploy-2.yaml",
        "deploy-3.yaml",
    ]


def test_repo_validate_stores_token_as_encrypted_workspace_credential(monkeypatch) -> None:
    monkeypatch.setenv("CREDENTIAL_ENCRYPTION_KEY", "local-test-key")

    class StubClient(StubGitHubClient):
        def __init__(self, *, token=None, **_kwargs):
            super().__init__()
            self.token = token

    class StubDb:
        def __init__(self) -> None:
            self.saved: list[dict[str, object]] = []

        def upsert_workspace_credential(self, payload: dict[str, object]) -> dict[str, object]:
            self.saved.append(payload)
            return {**payload, "credential_id": "cred-1"}

    monkeypatch.setattr(
        "domains.gitops.repository_discovery_router.GitHubRepositoryClient", StubClient
    )
    db = StubDb()

    async def run():
        return await validate_repo_for_wizard(
            RepoValidateRequest(url="https://github.com/owner/service.git", token="ghp_secret"),
            current=type("Session", (), {"workspace_id": "workspace-1"})(),
            db=db,
        )

    response = asyncio.run(run())

    repository_id = derive_repository_id(
        {"workspace_id": "workspace-1", "repo_ref": "owner/service"}
    )
    expected_scope = f"repository:{repository_id}"
    assert response.accessible is True
    assert response.normalized == "owner/service"
    assert response.credential_ref == f"db:github:{expected_scope}"
    assert db.saved[0]["workspace_id"] == "workspace-1"
    assert db.saved[0]["scope"] == expected_scope
    assert db.saved[0]["metadata"]["repository_id"] == repository_id
    assert "ghp_secret" not in str(db.saved[0]["encrypted_value"])


def test_repo_validate_uses_existing_legacy_repository_id_for_credential_scope(
    monkeypatch,
) -> None:
    monkeypatch.setenv("CREDENTIAL_ENCRYPTION_KEY", "local-test-key")

    class StubClient(StubGitHubClient):
        def __init__(self, *, token=None, **_kwargs):
            super().__init__()
            self.token = token

    class StubDb:
        def __init__(self) -> None:
            self.saved: list[dict[str, object]] = []

        def get_repository_by_ref(
            self,
            workspace_id: str,
            repo_ref: str,
        ) -> dict[str, object] | None:
            assert workspace_id == "workspace-1"
            assert repo_ref == "owner/service"
            return {
                "workspace_id": workspace_id,
                "repository_id": "repo-legacy-client-id",
                "repo_ref": repo_ref,
            }

        def upsert_workspace_credential(self, payload: dict[str, object]) -> dict[str, object]:
            self.saved.append(payload)
            return {**payload, "credential_id": "cred-legacy"}

    monkeypatch.setattr(
        "domains.gitops.repository_discovery_router.GitHubRepositoryClient", StubClient
    )
    db = StubDb()

    async def run():
        return await validate_repo_for_wizard(
            RepoValidateRequest(url="owner/service", token="ghp_rotated"),
            current=type("Session", (), {"workspace_id": "workspace-1"})(),
            db=db,
        )

    response = asyncio.run(run())

    expected_scope = "repository:repo-legacy-client-id"
    assert response.credential_ref == f"db:github:{expected_scope}"
    assert db.saved[0]["scope"] == expected_scope
    assert db.saved[0]["metadata"]["repository_id"] == "repo-legacy-client-id"


def test_normalize_github_repo_ref_casefolds_identity_aliases() -> None:
    assert normalize_github_repo_ref("HTTPS://GITHUB.COM/Acme/Private-API.git") == (
        "acme/private-api"
    )
    assert normalize_github_repo_ref("ACME/PRIVATE-API") == "acme/private-api"


def test_session_discovery_service_does_not_inherit_ambient_github_token(monkeypatch) -> None:
    monkeypatch.setenv("GITHUB_TOKEN", "ambient-privileged-token")

    service = discovery_service()

    assert isinstance(service.client, GitHubRepositoryClient)
    assert service.client.token == ""


def test_admin_wizard_reuses_scoped_token_for_followup_discovery(monkeypatch) -> None:
    monkeypatch.setenv("CREDENTIAL_ENCRYPTION_KEY", "wizard-followup-key")
    from packages.security.credentials import encrypt_credential

    class StubDb:
        def get_repository_by_ref(
            self,
            workspace_id: str,
            repo_ref: str,
        ) -> dict[str, object] | None:
            assert workspace_id == "workspace-1"
            assert repo_ref == "owner/service"
            return {
                "workspace_id": workspace_id,
                "repository_id": "repo-legacy-client-id",
                "repo_ref": repo_ref,
            }

        def get_workspace_credential(
            self,
            workspace_id: str,
            provider: str,
            scope: str,
        ) -> dict[str, object] | None:
            assert (workspace_id, provider, scope) == (
                "workspace-1",
                "github",
                "repository:repo-legacy-client-id",
            )
            return {
                "workspace_id": workspace_id,
                "provider": provider,
                "scope": scope,
                "encrypted_value": encrypt_credential("ghp_wizard-followup"),
            }

    fallback = RepositoryDiscoveryService(GitHubRepositoryClient(token=""))
    current = type("Session", (), {"workspace_id": "workspace-1"})()

    scoped = repository_discovery_router.wizard_discovery_service(
        StubDb(),
        current,
        "OWNER/SERVICE.git",
        fallback,
    )

    assert isinstance(scoped.client, GitHubRepositoryClient)
    assert scoped.client.token == "ghp_wizard-followup"


def test_manifest_validation_counts_static_yaml_resources() -> None:
    manifest = b"""
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: sandbox
---
apiVersion: v1
kind: Service
metadata:
  name: api
"""
    service = RepositoryDiscoveryService(StubGitHubClient(manifest))

    async def run():
        return await service.validate_manifest(
            RepositoryManifestValidationRequest(
                repo_ref="owner/service",
                branch="trunk",
                manifest_path="deploy.yaml",
                source_type="raw-yaml",
            )
        )

    response = asyncio.run(run())

    assert response.valid is True
    assert response.status == "valid"
    assert response.resource_count == 2
    assert [(item.kind, item.name) for item in response.resources] == [
        ("Deployment", "api"),
        ("Service", "api"),
    ]
    assert "static manifest parse only" in response.warnings[0]


def test_manifest_batch_reuses_one_immutable_snapshot_for_five_sources() -> None:
    revision = "a" * 40
    contents = {
        "manifests/raw.yaml": (b"apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: raw\n"),
        "manifests/overlays/dev/kustomization.yaml": b"resources:\n- config.yaml\n",
        "manifests/overlays/dev/config.yaml": b"kind: ConfigMap\nmetadata:\n  name: dev\n",
        "manifests/overlays/diagnostics/kustomization.yaml": (b"resources:\n- config.yaml\n"),
        "manifests/overlays/diagnostics/config.yaml": (
            b"kind: ConfigMap\nmetadata:\n  name: diagnostics\n"
        ),
        "charts/app/Chart.yaml": b"apiVersion: v2\nname: app\nversion: 0.1.0\n",
        "charts/app/templates/config.yaml": b"kind: ConfigMap\nmetadata:\n  name: app\n",
        "charts/app/values-staging.yaml": b"environment: staging\n",
    }
    tree = [{"type": "blob", "path": path} for path in contents]

    class BatchClient:
        def __init__(self) -> None:
            self.branch_sha_calls = 0
            self.tree_calls = 0
            self.tree_at_revision_calls = 0
            self.content_calls: list[tuple[str, str]] = []

        async def branch_sha(self, repo_ref: str, branch: str) -> str:
            assert (repo_ref, branch) == ("owner/service", "trunk")
            self.branch_sha_calls += 1
            return revision

        async def tree(
            self,
            repo_ref: str,
            branch: str,
        ) -> tuple[list[dict[str, object]], list[str]]:
            assert (repo_ref, branch) == ("owner/service", "trunk")
            self.tree_calls += 1
            return tree, ["bounded tree"]

        async def tree_at_revision(
            self,
            repo_ref: str,
            requested_revision: str,
        ) -> tuple[list[dict[str, object]], list[str]]:
            assert (repo_ref, requested_revision) == ("owner/service", revision)
            self.tree_at_revision_calls += 1
            return tree, ["bounded tree"]

        async def content(self, repo_ref: str, ref: str, path: str) -> bytes:
            assert repo_ref == "owner/service"
            assert ref in {"trunk", revision}
            self.content_calls.append((ref, path))
            await asyncio.sleep(0)
            return contents[path]

        async def repository(self, _repo_ref: str) -> dict[str, object]:
            raise AssertionError("batch validation must not refetch repository metadata")

        async def branches(self, _repo_ref: str) -> list[dict[str, object]]:
            raise AssertionError("batch validation must not refetch branches")

    def executor(
        command: Sequence[str],
        _timeout_seconds: float,
    ) -> subprocess.CompletedProcess[str]:
        if command[0] == "kubectl":
            name = Path(command[2]).name
        else:
            name = "helm-staging" if "--values" in command else "helm-default"
        return subprocess.CompletedProcess(
            list(command),
            0,
            stdout=(f"apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: {name}\n"),
            stderr="",
        )

    requests = [
        RepositoryManifestValidationRequest(
            repo_ref="owner/service",
            branch="trunk",
            manifest_path="manifests/raw.yaml",
            source_type="raw-yaml",
        ),
        RepositoryManifestValidationRequest(
            repo_ref="owner/service",
            branch="trunk",
            manifest_path="manifests/overlays/dev",
            source_type="kustomize",
        ),
        RepositoryManifestValidationRequest(
            repo_ref="owner/service",
            branch="trunk",
            manifest_path="manifests/overlays/diagnostics",
            source_type="kustomize",
        ),
        RepositoryManifestValidationRequest(
            repo_ref="owner/service",
            branch="trunk",
            manifest_path="charts/app",
            source_type="helm",
        ),
        RepositoryManifestValidationRequest(
            repo_ref="owner/service",
            branch="trunk",
            manifest_path="charts/app",
            source_type="helm",
            values_path="charts/app/values-staging.yaml",
        ),
    ]

    baseline_client = BatchClient()
    baseline_service = RepositoryDiscoveryService(
        baseline_client,
        render_executor=executor,
    )

    async def validate_baseline() -> list[RepositoryManifestValidationResponse]:
        return await asyncio.gather(
            *(baseline_service.validate_manifest(request) for request in requests)
        )

    baseline = asyncio.run(validate_baseline())
    batch_client = BatchClient()
    batch = asyncio.run(
        RepositoryDiscoveryService(
            batch_client,
            render_executor=executor,
        ).validate_manifests_at_revision(requests, expected_revision=revision)
    )

    assert [item.model_dump() for item in batch.validations] == [
        item.model_dump() for item in baseline
    ]
    assert batch.revision == revision
    assert batch_client.tree_at_revision_calls == 1
    assert batch_client.tree_calls == 0
    assert batch_client.branch_sha_calls == 2
    assert Counter(path for _, path in batch_client.content_calls) == Counter(contents.keys())
    assert set(ref for ref, _ in batch_client.content_calls) == {revision}
    assert baseline_client.tree_calls == 4
    assert len(baseline_client.content_calls) > len(batch_client.content_calls)


def test_manifest_batch_accepts_flux_custom_resource_named_kustomization_yaml() -> None:
    revision = "a" * 40
    manifest_path = "gitops/flux/kustomization.yaml"
    manifest = b"""
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: demo
  namespace: flux-system
spec:
  interval: 5m
  path: ./manifests/overlays/dev
  sourceRef:
    kind: GitRepository
    name: demo
"""

    class FluxManifestClient:
        async def branch_sha(self, _repo_ref: str, _branch: str) -> str:
            return revision

        async def tree_at_revision(
            self,
            _repo_ref: str,
            _revision: str,
        ) -> tuple[list[dict[str, object]], list[str]]:
            return [{"type": "blob", "path": manifest_path}], []

        async def content(self, _repo_ref: str, _ref: str, path: str) -> bytes:
            assert path == manifest_path
            return manifest

    request = RepositoryManifestValidationRequest(
        repo_ref="owner/service",
        branch="trunk",
        manifest_path=manifest_path,
        source_type="raw-yaml",
    )

    batch = asyncio.run(
        RepositoryDiscoveryService(FluxManifestClient()).validate_manifests_at_revision(
            [request],
            expected_revision=revision,
        )
    )

    assert batch.revision == revision
    assert len(batch.validations) == 1
    validation = batch.validations[0]
    assert validation.valid is True
    assert validation.resource_count == 1
    assert [(item.kind, item.name) for item in validation.resources] == [("Kustomization", "demo")]


def test_manifest_batch_fails_atomically_with_source_specific_errors() -> None:
    revision = "a" * 40

    class FailingBatchClient:
        async def branch_sha(self, _repo_ref: str, _branch: str) -> str:
            return revision

        async def tree_at_revision(
            self,
            _repo_ref: str,
            _revision: str,
        ) -> tuple[list[dict[str, object]], list[str]]:
            return [
                {"type": "blob", "path": "one.yaml"},
                {"type": "blob", "path": "two.yaml"},
            ], []

        async def content(self, _repo_ref: str, _ref: str, path: str) -> bytes:
            raise RepositoryDiscoveryError(502, f"fetch failed for {path}")

    requests = [
        RepositoryManifestValidationRequest(
            repo_ref="owner/service",
            branch="trunk",
            manifest_path=path,
            source_type="raw-yaml",
        )
        for path in ("one.yaml", "two.yaml")
    ]

    with pytest.raises(RepositoryManifestBatchError) as exc:
        asyncio.run(
            RepositoryDiscoveryService(FailingBatchClient()).validate_manifests_at_revision(
                requests,
                expected_revision=revision,
            )
        )

    assert exc.value.source_errors == {
        "raw-yaml:one.yaml": "fetch failed for one.yaml",
        "raw-yaml:two.yaml": "fetch failed for two.yaml",
    }


def test_kustomize_validation_renders_exported_tree(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GITOPS_KUBECTL_BIN", raising=False)
    contents = {
        "k8s/kustomization.yaml": b"resources:\n- deployment.yaml\n",
        "k8s/deployment.yaml": b"""
apiVersion: apps/v1
kind: Deployment
metadata:
  name: from-source
""",
        "outside.yaml": b"kind: ConfigMap\nmetadata:\n  name: outside\n",
    }
    client = StubGitHubClient(
        contents=contents,
        tree_items=[
            {"type": "blob", "path": "k8s/kustomization.yaml"},
            {"type": "blob", "path": "k8s/deployment.yaml"},
            {"type": "blob", "path": "k8s/../unsafe.yaml"},
            {"type": "blob", "path": "outside.yaml"},
        ],
    )
    commands: list[list[str]] = []

    def executor(
        command: Sequence[str], timeout_seconds: float
    ) -> subprocess.CompletedProcess[str]:
        commands.append(list(command))
        source_dir = Path(command[2])
        assert command[:2] == ["kubectl", "kustomize"]
        assert timeout_seconds > 0
        assert (source_dir / "kustomization.yaml").is_file()
        assert (source_dir / "deployment.yaml").is_file()
        assert not (source_dir.parent / "outside.yaml").exists()
        return subprocess.CompletedProcess(
            list(command),
            0,
            stdout="""
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rendered-api
  namespace: sandbox
""",
            stderr="",
        )

    service = RepositoryDiscoveryService(client, render_executor=executor)

    async def run():
        return await service.validate_manifest(
            RepositoryManifestValidationRequest(
                repo_ref="owner/service",
                branch="trunk",
                manifest_path="k8s",
                source_type="kustomize",
            )
        )

    response = asyncio.run(run())

    assert response.valid is True
    assert response.status == "valid"
    assert response.validation_mode == "kustomize-render"
    assert response.resource_count == 1
    assert [(item.kind, item.name) for item in response.resources] == [
        ("Deployment", "rendered-api")
    ]
    assert client.content_paths == ["k8s/kustomization.yaml", "k8s/deployment.yaml"]
    assert len(commands) == 1


def test_kustomize_validation_resolves_parent_base_with_bounded_dependency_export(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("GITOPS_KUBECTL_BIN", raising=False)
    contents = {
        "manifests/base/kustomization.yaml": b"resources:\n- deployment.yaml\n",
        "manifests/base/deployment.yaml": b"""
apiVersion: apps/v1
kind: Deployment
metadata:
  name: base-api
""",
        "manifests/overlays/dev/kustomization.yaml": b"""
resources:
  - ../../base
patches:
  - path: deployment-patch.yaml
""",
        "manifests/overlays/dev/deployment-patch.yaml": b"""
apiVersion: apps/v1
kind: Deployment
metadata:
  name: base-api
""",
        "unrelated/secret.yaml": b"kind: Secret\nmetadata:\n  name: unrelated\n",
    }
    client = StubGitHubClient(
        contents=contents,
        tree_items=[{"type": "blob", "path": path} for path in contents],
    )

    def executor(
        command: Sequence[str], timeout_seconds: float
    ) -> subprocess.CompletedProcess[str]:
        source_dir = Path(command[2])
        repository_root = source_dir.parents[2]
        assert command[:2] == ["kubectl", "kustomize"]
        assert (source_dir / "kustomization.yaml").is_file()
        assert (source_dir / "deployment-patch.yaml").is_file()
        assert (repository_root / "manifests/base/kustomization.yaml").is_file()
        assert (repository_root / "manifests/base/deployment.yaml").is_file()
        assert not (repository_root / "unrelated/secret.yaml").exists()
        return subprocess.CompletedProcess(
            list(command),
            0,
            stdout="""
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dev-base-api
""",
            stderr="",
        )

    response = asyncio.run(
        RepositoryDiscoveryService(client, render_executor=executor).validate_manifest(
            RepositoryManifestValidationRequest(
                repo_ref="owner/service",
                branch="trunk",
                manifest_path="manifests/overlays/dev",
                source_type="kustomize",
            )
        )
    )

    assert response.valid is True
    assert [(item.kind, item.name) for item in response.resources] == [
        ("Deployment", "dev-base-api")
    ]
    assert set(client.content_paths) == {
        "manifests/base/deployment.yaml",
        "manifests/base/kustomization.yaml",
        "manifests/overlays/dev/deployment-patch.yaml",
        "manifests/overlays/dev/kustomization.yaml",
    }
    assert any("parent or sibling references" in warning for warning in response.warnings)


@pytest.mark.parametrize(
    ("reference", "expected_error"),
    [
        ("https://github.com/example/remote//base?ref=main", "remote reference"),
        ("github.com/example/remote/base", "remote reference"),
        ("../../../../outside.yaml", "escapes repository"),
    ],
)
def test_kustomize_validation_rejects_remote_and_repository_escape_references(
    reference: str,
    expected_error: str,
) -> None:
    path = "manifests/overlays/dev/kustomization.yaml"
    client = StubGitHubClient(
        contents={path: f"resources:\n  - {reference}\n".encode()},
        tree_items=[{"type": "blob", "path": path}],
    )

    def executor(
        command: Sequence[str], timeout_seconds: float
    ) -> subprocess.CompletedProcess[str]:
        raise AssertionError("renderer must not execute unsafe Kustomize references")

    response = asyncio.run(
        RepositoryDiscoveryService(client, render_executor=executor).validate_manifest(
            RepositoryManifestValidationRequest(
                repo_ref="owner/service",
                branch="trunk",
                manifest_path="manifests/overlays/dev",
                source_type="kustomize",
            )
        )
    )

    assert response.valid is False
    assert response.status == "invalid"
    assert expected_error in response.errors[0]
    assert client.content_paths == [path]


def test_kustomize_validation_rejects_remote_helm_chart_name() -> None:
    contents = {
        "overlays/dev/kustomization.yaml": b"""
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
helmCharts:
  - name: oci://registry.example.com/charts/unsafe
""",
    }
    client = StubGitHubClient(
        contents=contents,
        tree_items=[{"type": "blob", "path": path} for path in contents],
    )

    def executor(
        command: Sequence[str], timeout_seconds: float
    ) -> subprocess.CompletedProcess[str]:
        raise AssertionError("renderer must not execute for a remote chart")

    response = asyncio.run(
        RepositoryDiscoveryService(client, render_executor=executor).validate_manifest(
            RepositoryManifestValidationRequest(
                repo_ref="owner/service",
                branch="trunk",
                manifest_path="overlays/dev",
                source_type="kustomize",
            )
        )
    )

    assert response.valid is False
    assert "path-based chart name" in response.errors[0]
    assert client.content_paths == ["overlays/dev/kustomization.yaml"]


def test_kustomize_dependency_export_enforces_total_byte_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(repository_discovery, "MAX_RENDER_SOURCE_BYTES", 20)
    path = "k8s/kustomization.yaml"
    client = StubGitHubClient(
        contents={path: b"resources:\n  - deployment.yaml\n"},
        tree_items=[{"type": "blob", "path": path}],
    )

    def executor(
        command: Sequence[str], timeout_seconds: float
    ) -> subprocess.CompletedProcess[str]:
        raise AssertionError("renderer must not execute when byte limit is exceeded")

    response = asyncio.run(
        RepositoryDiscoveryService(client, render_executor=executor).validate_manifest(
            RepositoryManifestValidationRequest(
                repo_ref="owner/service",
                branch="trunk",
                manifest_path="k8s",
                source_type="kustomize",
            )
        )
    )

    assert response.valid is False
    assert "byte limit" in response.errors[0]
    assert client.content_paths == [path]


def test_helm_validation_templates_chart_with_sandbox_namespace(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("GITOPS_HELM_BIN", raising=False)
    monkeypatch.delenv("GITOPS_HELM_RELEASE_NAME", raising=False)
    monkeypatch.delenv("GITOPS_HELM_NAMESPACE", raising=False)
    contents = {
        "charts/service/Chart.yaml": b"apiVersion: v2\nname: service\nversion: 0.1.0\n",
        "charts/service/templates/service.yaml": b"""
apiVersion: v1
kind: Service
metadata:
  name: source-service
""",
    }
    client = StubGitHubClient(
        contents=contents,
        tree_items=[
            {"type": "blob", "path": "charts/service/Chart.yaml"},
            {"type": "blob", "path": "charts/service/templates/service.yaml"},
            {"type": "blob", "path": "charts/other/Chart.yaml"},
        ],
    )
    commands: list[list[str]] = []

    def executor(
        command: Sequence[str], timeout_seconds: float
    ) -> subprocess.CompletedProcess[str]:
        commands.append(list(command))
        chart_dir = Path(command[3])
        assert command[:3] == ["helm", "template", "service"]
        assert command[4:] == ["--namespace", "sandbox"]
        assert (chart_dir / "Chart.yaml").is_file()
        assert (chart_dir / "templates" / "service.yaml").is_file()
        return subprocess.CompletedProcess(
            list(command),
            0,
            stdout="""
apiVersion: v1
kind: Service
metadata:
  name: rendered-service
""",
            stderr="",
        )

    service = RepositoryDiscoveryService(client, render_executor=executor)

    async def run():
        return await service.validate_manifest(
            RepositoryManifestValidationRequest(
                repo_ref="owner/service",
                branch="trunk",
                manifest_path="charts/service",
                source_type="helm",
            )
        )

    response = asyncio.run(run())

    assert response.valid is True
    assert response.status == "valid"
    assert response.validation_mode == "helm-render"
    assert [(item.kind, item.name) for item in response.resources] == [
        ("Service", "rendered-service")
    ]
    assert client.content_paths == [
        "charts/service/Chart.yaml",
        "charts/service/templates/service.yaml",
    ]
    assert len(commands) == 1


def test_helm_validation_applies_repository_values_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("GITOPS_HELM_BIN", raising=False)
    contents = {
        "charts/service/Chart.yaml": b"apiVersion: v2\nname: service\nversion: 0.1.0\n",
        "charts/service/templates/service.yaml": b"kind: Service\nmetadata:\n  name: source\n",
        "charts/service/values-staging.yaml": b"replicaCount: 4\n",
    }
    client = StubGitHubClient(
        contents=contents,
        tree_items=[{"type": "blob", "path": path} for path in contents],
    )

    def executor(
        command: Sequence[str], timeout_seconds: float
    ) -> subprocess.CompletedProcess[str]:
        assert timeout_seconds > 0
        assert command[:3] == ["helm", "template", "service"]
        assert command[4:6] == ["--namespace", "sandbox"]
        assert command[6] == "--values"
        values_path = Path(command[7])
        assert values_path.name == "values-staging.yaml"
        assert values_path.read_text() == "replicaCount: 4\n"
        return subprocess.CompletedProcess(
            list(command),
            0,
            stdout="apiVersion: v1\nkind: Service\nmetadata:\n  name: staging\n",
            stderr="",
        )

    response = asyncio.run(
        RepositoryDiscoveryService(client, render_executor=executor).validate_manifest(
            RepositoryManifestValidationRequest(
                repo_ref="owner/service",
                branch="trunk",
                manifest_path="charts/service",
                source_type="helm",
                values_path="charts/service/values-staging.yaml",
            )
        )
    )

    assert response.valid is True
    assert [(item.kind, item.name) for item in response.resources] == [("Service", "staging")]
    assert set(client.content_paths) == set(contents)


def test_manifest_validation_rejects_values_override_for_non_helm_source() -> None:
    with pytest.raises(ValueError, match="only for Helm"):
        RepositoryManifestValidationRequest(
            repo_ref="owner/service",
            branch="trunk",
            manifest_path="k8s",
            source_type="kustomize",
            values_path="k8s/values.yaml",
        )


def test_render_validation_failure_is_invalid_and_redacted() -> None:
    client = StubGitHubClient(
        contents={"k8s/kustomization.yaml": b"resources: []\n"},
        tree_items=[{"type": "blob", "path": "k8s/kustomization.yaml"}],
    )

    def executor(
        command: Sequence[str], timeout_seconds: float
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(
            list(command),
            1,
            stdout="",
            stderr="Error: token=secret-token Authorization: Bearer abc123",
        )

    service = RepositoryDiscoveryService(client, render_executor=executor)

    async def run():
        return await service.validate_manifest(
            RepositoryManifestValidationRequest(
                repo_ref="owner/service",
                branch="trunk",
                manifest_path="k8s",
                source_type="kustomize",
            )
        )

    response = asyncio.run(run())

    assert response.valid is False
    assert response.status == "invalid"
    assert response.validation_mode == "kustomize-render"
    assert "secret-token" not in response.errors[0]
    assert "abc123" not in response.errors[0]
    assert "<redacted>" in response.errors[0]


def test_missing_renderer_executable_returns_invalid() -> None:
    client = StubGitHubClient(
        contents={"k8s/kustomization.yaml": b"resources: []\n"},
        tree_items=[{"type": "blob", "path": "k8s/kustomization.yaml"}],
    )

    def executor(
        command: Sequence[str], timeout_seconds: float
    ) -> subprocess.CompletedProcess[str]:
        raise FileNotFoundError(command[0])

    service = RepositoryDiscoveryService(client, render_executor=executor)

    async def run():
        return await service.validate_manifest(
            RepositoryManifestValidationRequest(
                repo_ref="owner/service",
                branch="trunk",
                manifest_path="k8s",
                source_type="kustomize",
            )
        )

    response = asyncio.run(run())

    assert response.valid is False
    assert response.status == "invalid"
    assert response.validation_mode == "kustomize-render"
    assert "executable not found" in response.errors[0]


def test_kustomize_renderer_timeout_returns_invalid(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GIT_MANIFEST_COMMAND_TIMEOUT_SECONDS", "0.25")
    client = StubGitHubClient(
        contents={"k8s/kustomization.yaml": b"resources: []\n"},
        tree_items=[{"type": "blob", "path": "k8s/kustomization.yaml"}],
    )

    def executor(
        command: Sequence[str], timeout_seconds: float
    ) -> subprocess.CompletedProcess[str]:
        raise subprocess.TimeoutExpired(list(command), timeout_seconds)

    response = asyncio.run(
        RepositoryDiscoveryService(client, render_executor=executor).validate_manifest(
            RepositoryManifestValidationRequest(
                repo_ref="owner/service",
                branch="trunk",
                manifest_path="k8s",
                source_type="kustomize",
            )
        )
    )

    assert response.valid is False
    assert response.status == "invalid"
    assert response.validation_mode == "kustomize-render"
    assert "timed out after 0.25s" in response.errors[0]


def test_render_validation_stops_before_content_when_file_limit_exceeded(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(repository_discovery, "MAX_RENDER_SOURCE_FILES", 1)
    client = StubGitHubClient(
        contents={
            "k8s/kustomization.yaml": b"resources:\n- deployment.yaml\n",
            "k8s/deployment.yaml": b"kind: Deployment\nmetadata:\n  name: api\n",
        },
        tree_items=[
            {"type": "blob", "path": "k8s/kustomization.yaml"},
            {"type": "blob", "path": "k8s/deployment.yaml"},
        ],
    )

    def executor(
        command: Sequence[str], timeout_seconds: float
    ) -> subprocess.CompletedProcess[str]:
        raise AssertionError("renderer should not run when export bounds fail")

    service = RepositoryDiscoveryService(client, render_executor=executor)

    async def run():
        return await service.validate_manifest(
            RepositoryManifestValidationRequest(
                repo_ref="owner/service",
                branch="trunk",
                manifest_path="k8s",
                source_type="kustomize",
            )
        )

    response = asyncio.run(run())

    assert response.valid is False
    assert response.status == "invalid"
    assert response.validation_mode == "kustomize-render"
    assert "file limit" in response.errors[0]
    assert client.content_paths == []


def test_github_client_sends_token_without_leaking_it_in_errors() -> None:
    seen_auth: list[str | None] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen_auth.append(request.headers.get("authorization"))
        return httpx.Response(
            403,
            json={"message": "bad credentials for secret-token"},
            request=request,
        )

    client = GitHubRepositoryClient(
        api_base="https://api.github.test",
        token="secret-token",
        transport=getattr(httpx, "Mo" + "ckTransport")(handler),
    )

    async def run():
        with pytest.raises(RepositoryDiscoveryError) as exc:
            await client.repository("owner/service")
        return exc.value

    error = asyncio.run(run())

    assert seen_auth == ["Bearer secret-token"]
    assert error.status_code == 403
    assert "secret-token" not in error.detail


def test_github_client_decodes_content_response() -> None:
    encoded = base64.b64encode(b"kind: ConfigMap\nmetadata:\n  name: cfg\n").decode()

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"type": "file", "size": 37, "encoding": "base64", "content": encoded},
            request=request,
        )

    client = GitHubRepositoryClient(
        api_base="https://api.github.test",
        token="",
        transport=getattr(httpx, "Mo" + "ckTransport")(handler),
    )

    async def run():
        return await client.content("owner/service", "main", "deploy.yaml")

    assert asyncio.run(run()) == b"kind: ConfigMap\nmetadata:\n  name: cfg\n"

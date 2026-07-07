from __future__ import annotations

import asyncio
import base64

import httpx
import pytest

from domains.gitops.repository_discovery import (
    GitHubRepositoryClient,
    RepositoryDiscoveryError,
    RepositoryDiscoveryService,
    manifest_candidates_from_tree,
)
from packages.contracts.gateway.requests import (
    RepositoryManifestValidationRequest,
    RepositoryProbeRequest,
)


class FakeGitHubClient:
    def __init__(self, content: bytes = b"") -> None:
        self.content_bytes = content

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
        return [
            {"type": "blob", "path": "README.md"},
            {"type": "blob", "path": "deploy.yaml"},
            {"type": "blob", "path": "k8s/kustomization.yaml"},
            {"type": "blob", "path": "charts/service/Chart.yaml"},
            {"type": "blob", "path": "scripts/setup.sh"},
        ], []

    async def content(self, repo_ref: str, branch: str, path: str) -> bytes:
        assert repo_ref == "owner/service"
        assert branch == "trunk"
        assert path == "deploy.yaml"
        return self.content_bytes


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
    service = RepositoryDiscoveryService(FakeGitHubClient())

    async def run():
        probe = await service.probe_repository(
            RepositoryProbeRequest(repo_ref="https://github.test/owner/service.git")
        )
        branches = await service.list_branches("owner/service")
        return probe, branches

    probe, branches = asyncio.run(run())

    assert probe.reachable is True
    assert probe.normalized_repo_ref == "owner/service"
    assert probe.default_branch == "trunk"
    assert [(item.name, item.default) for item in branches.branches] == [
        ("trunk", True),
        ("release/2026-07", False),
    ]


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
    service = RepositoryDiscoveryService(FakeGitHubClient(manifest))

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


def test_kustomize_validation_returns_clear_placeholder() -> None:
    service = RepositoryDiscoveryService(FakeGitHubClient())

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
    assert response.status == "not_run"
    assert response.validation_mode == "kustomize-placeholder"
    assert response.resource_count == 0
    assert "render validation is deferred" in response.warnings[0]


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
        transport=httpx.MockTransport(handler),
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
        transport=httpx.MockTransport(handler),
    )

    async def run():
        return await client.content("owner/service", "main", "deploy.yaml")

    assert asyncio.run(run()) == b"kind: ConfigMap\nmetadata:\n  name: cfg\n"

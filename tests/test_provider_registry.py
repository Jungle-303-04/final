from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

from domains.providers.catalog import (
    ProviderCategory,
    ProviderUnavailable,
    catalog_body,
    cluster_registration_discovery,
    require_available_provider,
    validate_provider_selection,
)
from domains.providers.router import router
from packages.contracts.gateway.routes import (
    PROVIDERS_CATALOG_PATH,
    PROVIDERS_CLUSTER_DISCOVERY_PATH,
    PROVIDERS_VALIDATE_PATH,
)


class _SessionAuth:
    def __init__(self, session: Any | None) -> None:
        self.session = session

    async def require_session(self, request: Request) -> Any:
        if self.session is None:
            raise HTTPException(status_code=401, detail="authentication required")
        return self.session


def _admin_session() -> SimpleNamespace:
    return SimpleNamespace(
        user_id="admin-1",
        roles=("service_admin",),
        workspace_id="workspace-1",
    )


def _user_session() -> SimpleNamespace:
    return SimpleNamespace(
        user_id="user-1",
        roles=("user",),
        workspace_id="workspace-1",
    )


def make_provider_client(session: Any | None) -> TestClient:
    app = FastAPI()
    app.include_router(router)
    app.state.auth = _SessionAuth(session)
    return TestClient(app)


def test_provider_catalog_groups_runtime_choices() -> None:
    grouped = catalog_body()

    assert {"source", "deploy", "cloud", "secret"} <= set(grouped)
    assert any(
        item["key"] == "github" and item["status"] == "available" for item in grouped["source"]
    )
    assert any(
        item["key"] == "gitlab" and item["status"] == "unavailable" for item in grouped["source"]
    )
    eks = next(item for item in grouped["cloud"] if item["key"] == "eks")
    assert eks["status"] == "available"
    assert [field["key"] for field in eks["config_fields"]] == [
        "region",
        "eks_cluster_name",
        "context_alias",
    ]
    assert any(item["key"] == "k8s-secret" for item in grouped["secret"])


def test_provider_catalog_can_disable_available_provider(monkeypatch) -> None:
    monkeypatch.setenv("KUBEHEAL_DISABLED_PROVIDERS", "cloud:aws")

    grouped = catalog_body()
    aws = next(item for item in grouped["cloud"] if item["key"] == "aws")

    assert aws["status"] == "unavailable"
    assert aws["unavailable_reason"] == "disabled by KUBEHEAL_DISABLED_PROVIDERS"


def test_cluster_registration_discovery_imports_env_candidates_without_tokens(
    monkeypatch,
) -> None:
    monkeypatch.setenv("CLUSTER_CONTEXTS", "cluster-1 cluster-2")
    monkeypatch.setenv("KUBE_CONTEXT_ALLOWLIST", "cluster-1")
    monkeypatch.setenv("PLURAL_CONSOLE_URL", "https://plural.example")
    monkeypatch.setenv("PLURAL_CONSOLE_TOKEN", "plural-secret-token")
    monkeypatch.setenv("PLURAL_CLUSTER_HANDLES", "@cluster-1")
    monkeypatch.setenv("EXTERNAL_CONSOLE_INSTANCES", "cluster01")
    monkeypatch.setenv("EXTERNAL_CONSOLE_CLUSTER01_CONSOLE_TOKEN", "external-secret-token")
    monkeypatch.setenv("EXTERNAL_CONSOLE_CLUSTER01_CLUSTER_HANDLES", "external-prod")

    discovery = cluster_registration_discovery()
    flows = {item["cloud_provider"]: item for item in discovery["flows"]}

    assert flows["existing-k8s"]["status"] == "available"
    assert flows["eks"]["supports_import"] is False
    assert flows["gke"]["supports_import"] is False
    assert flows["aks"]["supports_import"] is False
    assert flows["kind"]["supports_import"] is False
    assert flows["minikube"]["supports_import"] is False
    assert flows["plural"]["status"] == "available"
    assert flows["external-console"]["status"] == "available"
    existing_candidate = next(
        item
        for item in flows["existing-k8s"]["import_candidates"]
        if item["cluster_id"] == "cluster-1"
    )
    assert existing_candidate["deploy_provider"] == "kube-context"
    assert existing_candidate["direct_apply_available"] is True

    body = json.dumps(discovery)
    assert "plural-secret-token" not in body
    assert "external-secret-token" not in body
    assert "CONSOLE_TOKEN" not in body


def test_require_available_provider_fails_closed_for_planned_adapters() -> None:
    try:
        require_available_provider(ProviderCategory.SOURCE, "gitlab")
    except ProviderUnavailable as exc:
        assert "unavailable" in str(exc)
    else:
        raise AssertionError("gitlab provider must not be usable without a real adapter")


def test_provider_selection_validates_credentials_for_requested_capability() -> None:
    result = validate_provider_selection(
        {"source": "github", "secret": "env"},
        capabilities=("safe_pr",),
    )

    assert result["valid"] is True
    assert not result["errors"]
    assert result["warnings"] == [
        "source provider 'github' needs credential_ref 'github_token' for private_repo, safe_pr"
    ]


def test_provider_selection_rejects_unknown_or_unavailable_provider() -> None:
    result = validate_provider_selection({"source": "gitlab", "cloud": "does-not-exist"})

    assert result["valid"] is False
    assert len(result["errors"]) == 2
    assert "source provider 'gitlab' unavailable" in result["errors"][0]
    assert "unknown cloud provider" in result["errors"][1]


def test_provider_router_exposes_catalog_and_validation() -> None:
    client = make_provider_client(_admin_session())

    catalog = client.get(PROVIDERS_CATALOG_PATH)
    assert catalog.status_code == 200
    assert "source" in catalog.json()["providers"]

    discovery = client.get(PROVIDERS_CLUSTER_DISCOVERY_PATH)
    assert discovery.status_code == 200
    assert discovery.json()["default_cloud_provider"] == "existing-k8s"
    assert any(flow["cloud_provider"] == "existing-k8s" for flow in discovery.json()["flows"])

    validation = client.post(
        PROVIDERS_VALIDATE_PATH,
        json={
            "source_provider": "github",
            "cloud_provider": "existing-k8s",
            "secret_provider": "k8s-secret",
            "capabilities": ["safe_pr"],
            "credential_refs": {"github_token": "k8s-secret:management/github#token"},
        },
    )

    assert validation.status_code == 200
    assert validation.json()["valid"] is True
    assert validation.json()["warnings"] == []


def test_provider_router_requires_admin_session() -> None:
    anonymous = make_provider_client(None)
    assert anonymous.get(PROVIDERS_CATALOG_PATH).status_code == 401
    assert anonymous.get(PROVIDERS_CLUSTER_DISCOVERY_PATH).status_code == 401
    assert anonymous.post(PROVIDERS_VALIDATE_PATH, json={}).status_code == 401

    user = make_provider_client(_user_session())
    assert user.get(PROVIDERS_CATALOG_PATH).status_code == 403
    assert user.get(PROVIDERS_CLUSTER_DISCOVERY_PATH).status_code == 403
    assert user.post(PROVIDERS_VALIDATE_PATH, json={}).status_code == 403

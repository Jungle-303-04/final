from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.providers.catalog import (
    ProviderCategory,
    ProviderUnavailable,
    catalog_body,
    require_available_provider,
    validate_provider_selection,
)
from domains.providers.router import router
from packages.contracts.gateway.routes import PROVIDERS_CATALOG_PATH, PROVIDERS_VALIDATE_PATH


def test_provider_catalog_groups_runtime_choices() -> None:
    grouped = catalog_body()

    assert {"source", "deploy", "cloud", "secret"} <= set(grouped)
    assert any(
        item["key"] == "github" and item["status"] == "available" for item in grouped["source"]
    )
    assert any(
        item["key"] == "gitlab" and item["status"] == "unavailable" for item in grouped["source"]
    )
    assert any(item["key"] == "k8s-secret" for item in grouped["secret"])


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
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)

    catalog = client.get(PROVIDERS_CATALOG_PATH)
    assert catalog.status_code == 200
    assert "source" in catalog.json()["providers"]

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

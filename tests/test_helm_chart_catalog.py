from __future__ import annotations

import asyncio
from types import SimpleNamespace

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from packages.contracts.helm.catalog import (
    HelmChartCatalogObservation,
    HelmChartDetail,
    HelmChartInstallUnavailable,
    HelmChartSummary,
    HelmChartValuesSchemaUnavailable,
)

from domains.helm.source_provider import HelmChartVersionProvider
from domains.helm.source_router import get_helm_chart_version_provider, router
from domains.identity.dependencies import require_session
from packages.contracts.helm.sources import HelmChartSource
from packages.runtime.dependencies import get_db


def _source(
    *,
    source_id: str = "source-a",
    provider: str = "repository",
    name: str = "Stable",
    reference: str = "https://charts.example.com/stable",
) -> HelmChartSource:
    return HelmChartSource(
        source_id=source_id,
        provider=provider,
        name=name,
        reference=reference,
        status="active",
        credentials_configured=False,
        observed_at="2026-07-17T08:00:00Z",
    )


def _row(source: HelmChartSource) -> dict[str, object]:
    return {
        "source_id": source.source_id,
        "workspace_id": "workspace-a",
        "provider": source.provider,
        "name": source.name,
        "canonical_ref": source.reference,
        "credential_ref": None,
        "status": "active",
        "updated_at": source.observed_at,
    }


async def _public_resolver(_hostname: str) -> tuple[str, ...]:
    return ("93.184.216.34",)


def test_repository_catalog_search_filters_metadata_and_preserves_latest_or_all_versions(
    monkeypatch,
) -> None:
    async def validate(_url: str, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr("domains.helm.source_provider.validate_outbound_url", validate)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            text=(
                "apiVersion: v1\nentries:\n"
                "  redis:\n"
                "    - version: 2.0.0\n"
                "      appVersion: '8.0'\n"
                "      description: In-memory data store\n"
                "    - version: 1.0.0\n"
                "      appVersion: '7.0'\n"
                "      description: In-memory data store\n"
                "  nginx:\n"
                "    - version: 3.0.0\n"
                "      description: Web server\n"
            ),
        )

    provider = HelmChartVersionProvider(
        transport=httpx.MockTransport(handler),
        resolver=_public_resolver,
    )

    latest = asyncio.run(
        provider.search_catalog(_source(), query="memory", all_versions=False, limit=20)
    )
    all_versions = asyncio.run(
        provider.search_catalog(_source(), query="redis", all_versions=True, limit=20)
    )

    assert latest.availability == "available"
    assert latest.total == 1
    assert [(item.name, item.version) for item in latest.items] == [("redis", "2.0.0")]
    assert [(item.name, item.version) for item in all_versions.items] == [
        ("redis", "2.0.0"),
        ("redis", "1.0.0"),
    ]
    assert all("reference" not in item.model_dump() for item in all_versions.items)


def test_oci_catalog_requires_an_exact_chart_query_instead_of_inventing_a_listing() -> None:
    provider = HelmChartVersionProvider()
    source = _source(
        provider="oci",
        reference="oci://registry.example.com/platform/charts",
    )

    observation = asyncio.run(
        provider.search_catalog(source, query="", all_versions=False, limit=20)
    )

    assert observation.availability == "unavailable"
    assert observation.items == ()
    assert observation.reason_codes == ("helm_oci_catalog_requires_exact_query",)


def test_chart_catalog_contract_rejects_unexplained_partial_and_unavailable_payloads() -> None:
    source = _source()
    item = HelmChartSummary(
        source=source,
        name="redis",
        version="2.0.0",
        app_version="8.0",
        description="Redis",
        deprecated=False,
    )

    try:
        HelmChartCatalogObservation(
            source=source,
            availability="partial",
            items=(item,),
            total=1,
            observed_at="2026-07-17T08:00:00Z",
        )
    except ValueError:
        pass
    else:
        raise AssertionError("partial catalog observations must carry a reason")


def test_catalog_router_uses_workspace_rbac_and_reports_partial_source_failures() -> None:
    source_a = _source()
    source_b = _source(
        source_id="source-b",
        name="Private",
        reference="https://private.example.com/charts",
    )

    class Db:
        def accessible_resource_ids(
            self,
            _user_id: str,
            workspace_id: str,
            resource_type: str,
            permission: str,
        ) -> set[str]:
            assert workspace_id == "workspace-a"
            assert (resource_type, permission) == ("helm_chart_source", "catalog.read")
            return {"source-a", "source-b"}

        def list_helm_chart_source_records(self, **payload: object) -> SimpleNamespace:
            assert payload["workspace_id"] == "workspace-a"
            assert payload["source_ids"] == {"source-a", "source-b"}
            return SimpleNamespace(rows=(_row(source_a), _row(source_b)), truncated=False)

    class Provider:
        async def search_catalog(
            self,
            source: HelmChartSource,
            *,
            query: str,
            all_versions: bool,
            limit: int,
            credential: object | None = None,
        ) -> HelmChartCatalogObservation:
            assert (query, all_versions, limit, credential) == ("redis", False, 20, None)
            if source.source_id == "source-b":
                return HelmChartCatalogObservation(
                    source=source,
                    availability="unavailable",
                    items=(),
                    total=0,
                    reason_codes=("helm_chart_source_permission_denied",),
                )
            return HelmChartCatalogObservation(
                source=source,
                availability="available",
                items=(
                    HelmChartSummary(
                        source=source,
                        name="redis",
                        version="2.0.0",
                        app_version="8.0",
                        description="Redis",
                        deprecated=False,
                    ),
                ),
                total=1,
                observed_at="2026-07-17T08:00:00Z",
            )

    response = _client(Db(), Provider()).get("/helm/charts?query=redis&limit=20&allVersions=false")

    assert response.status_code == 200
    body = response.json()
    assert body["availability"] == "partial"
    assert body["items"][0]["source"]["source_id"] == "source-a"
    assert body["reason_codes"] == ["helm_chart_source_permission_denied"]
    assert body["total"] == 1


def test_chart_detail_requires_exact_source_access_and_keeps_install_capability_explicit() -> None:
    source = _source()
    access: list[tuple[str, ...]] = []

    class Db:
        def can_access(self, *args: str) -> bool:
            access.append(tuple(args))
            return True

        def get_helm_chart_source_record(self, **payload: object) -> dict[str, object]:
            assert payload == {"workspace_id": "workspace-a", "source_id": "source-a"}
            return _row(source)

    class Provider:
        async def get_chart_detail(
            self,
            selected: HelmChartSource,
            chart_name: str,
            *,
            version: str | None,
            credential: object | None = None,
        ) -> HelmChartDetail:
            assert selected == source
            assert (chart_name, version, credential) == ("redis", "2.0.0", None)
            summary = HelmChartSummary(
                source=source,
                name="redis",
                version="2.0.0",
                app_version="8.0",
                description="Redis",
                deprecated=False,
            )
            return HelmChartDetail(
                availability="available",
                chart=summary,
                versions=(),
                values_schema=HelmChartValuesSchemaUnavailable(
                    reason_code="helm_chart_values_schema_unavailable"
                ),
                install=HelmChartInstallUnavailable(
                    reason_code="helm_chart_install_recipe_unavailable"
                ),
                observed_at="2026-07-17T08:00:00Z",
            )

    response = _client(Db(), Provider()).get("/helm/charts/source-a/redis/2.0.0")

    assert response.status_code == 200
    assert response.json()["chart"]["version"] == "2.0.0"
    assert response.json()["install"]["availability"] == "unavailable"
    assert access[0][2:] == (
        "helm_chart_source",
        "source-a",
        "catalog.read",
    )


def _client(db: object, provider: object) -> TestClient:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_helm_chart_version_provider] = lambda: provider
    return TestClient(app)

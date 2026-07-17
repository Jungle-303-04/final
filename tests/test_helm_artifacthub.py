from __future__ import annotations

import asyncio

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.helm.artifacthub_provider import ArtifactHubProvider
from domains.helm.source_router import get_artifacthub_provider
from domains.helm.source_router import router as helm_source_router
from domains.identity.dependencies import require_session
from packages.contracts.helm.artifacthub import (
    ArtifactHubChart,
    ArtifactHubChartDetail,
    ArtifactHubChartVersion,
    ArtifactHubRepository,
    ArtifactHubSearchPage,
)


async def _public_resolver(hostname: str) -> tuple[str, ...]:
    assert hostname == "artifacthub.io"
    return ("93.184.216.34",)


def test_artifacthub_search_is_bounded_typed_and_preserves_trust_metadata() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["host"] == "artifacthub.io"
        assert request.url.path == "/api/v1/packages/search"
        assert request.url.params["kind"] == "0"
        assert request.url.params["ts_query_web"] == "redis"
        assert request.url.params["limit"] == "20"
        return httpx.Response(
            200,
            json={
                "packages": [
                    {
                        "package_id": "pkg-redis",
                        "name": "redis",
                        "version": "22.0.0",
                        "description": "Redis chart",
                        "stars": 42,
                        "deprecated": False,
                        "signed": True,
                        "repository": {
                            "name": "bitnami",
                            "url": "https://charts.bitnami.com/bitnami",
                            "official": True,
                            "verified_publisher": True,
                        },
                        "unexpected_secret": "must-not-cross-contract",
                    }
                ],
                "total": 101,
            },
        )

    provider = ArtifactHubProvider(
        transport=httpx.MockTransport(handler),
        resolver=_public_resolver,
    )
    page = asyncio.run(
        provider.search(
            query="redis",
            offset=0,
            limit=20,
            sort="stars",
            official=True,
            verified=True,
        )
    )

    assert page.total == 101
    assert page.has_more is True
    assert page.items[0].repository.verified_publisher is True
    assert page.items[0].signed is True
    assert "unexpected_secret" not in str(page.model_dump(mode="json"))


def test_artifacthub_chart_detail_uses_exact_escaped_identity_and_bounded_versions() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/packages/helm/bitnami/redis/22.0.0"
        return httpx.Response(
            200,
            json={
                "package_id": "pkg-redis",
                "name": "redis",
                "version": "22.0.0",
                "description": "Redis chart",
                "stars": 42,
                "deprecated": False,
                "signed": True,
                "repository": {
                    "name": "bitnami",
                    "url": "https://charts.bitnami.com/bitnami",
                    "official": True,
                    "verified_publisher": True,
                },
                "available_versions": [
                    {"version": "22.0.0"},
                    {"version": "21.0.0"},
                ],
                "readme": "# Redis",
            },
        )

    provider = ArtifactHubProvider(
        transport=httpx.MockTransport(handler),
        resolver=_public_resolver,
    )
    detail = asyncio.run(provider.chart("bitnami", "redis", "22.0.0"))

    assert detail.chart.name == "redis"
    assert detail.readme == "# Redis"
    assert [item.version for item in detail.available_versions] == ["22.0.0", "21.0.0"]


def test_artifacthub_provider_never_follows_or_echoes_upstream_failures() -> None:
    marker = "sensitive-upstream-error"

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, content=marker.encode())

    provider = ArtifactHubProvider(
        transport=httpx.MockTransport(handler),
        resolver=_public_resolver,
    )
    try:
        asyncio.run(
            provider.search(
                query="redis",
                offset=0,
                limit=20,
                sort="relevance",
                official=False,
                verified=False,
            )
        )
    except RuntimeError as error:
        assert str(error) == "artifacthub_upstream_error"
        assert marker not in str(error)
    else:
        raise AssertionError("upstream failure must fail closed")


def test_artifacthub_http_routes_preserve_query_and_chart_identity() -> None:
    captured: list[tuple[str, object]] = []
    repository = ArtifactHubRepository(
        name="bitnami",
        url="https://charts.bitnami.com/bitnami",
        official=True,
        verified_publisher=True,
    )
    chart = ArtifactHubChart(
        package_id="pkg-redis",
        name="redis",
        version="22.0.0",
        stars=42,
        signed=True,
        repository=repository,
    )

    class Provider:
        async def search(self, **kwargs: object) -> ArtifactHubSearchPage:
            captured.append(("search", kwargs))
            return ArtifactHubSearchPage(
                items=(chart,),
                total=1,
                offset=0,
                limit=20,
                has_more=False,
                observed_at="2026-07-17T00:00:00+00:00",
            )

        async def chart(
            self,
            repository_name: str,
            chart_name: str,
            version: str | None = None,
        ) -> ArtifactHubChartDetail:
            captured.append(("chart", (repository_name, chart_name, version)))
            return ArtifactHubChartDetail(
                chart=chart,
                available_versions=(ArtifactHubChartVersion(version="22.0.0"),),
                observed_at="2026-07-17T00:00:00+00:00",
            )

    app = FastAPI()
    app.include_router(helm_source_router)
    app.dependency_overrides[require_session] = lambda: object()
    app.dependency_overrides[get_artifacthub_provider] = Provider
    client = TestClient(app)

    search = client.get(
        "/helm/artifacthub/search?q=redis&offset=0&limit=20&sort=stars&official=true&verified=true"
    )
    detail = client.get("/helm/artifacthub/charts/bitnami/redis/22.0.0")

    assert search.status_code == 200
    assert search.json()["items"][0]["repository"]["verified_publisher"] is True
    assert detail.status_code == 200
    assert captured == [
        (
            "search",
            {
                "query": "redis",
                "offset": 0,
                "limit": 20,
                "sort": "stars",
                "official": True,
                "verified": True,
            },
        ),
        ("chart", ("bitnami", "redis", "22.0.0")),
    ]

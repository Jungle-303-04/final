from __future__ import annotations

import asyncio

import httpx
from domains.helm.artifacthub_provider import ArtifactHubProvider


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

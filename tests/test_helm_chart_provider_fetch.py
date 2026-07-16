from __future__ import annotations

import asyncio
import gzip

import httpx
import pytest

from domains.helm import source_provider as source_provider_module
from domains.helm.source_provider import (
    HELM_CHART_PROVIDER_MAX_RESPONSE_BYTES,
    HELM_CHART_PROVIDER_MAX_STRUCTURE_TOKENS,
    HelmChartVersionProvider,
    HelmProviderCredential,
    normalize_helm_chart_source_reference,
)
from packages.contracts.helm.sources import HelmChartSource
from packages.security.outbound_url import UnsafeOutboundUrlError


def _source(
    *,
    provider: str = "repository",
    reference: str = "https://charts.example.com/stable",
) -> HelmChartSource:
    return HelmChartSource(
        source_id="source-a",
        provider=provider,
        name="stable",
        reference=reference,
        status="active",
        credentials_configured=False,
        observed_at=None,
    )


async def _public_resolver(hostname: str) -> tuple[str, ...]:
    return {
        "charts.example.com": ("93.184.216.34",),
        "registry.example.com": ("93.184.216.35",),
        "auth.example.com": ("93.184.216.36",),
    }.get(hostname, ("93.184.216.37",))


def test_helm_source_allowlist_is_not_coupled_to_alert_webhook_setting(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ALERT_WEBHOOK_ALLOWED_HOSTS", "alerts.example.com")
    monkeypatch.setenv("HELM_CHART_SOURCE_ALLOWED_HOSTS", "charts.example.com")

    assert (
        normalize_helm_chart_source_reference(
            "repository",
            "https://charts.example.com/stable",
        )
        == "https://charts.example.com/stable"
    )

    with pytest.raises(ValueError, match="invalid Helm chart source"):
        normalize_helm_chart_source_reference(
            "repository",
            "https://unlisted.example.com/stable",
        )


def test_validated_destination_is_ip_pinned_with_original_host_and_sni(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    resolved: list[str] = []

    async def resolver(hostname: str) -> tuple[str, ...]:
        resolved.append(hostname)
        return ("93.184.216.34",)

    async def validate(_url: str, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr("domains.helm.source_provider.validate_outbound_url", validate)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "93.184.216.34"
        assert request.headers["host"] == "charts.example.com"
        assert request.extensions["sni_hostname"] == "charts.example.com"
        return httpx.Response(
            200,
            text=("apiVersion: v1\nentries:\n  storefront:\n    - version: 1.0.0\n"),
        )

    provider = HelmChartVersionProvider(
        transport=httpx.MockTransport(handler),
        resolver=resolver,
    )
    result = asyncio.run(provider.fetch_versions(_source(), "storefront"))

    assert result.availability == "available"
    assert resolved == ["charts.example.com"]


def test_repository_index_fetch_is_semver_sorted_bounded_and_never_returns_raw(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    entries = [
        {
            "version": f"1.0.{index}",
            "appVersion": f"app-{index}",
            "deprecated": index == 0,
            "digest": f"raw-digest-{index}",
            "urls": [f"https://secret.example.com/chart-{index}.tgz?token=must-not-leak"],
        }
        for index in range(205)
    ]

    async def validate(_url: str, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr("domains.helm.source_provider.validate_outbound_url", validate)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://93.184.216.34/stable/index.yaml"
        assert request.headers["host"] == "charts.example.com"
        return httpx.Response(
            200,
            text=(
                "apiVersion: v1\nentries:\n  storefront:\n"
                + "".join(
                    "    - version: {version}\n"
                    "      appVersion: {appVersion}\n"
                    "      deprecated: {deprecated}\n"
                    "      digest: {digest}\n"
                    "      urls:\n"
                    "        - {url}\n".format(
                        version=item["version"],
                        appVersion=item["appVersion"],
                        deprecated=str(item["deprecated"]).lower(),
                        digest=item["digest"],
                        url=item["urls"][0],
                    )
                    for item in entries
                )
            ),
        )

    provider = HelmChartVersionProvider(
        transport=httpx.MockTransport(handler),
        resolver=_public_resolver,
    )
    result = asyncio.run(provider.fetch_versions(_source(), "storefront"))
    body = result.model_dump(mode="json")

    assert result.availability == "partial"
    assert result.truncated is True
    assert result.reason_codes == ("helm_chart_versions_truncated",)
    assert len(result.versions) == 200
    assert result.versions[0].version == "1.0.204"
    assert result.versions[-1].version == "1.0.5"
    assert "must-not-leak" not in str(body)
    assert "raw-digest" not in str(body)


def test_oci_tag_fetch_uses_registry_api_and_returns_one_source_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    validated: list[str] = []

    async def validate(url: str, **_kwargs: object) -> None:
        validated.append(url)

    monkeypatch.setattr("domains.helm.source_provider.validate_outbound_url", validate)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v2/platform/charts/storefront/tags/list"
        assert request.url.params["n"] == "201"
        return httpx.Response(
            200,
            json={
                "name": "platform/charts/storefront",
                "tags": ["1.2.0", "2.0.0-rc.1", "2.0.0", "latest", "1.10.0"],
                "internal": {"token": "must-not-leak"},
            },
        )

    provider = HelmChartVersionProvider(
        transport=httpx.MockTransport(handler),
        resolver=_public_resolver,
    )
    result = asyncio.run(
        provider.fetch_versions(
            _source(
                provider="oci",
                reference="oci://registry.example.com/platform/charts",
            ),
            "storefront",
        )
    )

    assert validated == [
        "https://registry.example.com/v2/platform/charts/storefront/tags/list?n=201"
    ]
    assert result.availability == "available"
    assert [item.version for item in result.versions] == [
        "2.0.0",
        "2.0.0-rc.1",
        "1.10.0",
        "1.2.0",
    ]
    assert "must-not-leak" not in str(result.model_dump(mode="json"))


def test_oci_basic_credential_follows_only_validated_bearer_challenge(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    validated: list[str] = []

    async def validate(url: str, **_kwargs: object) -> None:
        validated.append(url)

    monkeypatch.setattr("domains.helm.source_provider.validate_outbound_url", validate)
    calls: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        authorization = request.headers.get("authorization", "")
        calls.append((str(request.url), authorization))
        if request.headers["host"] == "auth.example.com":
            assert authorization.startswith("Basic ")
            return httpx.Response(200, json={"token": "short-lived-registry-token"})
        if authorization == "Bearer short-lived-registry-token":
            return httpx.Response(200, json={"tags": ["1.0.0"]})
        return httpx.Response(
            401,
            headers={
                "www-authenticate": (
                    'Bearer realm="https://auth.example.com/token",'
                    'service="registry.example.com",'
                    'scope="repository:platform/charts/storefront:pull"'
                )
            },
        )

    provider = HelmChartVersionProvider(
        transport=httpx.MockTransport(handler),
        resolver=_public_resolver,
    )
    result = asyncio.run(
        provider.fetch_versions(
            _source(
                provider="oci",
                reference="oci://registry.example.com/platform/charts",
            ),
            "storefront",
            credential=HelmProviderCredential(
                kind="basic",
                username="robot",
                password="provider-secret",
            ),
        )
    )

    assert result.availability == "available"
    assert [item.version for item in result.versions] == ["1.0.0"]
    assert len(calls) == 3
    assert validated[1].startswith("https://auth.example.com/token?")
    assert "provider-secret" not in str(result.model_dump(mode="json"))
    assert "short-lived-registry-token" not in str(result.model_dump(mode="json"))


def test_public_oci_bearer_challenge_uses_anonymous_token_exchange(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def validate(_url: str, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr("domains.helm.source_provider.validate_outbound_url", validate)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.headers["host"] == "auth.example.com":
            assert "authorization" not in request.headers
            return httpx.Response(200, json={"token": "anonymous-pull-token"})
        if request.headers.get("authorization") == "Bearer anonymous-pull-token":
            return httpx.Response(200, json={"tags": ["3.0.0"]})
        return httpx.Response(
            401,
            headers={
                "www-authenticate": (
                    'Bearer realm="https://auth.example.com/token",'
                    'service="registry.example.com",'
                    'scope="repository:platform/charts/storefront:pull"'
                )
            },
        )

    provider = HelmChartVersionProvider(
        transport=httpx.MockTransport(handler),
        resolver=_public_resolver,
    )
    result = asyncio.run(
        provider.fetch_versions(
            _source(
                provider="oci",
                reference="oci://registry.example.com/platform/charts",
            ),
            "storefront",
        )
    )

    assert result.availability == "available"
    assert [item.version for item in result.versions] == ["3.0.0"]


def test_idn_oci_bearer_realm_uses_canonical_idna_host_and_sni(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    resolved: list[str] = []

    async def resolver(hostname: str) -> tuple[str, ...]:
        resolved.append(hostname)
        return {
            "registry.example.com": ("93.184.216.35",),
            "xn--bcher-kva.example": ("93.184.216.36",),
        }[hostname]

    async def validate(_url: str, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr("domains.helm.source_provider.validate_outbound_url", validate)

    def handler(request: httpx.Request) -> httpx.Response:
        host = request.headers["host"]
        if host == "xn--bcher-kva.example:8443":
            assert request.extensions["sni_hostname"] == "xn--bcher-kva.example"
            return httpx.Response(200, json={"token": "anonymous-idn-token"})
        if request.headers.get("authorization") == "Bearer anonymous-idn-token":
            return httpx.Response(200, json={"tags": ["4.0.0"]})
        challenge = (
            'Bearer realm="https://b\u00fccher.example:8443/token",'
            'service="registry.example.com",'
            'scope="repository:platform/charts/storefront:pull"'
        )
        return httpx.Response(
            401,
            headers=[(b"www-authenticate", challenge.encode("utf-8"))],
        )

    provider = HelmChartVersionProvider(
        transport=httpx.MockTransport(handler),
        resolver=resolver,
    )
    result = asyncio.run(
        provider.fetch_versions(
            _source(
                provider="oci",
                reference="oci://registry.example.com/platform/charts",
            ),
            "storefront",
        )
    )

    assert result.availability == "available"
    assert [item.version for item in result.versions] == ["4.0.0"]
    assert resolved == [
        "registry.example.com",
        "xn--bcher-kva.example",
        "registry.example.com",
    ]


def test_header_serialization_failure_is_typed_and_fail_closed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def validate(_url: str, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr("domains.helm.source_provider.validate_outbound_url", validate)
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, text="apiVersion: v1\nentries: {}")

    provider = HelmChartVersionProvider(
        transport=httpx.MockTransport(handler),
        resolver=_public_resolver,
    )
    result = asyncio.run(
        provider.fetch_versions(
            _source(),
            "storefront",
            credential=HelmProviderCredential(kind="bearer", token="\ud55c\uae00-token"),
        )
    )

    assert result.availability == "unavailable"
    assert result.reason_codes == ("helm_chart_source_transport_error",)
    assert calls == 0


def test_provider_timeout_and_ssrf_failure_are_typed_without_raw_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def valid(_url: str, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr("domains.helm.source_provider.validate_outbound_url", valid)

    def timeout_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("secret upstream detail", request=request)

    provider = HelmChartVersionProvider(
        transport=httpx.MockTransport(timeout_handler),
        resolver=_public_resolver,
    )
    timeout = asyncio.run(provider.fetch_versions(_source(), "storefront"))
    assert timeout.availability == "unavailable"
    assert timeout.reason_codes == ("helm_chart_source_timeout",)
    assert "secret upstream detail" not in str(timeout.model_dump(mode="json"))

    calls = 0

    def should_not_run(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, text="apiVersion: v1\nentries: {}")

    async def unsafe(_url: str, **_kwargs: object) -> None:
        raise UnsafeOutboundUrlError("private target")

    monkeypatch.setattr("domains.helm.source_provider.validate_outbound_url", unsafe)
    provider = HelmChartVersionProvider(
        transport=httpx.MockTransport(should_not_run),
        resolver=_public_resolver,
    )
    blocked = asyncio.run(provider.fetch_versions(_source(), "storefront"))
    assert blocked.availability == "unavailable"
    assert blocked.reason_codes == ("helm_chart_source_unsafe_destination",)
    assert calls == 0


def test_provider_rejects_oversized_or_invalid_payload_without_echo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def validate(_url: str, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr("domains.helm.source_provider.validate_outbound_url", validate)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-length": str(3 * 1024 * 1024)},
            content=b"secret-body-must-not-leak",
        )

    provider = HelmChartVersionProvider(
        transport=httpx.MockTransport(handler),
        resolver=_public_resolver,
    )
    result = asyncio.run(provider.fetch_versions(_source(), "storefront"))

    assert result.availability == "unavailable"
    assert result.reason_codes == ("helm_chart_source_response_too_large",)
    assert "secret-body" not in str(result.model_dump(mode="json"))


@pytest.mark.parametrize(
    ("provider_name", "reference", "body"),
    (
        (
            "repository",
            "https://charts.example.com/stable",
            (
                "apiVersion: v1\nentries:\n  storefront:\n    - version: "
                + "[" * 1_200
                + "x"
                + "]" * 1_200
            ).encode(),
        ),
        (
            "oci",
            "oci://registry.example.com/platform/charts",
            ('{"tags":' + "[" * 10_000 + "0" + "]" * 10_000 + "}").encode(),
        ),
    ),
    ids=("deep-yaml", "deep-json"),
)
def test_provider_rejects_deep_documents_without_uncaught_recursion(
    provider_name: str,
    reference: str,
    body: bytes,
) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=body)

    provider = HelmChartVersionProvider(
        transport=httpx.MockTransport(handler),
        resolver=_public_resolver,
    )
    result = asyncio.run(
        provider.fetch_versions(
            _source(provider=provider_name, reference=reference),
            "storefront",
        )
    )

    assert result.availability == "unavailable"
    assert result.reason_codes == ("helm_chart_source_invalid_response",)


def test_provider_absolute_deadline_stops_slow_drip_stream() -> None:
    class SlowStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            for chunk in (
                b"apiVersion: v1\nentries:\n  storefront:\n",
                b"    - version: 1.0.0\n",
            ):
                await asyncio.sleep(0.03)
                yield chunk

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, stream=SlowStream())

    provider = HelmChartVersionProvider(
        timeout_seconds=0.01,
        transport=httpx.MockTransport(handler),
        resolver=_public_resolver,
    )
    result = asyncio.run(provider.fetch_versions(_source(), "storefront"))

    assert result.availability == "unavailable"
    assert result.reason_codes == ("helm_chart_source_timeout",)


def test_provider_absolute_deadline_includes_dns_resolution() -> None:
    transport_calls = 0

    async def slow_resolver(_hostname: str) -> tuple[str, ...]:
        await asyncio.sleep(0.03)
        return ("93.184.216.34",)

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal transport_calls
        transport_calls += 1
        return httpx.Response(200, text="apiVersion: v1\nentries: {}")

    provider = HelmChartVersionProvider(
        timeout_seconds=0.01,
        transport=httpx.MockTransport(handler),
        resolver=slow_resolver,
    )
    result = asyncio.run(provider.fetch_versions(_source(), "storefront"))

    assert result.availability == "unavailable"
    assert result.reason_codes == ("helm_chart_source_timeout",)
    assert transport_calls == 0


def test_provider_rejects_encoded_response_before_decompression() -> None:
    stream_iterated = False
    compressed = gzip.compress(b"x" * (HELM_CHART_PROVIDER_MAX_RESPONSE_BYTES + 1))

    class TrackingStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            nonlocal stream_iterated
            stream_iterated = True
            yield compressed

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["accept-encoding"] == "identity"
        return httpx.Response(
            200,
            headers={"content-encoding": "gzip"},
            stream=TrackingStream(),
        )

    provider = HelmChartVersionProvider(
        transport=httpx.MockTransport(handler),
        resolver=_public_resolver,
    )
    result = asyncio.run(provider.fetch_versions(_source(), "storefront"))

    assert result.availability == "unavailable"
    assert result.reason_codes == ("helm_chart_source_invalid_response",)
    assert stream_iterated is False


def test_provider_checks_chunk_size_before_extending_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class GuardedBytearray(bytearray):
        def extend(self, chunk: bytes) -> None:
            assert len(self) + len(chunk) <= HELM_CHART_PROVIDER_MAX_RESPONSE_BYTES
            super().extend(chunk)

    class OversizedStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b"x" * (HELM_CHART_PROVIDER_MAX_RESPONSE_BYTES + 1)

    monkeypatch.setattr(
        source_provider_module,
        "bytearray",
        GuardedBytearray,
        raising=False,
    )

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, stream=OversizedStream())

    provider = HelmChartVersionProvider(
        transport=httpx.MockTransport(handler),
        resolver=_public_resolver,
    )
    result = asyncio.run(provider.fetch_versions(_source(), "storefront"))

    assert result.availability == "unavailable"
    assert result.reason_codes == ("helm_chart_source_response_too_large",)


@pytest.mark.parametrize(
    "body",
    (
        ("release: &release 1.0.0\nentries:\n  storefront:\n    - version: *release\n"),
        ("entries:\n  storefront:\n    - <<:\n        version: 1.0.0\n"),
    ),
    ids=("alias", "merge-key"),
)
def test_repository_provider_rejects_yaml_aliases_and_merge_keys(body: str) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=body.encode())

    provider = HelmChartVersionProvider(
        transport=httpx.MockTransport(handler),
        resolver=_public_resolver,
    )
    result = asyncio.run(provider.fetch_versions(_source(), "storefront"))

    assert result.availability == "unavailable"
    assert result.reason_codes == ("helm_chart_source_invalid_response",)


def test_yaml_merge_alias_amplification_is_rejected_before_construction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lines = ["base: &base", "  version: 1.0.0"]
    previous = "base"
    for index in range(12):
        current = f"layer{index}"
        lines.extend(
            (
                f"{current}: &{current}",
                f"  <<: [*{previous}, *{previous}]",
            )
        )
        previous = current
    lines.extend(("entries:", "  storefront:", f"    - <<: *{previous}"))
    body = ("\n".join(lines) + "\n").encode()

    def construction_must_not_start(*_args: object, **_kwargs: object) -> object:
        raise AssertionError("alias amplification reached YAML construction")

    monkeypatch.setattr(
        source_provider_module._BoundedSafeLoader,
        "construct_object",
        construction_must_not_start,
    )

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=body)

    provider = HelmChartVersionProvider(
        transport=httpx.MockTransport(handler),
        resolver=_public_resolver,
    )
    result = asyncio.run(provider.fetch_versions(_source(), "storefront"))

    assert result.availability == "unavailable"
    assert result.reason_codes == ("helm_chart_source_invalid_response",)


def test_allowed_yaml_construction_work_is_bounded_by_composed_nodes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    constructed_nodes = 0
    original = source_provider_module._BoundedSafeLoader.construct_object

    def counted_construct_object(
        loader: object,
        node: object,
        deep: bool = False,
    ) -> object:
        nonlocal constructed_nodes
        constructed_nodes += 1
        return original(loader, node, deep=deep)

    monkeypatch.setattr(
        source_provider_module._BoundedSafeLoader,
        "construct_object",
        counted_construct_object,
    )
    body = (
        "apiVersion: v1\nentries:\n  storefront:\n"
        + "".join(f"    - version: 1.0.{index}\n" for index in range(1_000))
    ).encode()

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=body)

    provider = HelmChartVersionProvider(
        transport=httpx.MockTransport(handler),
        resolver=_public_resolver,
    )
    result = asyncio.run(provider.fetch_versions(_source(), "storefront"))

    assert result.availability == "partial"
    assert result.truncated is True
    assert constructed_nodes <= HELM_CHART_PROVIDER_MAX_STRUCTURE_TOKENS

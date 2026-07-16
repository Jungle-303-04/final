from domains.helm.source_provider import resolve_helm_release_versions
from domains.helm.upgrade_projection import (
    helm_release_upgrade_info,
    helm_release_version_list,
)
from packages.contracts.helm.sources import (
    HelmChartSource,
    HelmChartVersion,
    HelmChartVersionObservation,
)


def _source(source_id: str, provider: str = "repository") -> HelmChartSource:
    reference = (
        f"https://{source_id}.example.test/charts"
        if provider == "repository"
        else f"oci://{source_id}.example.test/charts"
    )
    return HelmChartSource(
        source_id=source_id,
        provider=provider,
        name=source_id,
        reference=reference,
        status="active",
        credentials_configured=False,
    )


def _observation(
    source_id: str,
    *versions: str,
    provider: str = "repository",
    availability: str = "available",
    reason_codes: tuple[str, ...] = (),
) -> HelmChartVersionObservation:
    return HelmChartVersionObservation(
        source=_source(source_id, provider),
        chart_name="storefront",
        availability=availability,
        versions=tuple(HelmChartVersion(version=version) for version in versions),
        observed_at="2026-07-17T00:00:00+00:00",
        truncated=availability == "partial",
        reason_codes=reason_codes,
    )


def test_release_version_resolution_uses_the_only_source_containing_current_version() -> None:
    resolution = resolve_helm_release_versions(
        "1.2.3",
        (
            _observation("source-a", "2.0.0", "1.2.3"),
            _observation("source-b", "9.0.0", "8.0.0", provider="oci"),
        ),
    )

    assert resolution.availability == "available"
    assert resolution.source is not None
    assert resolution.source.source_id == "source-a"
    assert [item.version for item in resolution.versions] == ["2.0.0", "1.2.3"]


def test_release_version_resolution_never_guesses_between_same_named_sources() -> None:
    resolution = resolve_helm_release_versions(
        "1.2.3",
        (
            _observation("source-a", "2.0.0", "1.2.3"),
            _observation("source-b", "3.0.0", "1.2.3", provider="oci"),
        ),
    )

    assert resolution.availability == "unavailable"
    assert resolution.source is None
    assert resolution.versions == ()
    assert resolution.reason_codes == ("helm_chart_source_ambiguous",)


def test_upgrade_projection_preserves_partial_provider_evidence_and_exact_versions() -> None:
    resolution = resolve_helm_release_versions(
        "1.2.3",
        (
            _observation(
                "source-a",
                "2.0.0",
                "1.2.3",
                availability="partial",
                reason_codes=("helm_chart_versions_truncated",),
            ),
        ),
    )

    info = helm_release_upgrade_info(
        chart_name="storefront",
        current_version="1.2.3",
        resolution=resolution,
    ).model_dump(mode="json")
    versions = helm_release_version_list(
        chart_name="storefront",
        current_version="1.2.3",
        resolution=resolution,
    ).model_dump(mode="json")

    assert info == {
        "availability": "partial",
        "chart_name": "storefront",
        "current_version": "1.2.3",
        "latest_version": "2.0.0",
        "update_available": True,
        "source": {
            "source_id": "source-a",
            "provider": "repository",
            "name": "source-a",
            "reference": "https://source-a.example.test/charts",
            "status": "active",
            "actions": [],
            "credentials_configured": False,
            "observed_at": None,
        },
        "observed_at": "2026-07-17T00:00:00+00:00",
        "reason_codes": ["helm_chart_versions_truncated"],
        "refresh_after_seconds": 10,
    }
    assert [item["version"] for item in versions["versions"]] == ["2.0.0", "1.2.3"]
    assert versions["truncated"] is True
    assert versions["refresh_after_seconds"] == 10

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from domains.helm.upgrade_service import _observe_chart_sources
from packages.contracts.helm.sources import (
    HelmChartSource,
    HelmChartVersion,
    HelmChartVersionObservation,
)


def _record(index: int) -> dict[str, object]:
    return {
        "source_id": f"source-{index:02d}",
        "workspace_id": "workspace-a",
        "provider": "repository",
        "name": f"Source {index:02d}",
        "canonical_ref": f"https://source-{index:02d}.example.test/charts",
        "credential_ref": None,
        "status": "active",
        "updated_at": datetime(2026, 7, 17, tzinfo=UTC),
    }


class _OneFailingProvider:
    async def fetch_versions(
        self,
        source: HelmChartSource,
        chart_name: str,
        *,
        credential: object = None,
    ) -> HelmChartVersionObservation:
        assert credential is None
        if source.source_id == "source-01":
            raise RuntimeError("provider detail must not escape")
        return HelmChartVersionObservation(
            source=source,
            chart_name=chart_name,
            availability="available",
            versions=(HelmChartVersion(version="1.0.0"),),
        )


def test_provider_exception_is_isolated_as_explicit_unavailable_evidence() -> None:
    observations = asyncio.run(
        _observe_chart_sources(
            db=object(),
            workspace_id="workspace-a",
            records=(_record(0), _record(1)),
            chart_names=("storefront",),
            provider=_OneFailingProvider(),
        )
    )["storefront"]

    assert len(observations) == 2
    failed = next(item for item in observations if item.source.source_id == "source-01")
    assert failed.availability == "unavailable"
    assert failed.versions == ()
    assert failed.reason_codes == ("helm_chart_source_provider_error",)


class _BlockingProvider:
    def __init__(self) -> None:
        self.active = 0
        self.max_active = 0
        self.started = 0

    async def fetch_versions(
        self,
        source: HelmChartSource,
        chart_name: str,
        *,
        credential: object = None,
    ) -> HelmChartVersionObservation:
        del source, chart_name, credential
        self.started += 1
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        try:
            await asyncio.Event().wait()
        finally:
            self.active -= 1
        raise AssertionError("cancelled provider work must not continue")


def test_large_batch_uses_fixed_workers_and_marks_deadline_remainder(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "domains.helm.upgrade_service.integral_refresh_after_seconds",
        lambda _key: 0.01,
        raising=False,
    )
    provider = _BlockingProvider()
    grouped = asyncio.run(
        _observe_chart_sources(
            db=object(),
            workspace_id="workspace-a",
            records=tuple(_record(index) for index in range(20)),
            chart_names=tuple(f"chart-{index:03d}" for index in range(100)),
            provider=provider,
        )
    )

    assert provider.max_active <= 8
    assert provider.started <= 8
    assert provider.active == 0
    assert len(grouped) == 100
    assert all(len(items) == 20 for items in grouped.values())
    assert all(
        item.reason_codes == ("helm_chart_source_batch_timeout",)
        for items in grouped.values()
        for item in items
    )

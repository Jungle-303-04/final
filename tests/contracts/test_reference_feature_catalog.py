from __future__ import annotations

import pytest

from packages.contracts.reference_feature_catalog import (
    feature_contract,
    load_feature_contract_catalog,
)


def test_generated_feature_contract_catalog_contains_every_ledger_feature() -> None:
    catalog = load_feature_contract_catalog()

    assert catalog.feature_count == len(catalog.features)
    assert len({feature.contract_id for feature in catalog.features}) == catalog.feature_count
    assert len({feature.id for feature in catalog.features}) == catalog.feature_count
    assert all(feature.area for feature in catalog.features)
    assert all(feature.backend_contract for feature in catalog.features)
    assert all(feature.frontend_contract for feature in catalog.features)
    assert all(feature.verification for feature in catalog.features)
    assert all(
        feature.coverage.realtime == "not_required"
        for feature in catalog.features
        if not feature.streaming
    )
    assert {feature.delivery_status for feature in catalog.features} >= {
        "implemented",
        "in_progress",
        "planned",
        "reference_only",
        "not_applicable",
    }
    assert any(feature.desktop_contract == "desktop" for feature in catalog.features)
    assert any(feature.streaming for feature in catalog.features)


def test_feature_contract_lookup_is_catalog_driven() -> None:
    catalog = load_feature_contract_catalog()
    first = catalog.features[0]

    assert feature_contract(first.contract_id) == first
    with pytest.raises(KeyError, match="unknown feature contract"):
        feature_contract("reference.feature.unknown")

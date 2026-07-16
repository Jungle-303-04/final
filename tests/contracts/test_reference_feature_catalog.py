from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from packages.contracts.reference_feature_catalog import (
    CATALOG_PATH,
    ReferenceFeatureContract,
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
        "in_progress",
        "planned",
        "reference_only",
        "not_applicable",
    }
    implemented = [
        feature for feature in catalog.features if feature.delivery_status == "implemented"
    ]
    assert implemented
    assert all(feature.source_key for feature in implemented)
    assert all(feature.coverage.backend is not None for feature in implemented)
    assert all(feature.coverage.frontend is not None for feature in implemented)
    assert all(
        feature.coverage.realtime != "not_required" or not feature.streaming
        for feature in implemented
    )
    assert all(feature.delivery_status == "not_applicable" for feature in catalog.features[:3])
    assert any(feature.desktop_contract == "desktop" for feature in catalog.features)
    assert any(feature.streaming for feature in catalog.features)
    assert all(feature.contract_id in feature.legacy_contract_ids for feature in catalog.features)
    assert all(
        feature.identity_status == ("source-key" if feature.source_key else "legacy-unmapped")
        for feature in catalog.features
    )


def test_feature_contract_lookup_is_catalog_driven() -> None:
    catalog = load_feature_contract_catalog()
    first = catalog.features[0]

    assert feature_contract(first.contract_id) == first
    with pytest.raises(KeyError, match="unknown feature contract"):
        feature_contract("reference.feature.unknown")


def test_feature_contract_rejects_inconsistent_generated_identity_lineage() -> None:
    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))["features"][0]
    source_key_payload = {
        **payload,
        "sourceKey": "upstream-ui:shell:command-palette:open:v1",
        "identityStatus": "source-key",
    }

    assert (
        ReferenceFeatureContract.model_validate(source_key_payload).source_key
        == source_key_payload["sourceKey"]
    )

    with pytest.raises(ValidationError, match="identityStatus"):
        ReferenceFeatureContract.model_validate({**payload, "identityStatus": "source-key"})
    with pytest.raises(ValidationError, match="identityStatus"):
        ReferenceFeatureContract.model_validate(
            {**source_key_payload, "identityStatus": "legacy-unmapped"}
        )
    with pytest.raises(ValidationError, match="legacyContractIds"):
        ReferenceFeatureContract.model_validate(
            {**payload, "legacyContractIds": ["reference.feature.other"]}
        )
    with pytest.raises(ValidationError, match="Extra inputs"):
        ReferenceFeatureContract.model_validate({**payload, "unexpectedIdentity": "forbidden"})

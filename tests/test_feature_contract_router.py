from __future__ import annotations

import asyncio
from types import SimpleNamespace

from domains.parity.router import list_feature_contracts
from packages.contracts.reference_feature_catalog import load_feature_contract_catalog


def test_feature_contract_catalog_route_returns_generated_catalog_for_authenticated_session() -> (
    None
):
    catalog = asyncio.run(
        list_feature_contracts(SimpleNamespace(user_id="user-1", workspace_id="workspace-1"))
    )

    assert catalog == load_feature_contract_catalog()
    assert catalog.features[0].contract_id == "reference.feature.001"
    assert catalog.features[0].area == "migration-governance"
    assert catalog.features[0].delivery_status == "implemented"
    assert any(feature.streaming for feature in catalog.features)

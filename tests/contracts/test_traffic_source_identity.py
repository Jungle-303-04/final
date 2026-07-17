from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IDENTITIES = ROOT / "docs" / "migration" / "reference-feature-source-identities.json"
ALIASES = ROOT / "docs" / "migration" / "reference-feature-source-aliases.json"
FEATURE_LEDGER = ROOT / "docs" / "migration" / "reference-feature-ledger.json"
SOURCE_LEDGER = ROOT / "docs" / "migration" / "reference-source-ledger.json"


def test_traffic_baseline_features_have_exact_frozen_source_identities() -> None:
    identities = json.loads(IDENTITIES.read_text(encoding="utf-8"))
    aliases = json.loads(ALIASES.read_text(encoding="utf-8"))["aliases"]
    features = {
        row["contractId"]: row
        for row in json.loads(FEATURE_LEDGER.read_text(encoding="utf-8"))["features"]
    }
    source_rows = {
        row["path"]: row for row in json.loads(SOURCE_LEDGER.read_text(encoding="utf-8"))["files"]
    }

    expected_contracts = {
        "reference.feature.178",
        "reference.feature.179",
        "reference.feature.180",
        "reference.feature.182",
    }
    mapped: set[str] = set()
    for identity in identities["identities"]:
        contracts = set(identity.get("legacyContractIds", ()))
        legacy_contract_id = identity.get("legacyContractId")
        if isinstance(legacy_contract_id, str):
            contracts.add(legacy_contract_id)
        relevant = contracts & expected_contracts
        if not relevant:
            continue
        mapped.update(relevant)
        for contract_id in relevant:
            assert aliases[contract_id] == identity["sourceKey"]
            assert features[contract_id]["sourceKey"] == identity["sourceKey"]
        for evidence in identity["evidence"]:
            frozen = ROOT / "references" / "upstream" / evidence["path"]
            content = frozen.read_bytes()
            assert hashlib.sha256(content).hexdigest() == evidence["sha256"]
            assert source_rows[evidence["path"]]["sha256"] == evidence["sha256"]
            assert evidence["symbol"] in content.decode("utf-8")
    assert mapped == expected_contracts

"""Generated reference-feature contract catalog loader.

The JSON is produced from the complete feature ledger.  Runtime code reads this
typed catalog rather than duplicating a route or action list in Python.
"""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path
from typing import Literal, Self

from pydantic import Field, model_validator

from packages.contracts.gateway.base import StrictModel

CATALOG_PATH = Path(__file__).with_name("reference_feature_catalog.json")


class ReferenceFeatureCoverage(StrictModel):
    """Per-feature proof links; null means that boundary is not implemented yet."""

    backend: dict[str, str] | None
    frontend: dict[str, str] | None
    desktop: dict[str, str] | None
    realtime: dict[str, str] | Literal["not_required"] | None


class ReferenceFeatureContract(StrictModel):
    contract_id: str = Field(min_length=1, validation_alias="contractId")
    id: str = Field(min_length=1)
    section: str = Field(min_length=1)
    endpoints: tuple[str, ...] = ()
    streaming: bool
    area: str = Field(min_length=1)
    delivery_status: Literal[
        "implemented",
        "in_progress",
        "planned",
        "reference_only",
        "not_applicable",
    ] = Field(validation_alias="deliveryStatus")
    backend_contract: str = Field(min_length=1, validation_alias="backendContract")
    frontend_contract: str = Field(min_length=1, validation_alias="frontendContract")
    desktop_contract: str | None = Field(validation_alias="desktopContract")
    verification: tuple[str, ...] = Field(min_length=1)
    coverage: ReferenceFeatureCoverage


class ReferenceFeatureContractCatalog(StrictModel):
    schema_version: int = Field(validation_alias="schemaVersion")
    source_revision: str = Field(min_length=40, max_length=40, validation_alias="sourceRevision")
    feature_count: int = Field(ge=0, validation_alias="featureCount")
    features: tuple[ReferenceFeatureContract, ...]

    @model_validator(mode="after")
    def validate_features(self) -> Self:
        if self.feature_count != len(self.features):
            raise ValueError("featureCount must equal the loaded feature count")
        contract_ids = [feature.contract_id for feature in self.features]
        if len(contract_ids) != len(set(contract_ids)):
            raise ValueError("feature contract IDs must be unique")
        feature_ids = [feature.id for feature in self.features]
        if len(feature_ids) != len(set(feature_ids)):
            raise ValueError("feature IDs must be unique")
        return self


@cache
def load_feature_contract_catalog() -> ReferenceFeatureContractCatalog:
    try:
        raw = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except OSError as exc:
        raise RuntimeError(f"reference feature catalog is unavailable: {CATALOG_PATH}") from exc
    return ReferenceFeatureContractCatalog.model_validate(raw)


def feature_contract(contract_id: str) -> ReferenceFeatureContract:
    for contract in load_feature_contract_catalog().features:
        if contract.contract_id == contract_id:
            return contract
    raise KeyError(f"unknown feature contract: {contract_id}")

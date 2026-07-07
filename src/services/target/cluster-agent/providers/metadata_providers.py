from __future__ import annotations

from datetime import UTC, datetime

import httpx
from queries import MetadataSnapshotQuery
from telemetry_registry import telemetry

from config import KUBERNETES_API_TIMEOUT_SECONDS, TARGET_CLUSTER_ID_ENV
from packages.config.constants import Target
from packages.contracts.event_bus.interfaces import JsonObject
from providers.base import ConfigReader


@telemetry.source(
    source="metadata",
    evidence_key="metadata",
    query_type=MetadataSnapshotQuery,
    empty_payload=dict,
)
class MetadataProvider:
    """Collect change context metadata for RCA.
    It builds the metadata evidence bucket.
    """

    span_name = "metadata.collect"
    query_count_attribute = "metadata.query_count"
    result_count_attribute = "metadata.result_count"
    timeout_seconds = KUBERNETES_API_TIMEOUT_SECONDS
    failure_message = "metadata collection failed"
    queries: tuple[MetadataSnapshotQuery, ...] = ()

    def __init__(self, *, cluster_id: str) -> None:
        """Store the target cluster id."""
        self.cluster_id = cluster_id

    @classmethod
    def from_config(cls, read_config: ConfigReader) -> MetadataProvider:
        """Create the provider from agent config values."""
        return cls(cluster_id=read_config(TARGET_CLUSTER_ID_ENV, Target.DEFAULT_CLUSTER_ID))

    async def query(
        self,
        _client: httpx.AsyncClient,
        _telemetry_query: MetadataSnapshotQuery,
    ) -> JsonObject:
        """Return the current change context metadata."""
        return {
            "cluster_id": self.cluster_id,
            "collected_at": datetime.now(UTC).isoformat(),
            "change_context": empty_change_context(),
        }

    def empty_results(self) -> JsonObject:
        """Create an empty metadata evidence bucket."""
        return {
            "change_context": empty_change_context(),
        }

    def append_result(
        self,
        results: JsonObject,
        telemetry_query: MetadataSnapshotQuery,
        payload: JsonObject,
    ) -> None:
        """Normalize one metadata result and merge it into the bucket."""
        results["change_context"] = self.normalize_payload(payload, telemetry_query)

    def build_response(self, results: JsonObject) -> JsonObject:
        """Return the finished metadata evidence bucket."""
        return results

    def normalize_payload(
        self,
        payload: JsonObject,
        _telemetry_query: MetadataSnapshotQuery,
    ) -> JsonObject:
        """Turn raw metadata data into the change context shape."""
        change_context = payload.get("change_context", {})

        if not isinstance(change_context, dict):
            return empty_change_context()

        recent_changes = change_context.get("recent_changes", [])
        if not isinstance(recent_changes, list):
            recent_changes = []

        risk_level = change_context.get("risk_level", "unknown")
        if not isinstance(risk_level, str) or not risk_level:
            risk_level = "unknown"

        return {
            "recent_changes": recent_changes,
            "rollback_available": change_context.get("rollback_available"),
            "risk_level": risk_level,
        }


def empty_change_context() -> JsonObject:
    """Build the default change context shape."""
    return {
        "recent_changes": [],
        "rollback_available": None,
        "risk_level": "unknown",
    }

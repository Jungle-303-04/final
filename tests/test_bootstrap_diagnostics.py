from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from domains.diagnostics.router import (
    get_version_check_service,
    router,
)
from domains.diagnostics.version_check import (
    RELEASE_MANIFEST_MAX_BYTES,
    ReleaseManifestFetch,
    VersionCheckService,
)
from domains.identity.dependencies import require_session
from packages.contracts.bootstrap import (
    AGENT_DIAGNOSTICS_LIMIT,
    CONSUMER_LAG_LIMIT,
    AgentCollectionDiagnostics,
    AgentDiagnosticsItem,
    VersionCheckResponse,
)
from packages.runtime.dependencies import get_db


class RuntimeDiagnosticsDb:
    def __init__(self, *, cluster_count: int = 2, fail_event_pipeline: bool = False) -> None:
        self.cluster_count = cluster_count
        self.fail_event_pipeline = fail_event_pipeline
        self.calls: list[tuple[object, ...]] = []

    def accessible_resource_ids(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        self.calls.append(
            ("accessible_resource_ids", user_id, workspace_id, resource_type, permission)
        )
        return {f"cluster-{index:03d}" for index in range(self.cluster_count)}

    def list_cluster_registrations(
        self,
        workspace_id: str,
        *,
        cluster_ids: set[str] | None = None,
        limit: int = 100,
    ) -> list[dict[str, object]]:
        self.calls.append(("list_cluster_registrations", workspace_id, cluster_ids, limit))
        assert cluster_ids is not None
        return [
            {
                "workspace_id": workspace_id,
                "cluster_id": cluster_id,
                "name": f"Name {cluster_id}",
                "environment": "production",
                "status": "registered",
            }
            for cluster_id in sorted(cluster_ids)[:limit]
        ]

    def latest_cluster_agent_statuses(
        self,
        workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, dict[str, object]]:
        self.calls.append(("latest_cluster_agent_statuses", workspace_id, cluster_ids))
        observed_at = datetime.now(UTC).isoformat()
        return {
            cluster_id: {
                "cluster_id": cluster_id,
                "agent_id": f"agent-{cluster_id}",
                "status": "connected",
                "capabilities": ["logs", "inventory", "logs"],
                "last_seen_at": observed_at,
            }
            for cluster_id in cluster_ids
        }

    def latest_inventory_snapshots(
        self,
        workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, dict[str, object]]:
        self.calls.append(("latest_inventory_snapshots", workspace_id, cluster_ids))
        return {
            cluster_id: {
                "status": "complete",
                "source": "cluster-agent",
                "collected_at": "2026-07-16T08:00:00+00:00",
                "resource_count": 120,
            }
            for cluster_id in cluster_ids
        }

    def open_dead_letter_count(self) -> int:
        if self.fail_event_pipeline:
            raise RuntimeError("secret database endpoint")
        return 3

    def outbox_pending_count(self) -> int:
        return 4

    def event_processing_status_counts(self) -> dict[str, int]:
        return {"processed": 8, "failed": 2}

    def event_consumer_pending_by_consumer_subject(self) -> dict[tuple[str, str], int]:
        return {("consumer-b", "subject-b"): 6, ("consumer-a", "subject-a"): 1}

    def event_consumer_ack_pending_by_consumer_subject(self) -> dict[tuple[str, str], int]:
        return {("consumer-b", "subject-b"): 2}

    def event_consumer_redelivered_by_consumer_subject(self) -> dict[tuple[str, str], int]:
        return {("consumer-b", "subject-b"): 1}

    def timeline_diagnostics(self, workspace_id: str) -> dict[str, object]:
        self.calls.append(("timeline_diagnostics", workspace_id))
        return {
            "event_count": 12,
            "oldest_occurred_at": "2026-07-15T08:00:00+00:00",
            "newest_occurred_at": "2026-07-16T08:00:00+00:00",
            "high_water_sequence": 15,
            "retained_from_sequence": 4,
        }


class StaticVersionCheckService:
    async def check(self) -> VersionCheckResponse:
        return VersionCheckResponse(
            availability="unavailable",
            current_version="1.2.3",
            observed_at=datetime.now(UTC),
            reason_codes=["release_manifest_not_configured"],
        )


def _client(
    db: RuntimeDiagnosticsDb,
    *,
    version_service: object | None = None,
) -> TestClient:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-1",
        workspace_id="workspace-1",
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_version_check_service] = lambda: (
        version_service or StaticVersionCheckService()
    )
    return TestClient(app)


def test_runtime_diagnostics_is_session_scoped_batched_and_bounded() -> None:
    db = RuntimeDiagnosticsDb(cluster_count=AGENT_DIAGNOSTICS_LIMIT + 4)

    response = _client(db).get("/diagnostics")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    payload = response.json()
    assert payload["completeness"] == "partial"
    assert payload["reason_codes"] == ["agent_collection_limit_reached"]
    assert len(payload["agent_collection"]["items"]) == AGENT_DIAGNOSTICS_LIMIT
    assert [item["cluster_id"] for item in payload["agent_collection"]["items"]] == sorted(
        item["cluster_id"] for item in payload["agent_collection"]["items"]
    )
    assert payload["agent_collection"]["items"][0]["capabilities"] == ["inventory", "logs"]
    assert (
        "accessible_resource_ids",
        "user-1",
        "workspace-1",
        "cluster",
        "cluster.read",
    ) in db.calls
    assert len([call for call in db.calls if call[0] == "latest_cluster_agent_statuses"]) == 1
    assert len([call for call in db.calls if call[0] == "latest_inventory_snapshots"]) == 1


def test_runtime_diagnostics_prioritizes_nonzero_lag_before_bounded_idle_consumers() -> None:
    class HighLagRuntimeDiagnosticsDb(RuntimeDiagnosticsDb):
        def event_consumer_pending_by_consumer_subject(self) -> dict[tuple[str, str], int]:
            idle = {
                (f"idle-consumer-{index:03d}", f"idle.subject.{index:03d}"): 0
                for index in range(CONSUMER_LAG_LIMIT + 2)
            }
            return {
                **idle,
                ("zz-critical-consumer", "critical.subject"): 9,
            }

        def event_consumer_ack_pending_by_consumer_subject(
            self,
        ) -> dict[tuple[str, str], int]:
            return {("zz-critical-consumer", "critical.subject"): 2}

        def event_consumer_redelivered_by_consumer_subject(
            self,
        ) -> dict[tuple[str, str], int]:
            return {("zz-critical-consumer", "critical.subject"): 1}

    response = _client(HighLagRuntimeDiagnosticsDb()).get("/diagnostics")

    assert response.status_code == 200
    event_pipeline = response.json()["event_pipeline"]
    assert event_pipeline["availability"] == "available"
    assert event_pipeline["reason_codes"] == []
    assert event_pipeline["open_dead_letters"] == 3
    assert event_pipeline["outbox_pending"] == 4
    assert event_pipeline["consumer_lag"] == [
        {
            "consumer": "zz-critical-consumer",
            "subject": "critical.subject",
            "pending": 9,
            "ack_pending": 2,
            "redelivered": 1,
        }
    ]


def test_runtime_diagnostics_marks_only_an_actual_lag_sample_as_truncated() -> None:
    class ActualLagRuntimeDiagnosticsDb(RuntimeDiagnosticsDb):
        def event_consumer_pending_by_consumer_subject(self) -> dict[tuple[str, str], int]:
            return {
                (f"consumer-{index:03d}", f"subject.{index:03d}"): index + 1
                for index in range(CONSUMER_LAG_LIMIT + 2)
            }

        def event_consumer_ack_pending_by_consumer_subject(
            self,
        ) -> dict[tuple[str, str], int]:
            return {}

        def event_consumer_redelivered_by_consumer_subject(
            self,
        ) -> dict[tuple[str, str], int]:
            return {}

    response = _client(ActualLagRuntimeDiagnosticsDb()).get("/diagnostics")

    assert response.status_code == 200
    event_pipeline = response.json()["event_pipeline"]
    assert event_pipeline["availability"] == "partial"
    assert event_pipeline["reason_codes"] == ["consumer_lag_sample_truncated"]
    assert len(event_pipeline["consumer_lag"]) == CONSUMER_LAG_LIMIT
    assert event_pipeline["consumer_lag"][0]["pending"] == CONSUMER_LAG_LIMIT + 2
    assert event_pipeline["consumer_lag"][-1]["pending"] == 3


def test_runtime_diagnostics_preserves_partial_results_without_leaking_exception_text() -> None:
    db = RuntimeDiagnosticsDb(fail_event_pipeline=True)

    response = _client(db).get("/diagnostics")

    assert response.status_code == 200
    payload = response.json()
    assert payload["completeness"] == "partial"
    assert payload["event_pipeline"]["availability"] == "unavailable"
    assert payload["event_pipeline"]["reason_codes"] == ["event_pipeline_unavailable"]
    assert "secret database endpoint" not in response.text
    assert payload["timeline"]["event_count"] == 12
    assert len(payload["agent_collection"]["items"]) == 2


def test_get_and_post_diagnostics_routes_coexist_and_version_check_is_exposed() -> None:
    client = _client(RuntimeDiagnosticsDb())
    schema = client.app.openapi()

    assert set(schema["paths"]["/diagnostics"]) == {"get", "post"}
    assert set(schema["paths"]["/version-check"]) == {"get"}
    assert client.get("/version-check").headers["cache-control"] == "no-store"


def test_agent_diagnostics_contract_rejects_unbounded_items() -> None:
    item = AgentDiagnosticsItem(
        cluster_id="cluster-1",
        name="cluster-1",
        environment="production",
        registration_status="registered",
        connection_status="never_connected",
        capabilities=[],
    )

    with pytest.raises(ValidationError):
        AgentCollectionDiagnostics(
            availability="available",
            items=[item] * (AGENT_DIAGNOSTICS_LIMIT + 1),
        )


def test_unavailable_version_check_cannot_claim_an_update() -> None:
    with pytest.raises(ValidationError):
        VersionCheckResponse(
            availability="unavailable",
            current_version="1.2.3",
            latest_version="1.2.4",
            update_available=True,
            observed_at=datetime.now(UTC),
            reason_codes=["release_manifest_not_configured"],
        )


def test_version_check_without_release_source_is_honestly_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("RELEASE_MANIFEST_URL", raising=False)
    service = VersionCheckService(current_version=lambda: "1.2.3")

    response = asyncio.run(service.check())

    assert response.availability == "unavailable"
    assert response.current_version == "1.2.3"
    assert response.latest_version is None
    assert response.update_available is None
    assert response.reason_codes == ["release_manifest_not_configured"]


def test_version_check_uses_bounded_remote_manifest_and_semver_ordering() -> None:
    calls = 0

    async def fetch(_url: str) -> ReleaseManifestFetch:
        nonlocal calls
        calls += 1
        return ReleaseManifestFetch(
            status_code=200,
            content=b'{"version":"1.3.0","release_url":"https://example.com/releases/1.3.0",'
            b'"release_notes":"safe release"}',
        )

    service = VersionCheckService(
        manifest_url="https://example.com/release.json",
        current_version=lambda: "1.2.3",
        fetch_manifest=fetch,
    )

    first = asyncio.run(service.check())
    second = asyncio.run(service.check())

    assert first.availability == "available"
    assert first.latest_version == "1.3.0"
    assert first.update_available is True
    assert first.release_notes == "safe release"
    assert second == first
    assert calls == 1


def test_version_check_rejects_oversized_manifest() -> None:
    async def fetch(_url: str) -> ReleaseManifestFetch:
        return ReleaseManifestFetch(
            status_code=200,
            content=b"x" * (RELEASE_MANIFEST_MAX_BYTES + 1),
        )

    service = VersionCheckService(
        manifest_url="https://example.com/release.json",
        current_version=lambda: "1.2.3",
        fetch_manifest=fetch,
    )

    response = asyncio.run(service.check())

    assert response.availability == "unavailable"
    assert response.reason_codes == ["release_manifest_too_large"]


def test_version_check_contains_unexpected_fetch_failure() -> None:
    async def fetch(_url: str) -> ReleaseManifestFetch:
        raise RuntimeError("upstream secret")

    service = VersionCheckService(
        manifest_url="https://example.com/release.json",
        current_version=lambda: "1.2.3",
        fetch_manifest=fetch,
    )

    response = asyncio.run(service.check())

    assert response.availability == "unavailable"
    assert response.reason_codes == ["release_manifest_unavailable"]
    assert "secret" not in response.model_dump_json()


def test_version_check_rejects_unbounded_release_url() -> None:
    release_url = "https://example.com/" + ("x" * 2_100)

    async def fetch(_url: str) -> ReleaseManifestFetch:
        return ReleaseManifestFetch(
            status_code=200,
            content=('{"version":"1.3.0","release_url":' + f'"{release_url}"' + "}").encode(),
        )

    service = VersionCheckService(
        manifest_url="https://example.com/release.json",
        current_version=lambda: "1.2.3",
        fetch_manifest=fetch,
    )

    response = asyncio.run(service.check())

    assert response.availability == "unavailable"
    assert response.reason_codes == ["release_manifest_url_invalid"]

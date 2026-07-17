"""저장형 metric query/widget API 계약 검증."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

from fastapi import HTTPException

from domains.dashboard.router import (
    delete_metric_query_preset,
    list_metric_query_presets,
    queue_metrics_validation,
    run_metric_query_preset,
    upsert_metric_query_preset,
    upsert_metric_widget,
)
from packages.config.constants import Command, CommandStatus
from packages.contracts.gateway.requests import (
    AgentDebugQueryRequest,
    MetricQueryPresetUpsertRequest,
    MetricWidgetUpsertRequest,
)


def _current_session() -> SimpleNamespace:
    return SimpleNamespace(user_id="user-1", roles=("user",), workspace_id="workspace-1")


def _preset() -> dict[str, Any]:
    return {
        "preset_id": "preset-cpu",
        "workspace_id": "workspace-1",
        "cluster_id": "cluster-1",
        "name": "Pod CPU",
        "description": "Pod CPU usage",
        "source": "prometheus",
        "query": 'sum(rate(container_cpu_usage_seconds_total{namespace="sandbox"}[5m]))',
        "range_seconds": 900,
        "step_seconds": 30,
        "unit": "cores",
        "metadata": {"scope": "pod"},
        "created_by": "user-1",
        "created_at": "2026-07-07T00:00:00",
        "updated_at": "2026-07-07T00:00:00",
    }


class MetricPresetDb:
    def __init__(self, *, allowed_actions: set[str] | None = None) -> None:
        self.allowed_actions = allowed_actions or {
            "dashboard.read",
            "dashboard.manage",
            "evidence.read",
        }
        self.calls: list[tuple[Any, ...]] = []
        self.presets = {"preset-cpu": _preset()}
        self.commands: list[tuple[str, dict[str, Any], str]] = []
        self.deleted = False

    def user_has_resource_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        action: str,
    ) -> bool:
        self.calls.append(("access", user_id, workspace_id, resource_type, resource_id, action))
        return action in self.allowed_actions

    def list_metric_query_presets(
        self,
        workspace_id: str,
        cluster_id: str,
    ) -> list[dict[str, Any]]:
        self.calls.append(("list_presets", workspace_id, cluster_id))
        return list(self.presets.values())

    def get_metric_query_preset(
        self,
        workspace_id: str,
        cluster_id: str,
        preset_id: str,
    ) -> dict[str, Any] | None:
        self.calls.append(("get_preset", workspace_id, cluster_id, preset_id))
        preset = self.presets.get(preset_id)
        if preset is None or preset["cluster_id"] != cluster_id:
            return None
        return preset

    def upsert_metric_query_preset(
        self,
        row: dict[str, Any],
        *,
        conflict_by_name: bool = False,
    ) -> dict[str, Any]:
        self.calls.append(("upsert_preset", row, conflict_by_name))
        saved = {
            **row,
            "created_at": "2026-07-07T00:00:00",
            "updated_at": "2026-07-07T00:00:00",
        }
        self.presets[str(saved["preset_id"])] = saved
        return saved

    def delete_metric_query_preset(
        self,
        workspace_id: str,
        cluster_id: str,
        preset_id: str,
    ) -> bool:
        self.calls.append(("delete_preset", workspace_id, cluster_id, preset_id))
        self.deleted = preset_id in self.presets
        self.presets.pop(preset_id, None)
        return self.deleted

    def upsert_metric_widget(
        self,
        row: dict[str, Any],
        *,
        conflict_by_title: bool = False,
    ) -> dict[str, Any]:
        self.calls.append(("upsert_widget", row, conflict_by_title))
        return {
            **row,
            "created_at": "2026-07-07T00:00:00",
            "updated_at": "2026-07-07T00:00:00",
        }

    def queue_agent_command(self, correlation_id: str, plan: dict[str, Any], status: str) -> bool:
        self.commands.append((correlation_id, plan, status))
        return True


class MetricOperationEvents:
    def __init__(self) -> None:
        self.published: list[dict[str, object]] = []

    async def publish(self, **event: object) -> None:
        self.published.append(event)


def test_metric_query_presets_list_requires_dashboard_access() -> None:
    async def run() -> None:
        db = MetricPresetDb()
        response = await list_metric_query_presets(
            "cluster-1",
            current=_current_session(),
            db=db,
        )

        assert response.items[0].preset_id == "preset-cpu"
        assert response.items[0].metadata == {"scope": "pod"}
        assert db.calls[0] == (
            "access",
            "user-1",
            "workspace-1",
            "cluster",
            "cluster-1",
            "dashboard.read",
        )

    asyncio.run(run())


def test_metrics_validate_queues_agent_only_prometheus_query_and_operation_event() -> None:
    async def run() -> None:
        db = MetricPresetDb()
        operation_events = MetricOperationEvents()
        response = await queue_metrics_validation(
            AgentDebugQueryRequest(
                cluster_id="cluster-1",
                query={
                    "source": "prometheus",
                    "name": "promql_validation",
                    "query": "up",
                    "range_seconds": 300,
                    "step_seconds": 30,
                },
            ),
            current=_current_session(),
            db=db,
            operation_events=operation_events,
        )
        assert response.accepted is True
        assert response.command_id.startswith("cmd-debug-")
        assert len(db.commands) == 1
        correlation_id, plan, status = db.commands[0]
        assert correlation_id == response.correlation_id
        assert status == CommandStatus.QUEUED
        assert plan["action"] == Command.TELEMETRY_QUERY_RUN_ACTION
        assert plan["routing_constraint"] == {
            "channel": "agent",
            "cluster_id": "cluster-1",
            "workspace_id": "workspace-1",
            "required_capability": "collector",
        }
        assert plan["payload"] == {
            "query": {
                "source": "prometheus",
                "name": "promql_validation",
                "query": "up",
                "range_seconds": 300,
                "step_seconds": 30,
            }
        }
        assert operation_events.published == [
            {
                "command_id": response.command_id,
                "workspace_id": "workspace-1",
                "kind": "progress",
                "payload": {
                    "status": CommandStatus.QUEUED,
                    "cluster_id": "cluster-1",
                    "action": Command.TELEMETRY_QUERY_RUN_ACTION,
                    "correlation_id": response.correlation_id,
                },
            }
        ]

    asyncio.run(run())


def test_metrics_validate_denies_without_cluster_evidence_access() -> None:
    async def run() -> None:
        db = MetricPresetDb(allowed_actions={"dashboard.read"})
        operation_events = MetricOperationEvents()
        try:
            await queue_metrics_validation(
                AgentDebugQueryRequest(
                    cluster_id="cluster-1",
                    query={"source": "prometheus", "query": "up"},
                ),
                current=_current_session(),
                db=db,
                operation_events=operation_events,
            )
        except HTTPException as exc:
            assert exc.status_code == 403
            assert exc.detail == "resource access denied"
        else:
            raise AssertionError("expected HTTPException")

        assert db.commands == []
        assert operation_events.published == []

    asyncio.run(run())


def test_metrics_validate_requires_explicit_cluster_identity() -> None:
    async def run() -> None:
        db = MetricPresetDb()
        operation_events = MetricOperationEvents()
        try:
            await queue_metrics_validation(
                AgentDebugQueryRequest(
                    query={
                        "source": "prometheus",
                        "name": "promql_validation",
                        "query": "up",
                    },
                ),
                current=_current_session(),
                db=db,
                operation_events=operation_events,
            )
        except HTTPException as exc:
            assert exc.status_code == 422
            assert exc.detail == "explicit cluster_id is required"
        else:
            raise AssertionError("expected HTTPException")

        assert db.calls == []
        assert db.commands == []
        assert operation_events.published == []

    asyncio.run(run())


def test_metrics_validate_rejects_non_prometheus_agent_query() -> None:
    async def run() -> None:
        db = MetricPresetDb()
        operation_events = MetricOperationEvents()
        try:
            await queue_metrics_validation(
                AgentDebugQueryRequest(
                    cluster_id="cluster-1",
                    query={"source": "loki", "query": '{app="checkout"}'},
                ),
                current=_current_session(),
                db=db,
                operation_events=operation_events,
            )
        except HTTPException as exc:
            assert exc.status_code == 422
            assert exc.detail == "Prometheus agent query is required"
        else:
            raise AssertionError("expected HTTPException")

        assert db.commands == []
        assert operation_events.published == []

    asyncio.run(run())


def test_metric_query_preset_upsert_persists_definition_only() -> None:
    async def run() -> None:
        db = MetricPresetDb()
        response = await upsert_metric_query_preset(
            "cluster-1",
            MetricQueryPresetUpsertRequest(
                preset_id="preset-memory",
                name="Pod memory",
                query="sum(container_memory_working_set_bytes)",
                range_seconds=600,
                step_seconds=30,
                unit="bytes",
                metadata={"scope": "pod"},
            ),
            current=_current_session(),
            db=db,
        )

        assert response.item.preset_id == "preset-memory"
        assert response.item.workspace_id == "workspace-1"
        assert response.item.cluster_id == "cluster-1"
        assert response.item.created_by == "user-1"
        assert db.calls[0] == (
            "access",
            "user-1",
            "workspace-1",
            "cluster",
            "cluster-1",
            "dashboard.manage",
        )
        upsert_call = [call for call in db.calls if call[0] == "upsert_preset"][0]
        row = upsert_call[1]
        assert "result" not in row
        assert row["query"] == "sum(container_memory_working_set_bytes)"

    asyncio.run(run())


def test_metric_query_preset_upsert_denies_read_only_dashboard_access() -> None:
    async def run() -> None:
        db = MetricPresetDb(allowed_actions={"dashboard.read", "evidence.read"})
        try:
            await upsert_metric_query_preset(
                "cluster-1",
                MetricQueryPresetUpsertRequest(
                    name="Pod memory",
                    query="sum(container_memory_working_set_bytes)",
                ),
                current=_current_session(),
                db=db,
            )
        except HTTPException as exc:
            assert exc.status_code == 403
            assert exc.detail == "resource access denied"
        else:
            raise AssertionError("expected HTTPException")

    asyncio.run(run())


def test_metric_query_preset_run_queues_real_agent_command_path() -> None:
    async def run() -> None:
        db = MetricPresetDb()
        response = await run_metric_query_preset(
            "cluster-1",
            "preset-cpu",
            current=_current_session(),
            db=db,
        )

        assert response.accepted is True
        assert response.command_id.startswith("cmd-debug-")
        assert len(db.commands) == 1
        correlation_id, plan, status = db.commands[0]
        assert status == CommandStatus.QUEUED
        assert correlation_id == response.correlation_id
        assert plan["action"] == Command.TELEMETRY_QUERY_RUN_ACTION
        assert plan["cluster_id"] == "cluster-1"
        assert plan["workspace_id"] == "workspace-1"
        assert plan["payload"]["query"]["source"] == "prometheus"
        assert plan["payload"]["query"]["query"] == _preset()["query"]
        assert plan["payload"]["query"]["range_seconds"] == 900

    asyncio.run(run())


def test_metric_query_preset_delete_returns_404_for_missing_preset() -> None:
    async def run() -> None:
        db = MetricPresetDb()
        try:
            await delete_metric_query_preset(
                "cluster-1",
                "missing",
                current=_current_session(),
                db=db,
            )
        except HTTPException as exc:
            assert exc.status_code == 404
            assert exc.detail == "metric query preset not found"
        else:
            raise AssertionError("expected HTTPException")

    asyncio.run(run())


def test_metric_widget_upsert_requires_existing_query_preset() -> None:
    async def run() -> None:
        db = MetricPresetDb()
        try:
            await upsert_metric_widget(
                "cluster-1",
                MetricWidgetUpsertRequest(
                    query_preset_id="missing",
                    title="CPU trend",
                    kind="line",
                ),
                current=_current_session(),
                db=db,
            )
        except HTTPException as exc:
            assert exc.status_code == 404
            assert exc.detail == "metric query preset not found"
        else:
            raise AssertionError("expected HTTPException")

    asyncio.run(run())

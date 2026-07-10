"""플랫폼 도구 검증 — 자동 발견 등록, 읽기 전용 조회, JSON 직렬화 보장."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from conftest import load_file

from domains.registry import load_domain_tools
from packages.ai.tools import ToolContext, ai

ROOT = Path(__file__).resolve().parents[1]

load_domain_tools()
load_file(ROOT / "src" / "services" / "ai" / "chat-worker" / "tools.py", "chat_worker_tools")


class StubDb:
    """도구가 호출하는 읽기 메서드만 흉내내는 테스트용 저장소."""

    async def list_rca_reports(self, workspace_id: str, *, limit: int = 5) -> list[dict]:
        self.rca_query = (workspace_id, limit)
        return [
            {
                "root_cause": "oom_killed",
                "action": "rollout_restart",
                "correlation_id": "corr-1",
                "created_at": "2026-07-04T00:00:00",
                "payload": {"huge": "ignored"},
            }
        ]

    async def get_inventory_resource(self, **kwargs: Any) -> dict[str, Any] | None:
        self.inventory_query = kwargs
        return {
            "resource_type": "pod",
            "kind": "Pod",
            "namespace": "prod",
            "name": "checkout-abc",
            "status": "Running",
            "health": "healthy",
            "summary": {"restart_total": 1},
            "raw": {"must": "not leak"},
        }

    async def list_related_inventory_resources(self, **kwargs: Any) -> dict[str, list[dict]]:
        self.related_query = kwargs
        return {
            "pods": [
                {
                    "resource_type": "pod",
                    "kind": "Pod",
                    "namespace": "prod",
                    "name": "checkout-abc",
                    "status": "Running",
                    "raw": {"must": "not leak"},
                }
            ]
        }

    async def list_resource_events(self, **kwargs: Any) -> list[dict]:
        self.events_query = kwargs
        return [
            {
                "resource_type": "event",
                "kind": "Event",
                "namespace": "prod",
                "name": "pulling",
                "summary": {"reason": "Pulled"},
                "raw": {"must": "not leak"},
            }
        ]

    async def list_ai_messages(
        self, workspace_id: str, conversation_id: str, *, newest: int | None = None
    ) -> list[dict]:
        self.messages_query = (workspace_id, conversation_id, newest)
        return [
            {"role": "user", "content": "x" * 500, "created_at": "2026-07-04T00:00:00"},
            {"role": "assistant", "content": "answer", "created_at": "2026-07-04T00:00:01"},
        ]

    async def get_recovery_plan(
        self, plan_id: str, workspace_id: str
    ) -> dict[str, Any] | None:
        self.recovery_plan_query = ("plan", plan_id, workspace_id)
        return self._recovery_plan_record()

    async def get_recovery_plan_by_correlation(
        self, correlation_id: str, workspace_id: str
    ) -> dict[str, Any] | None:
        self.recovery_plan_query = ("correlation", correlation_id, workspace_id)
        return self._recovery_plan_record()

    @staticmethod
    def _recovery_plan_record() -> dict[str, Any]:
        return {
            "plan_id": "plan-1",
            "workspace_id": "ws-1",
            "correlation_id": "corr-1",
            "status": "selection_requested",
            "payload": {
                "plan_id": "plan-1",
                "recommended_action_id": "restart-api",
                "target": {
                    "workspace_id": "ws-1",
                    "cluster_id": "cluster-1",
                    "namespace": "sandbox",
                    "resource_kind": "Deployment",
                    "resource_name": "checkout-api",
                },
                "candidates": [
                    {
                        "action_id": "restart-api",
                        "title": "Restart checkout-api",
                        "description": "Restart pods without changing manifests.",
                        "route": "auto",
                        "rank": 1,
                        "score": 0.95,
                        "risk_level": "low",
                        "blast_radius": "Deployment/checkout-api pods",
                        "approval_required": False,
                        "prerequisites": ["deployment exists"],
                        "validation_checks": ["rollout status is healthy"],
                        "rollback_plan": "stop retry and escalate to manual review",
                        "evidence_refs": ["evidence://corr-1"],
                        "draft": {
                            "action_type": "rollout_restart",
                            "namespace": "sandbox",
                            "resource_kind": "Deployment",
                            "resource_name": "checkout-api",
                        },
                    },
                    {
                        "action_id": "safe-pr-probe",
                        "title": "Open Safe PR for probe tuning",
                        "description": "Tune readiness probe through reviewable manifest change.",
                        "route": "draft_pr",
                        "rank": 2,
                        "score": 0.7,
                        "risk_level": "medium",
                        "blast_radius": "Deployment/checkout-api manifest",
                        "approval_required": True,
                        "prerequisites": ["probe failure confirmed"],
                        "validation_checks": ["review diff"],
                        "rollback_plan": "revert PR",
                        "evidence_refs": ["evidence://corr-1"],
                        "draft": {
                            "action_type": "apply_manifest",
                            "namespace": "sandbox",
                            "resource_kind": "Deployment",
                            "resource_name": "checkout-api",
                        },
                    },
                ],
            },
        }


def make_context(db: Any = None) -> ToolContext:
    return ToolContext(
        db=db or StubDb(),
        workspace_id="ws-1",
        user_id="user-1",
        cluster_id="cluster-1",
        resource_type="pod",
        kind="Pod",
        namespace="prod",
        name="checkout-abc",
        locale="ko",
    )


def execute(name: str, arguments: dict[str, Any] | None = None, db: Any = None) -> Any:
    return asyncio.run(ai.execute(name, make_context(db), arguments or {}))


def test_platform_tools_are_discovered_and_registered() -> None:
    assert {
        "get_conversation_summary",
        "get_inventory_resource_detail",
        "list_command_actions",
        "list_recent_incidents",
        "list_resource_rca_reports",
        "list_recovery_playbooks",
        "recommend_recovery_action",
    } <= set(ai.tool_names())


def test_load_domain_tools_is_idempotent() -> None:
    before = ai.tool_names()
    load_domain_tools()  # 재호출(모듈 재로딩 시나리오)에도 중복 예외 없음
    assert ai.tool_names() == before


def test_list_recent_incidents_reads_rca_reports() -> None:
    db = StubDb()
    result = execute("list_recent_incidents", {"limit": 3}, db=db)

    assert db.rca_query == ("ws-1", 3)
    assert result["incidents"][0]["root_cause"] == "oom_killed"
    assert "payload" not in result["incidents"][0]
    json.dumps(result)  # JSON 직렬화 가능 보장


def test_get_conversation_summary_truncates_and_limits() -> None:
    db = StubDb()
    result = execute("get_conversation_summary", {"conversation_id": "aic-1", "limit": 999}, db=db)

    assert db.messages_query == ("ws-1", "aic-1", 20)  # 상한 clamp
    assert len(result["messages"][0]["content"]) == 300
    assert result["messages"][1]["content"] == "answer"
    json.dumps(result)


def test_get_inventory_resource_detail_reads_real_inventory_methods_without_raw() -> None:
    db = StubDb()
    result = execute("get_inventory_resource_detail", {}, db=db)

    assert db.inventory_query["cluster_id"] == "cluster-1"
    assert db.inventory_query["resource_type"] == "pod"
    assert result["found"] is True
    assert result["resource"]["name"] == "checkout-abc"
    assert "raw" not in result["resource"]
    assert "raw" not in result["related"]["pods"][0]
    assert "raw" not in result["events"][0]
    json.dumps(result)


def test_list_resource_rca_reports_filters_to_context_resource() -> None:
    class RcaDb(StubDb):
        async def list_rca_reports(
            self, workspace_id: str, *, limit: int = 5
        ) -> list[dict[str, Any]]:
            self.rca_query = (workspace_id, limit)
            return [
                {
                    "root_cause": "image_pull_error",
                    "action": "inspect_secret",
                    "correlation_id": "corr-match",
                    "cluster_id": "cluster-1",
                    "payload": {"incident": {"resource_name": "checkout-abc"}},
                },
                {
                    "root_cause": "node_pressure",
                    "action": "cordon",
                    "correlation_id": "corr-other",
                    "cluster_id": "cluster-1",
                    "payload": {"incident": {"resource_name": "other-pod"}},
                },
            ]

    db = RcaDb()
    result = execute("list_resource_rca_reports", {"limit": 10}, db=db)

    assert db.rca_query == ("ws-1", 10)
    assert [row["correlation_id"] for row in result["reports"]] == ["corr-match"]
    json.dumps(result)


def test_list_command_actions_exposes_policy_metadata() -> None:
    result = execute("list_command_actions")

    actions = {row["action"]: row for row in result["actions"]}
    assert "rollout_restart" in actions
    assert set(actions["rollout_restart"]) == {
        "action",
        "recovery_aliases",
        "allowed_namespaces",
        "requires_approval",
    }
    json.dumps(result)


def test_recommend_recovery_action_returns_safe_recommendation_metadata() -> None:
    db = StubDb()
    result = execute("recommend_recovery_action", {"correlation_id": "corr-1"}, db=db)

    assert db.recovery_plan_query == ("correlation", "corr-1", "ws-1")
    assert result["found"] is True
    assert result["summary"] == "추천 조치는 Restart checkout-api입니다. 자동 실행 후보입니다."
    assert result["possible_actions"]["recommended"]["action_id"] == "restart-api"
    assert result["caution"]["automatic_candidate"] is True
    assert result["caution"]["automation"]["eligible"] is True
    assert result["caution"]["automation"]["handoff"] == {
        "next_step": "create_command_request",
        "requires_user_confirmation": True,
    }
    assert result["possible_actions"]["alternatives"][0]["action_id"] == "safe-pr-probe"
    json.dumps(result)


def test_recommend_recovery_action_respects_excluded_actions() -> None:
    db = StubDb()
    result = execute(
        "recommend_recovery_action",
        {"plan_id": "plan-1", "exclude_action_ids": ["restart-api"]},
        db=db,
    )

    assert db.recovery_plan_query == ("plan", "plan-1", "ws-1")
    assert result["possible_actions"]["recommended"]["action_id"] == "safe-pr-probe"
    assert result["caution"]["automation"]["eligible"] is False
    assert result["possible_actions"]["not_recommended"][0]["action_id"] == "restart-api"
    json.dumps(result)


def test_list_recovery_playbooks_exposes_cause_and_recovery_catalog() -> None:
    result = execute("list_recovery_playbooks")

    assert result["causes"], "내장 원인 프로파일이 비어 있으면 안 됨"
    assert result["recoveries"], "내장 복구 룰이 비어 있으면 안 됨"
    # 폴백(AlwaysAvailable) 룰은 root_causes="*" 로 노출됨
    assert any(row["root_causes"] == ["*"] for row in result["recoveries"])
    json.dumps(result)

"""범용 조회 API(/evidence, /rca-reports) — 인증·워크스페이스 범위·필터·페이지네이션 검증."""

from __future__ import annotations

import base64
import json
from datetime import datetime
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

from domains.rca.query_router import next_page_cursor
from domains.rca.query_router import router as query_router
from domains.rca.report_projection import rca_report_projection

WORKSPACE_ID = "workspace-1"
SECRET_MARKER = "raw-secret-token-do-not-leak"


class _SessionAuth:
    """require_session 이 쓰는 app.state.auth 대역 — 세션 없으면 401."""

    def __init__(self, session: Any | None) -> None:
        self.session = session

    async def require_session(self, request: Request) -> Any:
        if self.session is None:
            raise HTTPException(status_code=401, detail="authentication required")
        return self.session


class QueryApiDb:
    """호출 인자를 기록하고 대본 row 를 돌려주는 테스트용 저장소."""

    def __init__(
        self,
        evidence_rows: list[dict] | None = None,
        report_rows: list[dict] | None = None,
        evidence_window_rows: list[dict] | None = None,
        evidence_window_payload: dict | None = None,
    ) -> None:
        self.evidence_rows = evidence_rows or []
        self.report_rows = report_rows or []
        self.evidence_window_rows = evidence_window_rows or []
        self.evidence_window_payload = evidence_window_payload
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def list_evidence_records(self, workspace_id: str, **filters: Any) -> list[dict]:
        self.calls.append(("evidence", {"workspace_id": workspace_id, **filters}))
        return self.evidence_rows

    def list_rca_report_records(self, workspace_id: str, **filters: Any) -> list[dict]:
        self.calls.append(("reports", {"workspace_id": workspace_id, **filters}))
        return self.report_rows

    def get_evidence_window_payload_for_workspace(
        self, workspace_id: str, evidence_key: str
    ) -> dict | None:
        self.calls.append(
            (
                "evidence_window",
                {"workspace_id": workspace_id, "evidence_key": evidence_key},
            )
        )
        return self.evidence_window_payload

    def list_evidence_windows_for_workspace(
        self, workspace_id: str, *, limit: int, offset: int = 0
    ) -> list[dict]:
        self.calls.append(
            (
                "evidence_windows",
                {"workspace_id": workspace_id, "limit": limit, "offset": offset},
            )
        )
        return self.evidence_window_rows[offset : offset + limit]


def evidence_row(row_id: int = 1, kind: str = "evidence.built") -> dict:
    return {
        "id": row_id,
        "workspace_id": WORKSPACE_ID,
        "correlation_id": f"corr-{row_id}",
        "kind": kind,
        "payload": {
            "cluster_id": "cluster-1",
            "object_ref": f"evidence://{row_id}",
            "kubernetes": {
                "_lineage": {
                    "schema_version": 2,
                    "source_version": "kubernetes:v1.33",
                    "collector": "cluster-agent",
                    "collector_version": "agent:v2",
                    "query_version": "k8s-snapshot:v3",
                    "collected_at": "2026-07-07T09:59:58+00:00",
                    "evidence_key": f"workspace-1:cluster-1:evidence-{row_id}",
                    "source_id": "cluster-snapshot",
                    "agent_id": "agent-1",
                    "window_start": "2026-07-07T09:59:00+00:00",
                },
                "pods": [{"name": "api", "token": SECRET_MARKER}],
                "nodes": [{"name": "node-1"}],
                "events": [{"reason": "BackOff"}],
            },
            "metrics": {
                "_lineage": {
                    "schema_version": 2,
                    "source_version": "prometheus:v2",
                    "collector_version": "agent:v2",
                    "query_version": "promql:v1",
                },
                "results": {"cpu": [{"value": 0.9, "secret": SECRET_MARKER}]},
            },
            "logs": [
                {
                    "_lineage": {
                        "schema_version": 2,
                        "source_version": "loki:v3",
                        "collector_version": "agent:v2",
                        "query_version": "logql:v1",
                    },
                    "query_name": "app",
                    "line": SECRET_MARKER,
                }
            ],
        },
        "created_at": "2026-07-07T10:00:00+00:00",
    }


def evidence_window_row(row_id: int = 1, payload: dict | None = None) -> dict:
    return {
        "evidence_key": f"evidence-key-{row_id}",
        "workspace_id": WORKSPACE_ID,
        "cluster_id": "cluster-1",
        "source_id": "cluster-snapshot",
        "window_start": "2026-07-07T10:00:00+00:00",
        "agent_id": "agent-1",
        "correlation_id": f"corr-{row_id}",
        "payload": payload if payload is not None else evidence_row(row_id)["payload"],
        "created_at": "2026-07-07T10:00:00+00:00",
        "updated_at": "2026-07-07T10:00:10+00:00",
    }


def report_row(row_id: int = 1) -> dict:
    return {
        "id": row_id,
        "workspace_id": WORKSPACE_ID,
        "correlation_id": f"corr-{row_id}",
        "root_cause": "image_pull_backoff",
        "action": "restart deployment",
        "created_at": "2026-07-07T10:00:00+00:00",
        "payload": {
            "evidence_ref": "evidence://cluster-1/incident-1",
            "incident": {
                "incident_id": "incident-1",
                "cluster_id": "cluster-1",
                "resource_kind": "Deployment",
                "resource_name": "checkout-api",
                "namespace": "sandbox",
                "symptom": "ImagePullBackOff",
                "severity": "high",
                "secondary_symptoms": ["restart_spike"],
            },
            "candidates": [
                {
                    "candidate_id": "image-pull-backoff",
                    "title": "이미지 풀 실패",
                    "source": "rule",
                    "signals": [{"id": "s1", "any_of": [{"fact": "waiting_reason"}]}],
                },
                {"candidate_id": "oom-killed", "title": "OOM", "source": "rule"},
            ],
            "evaluations": [
                {
                    "candidate_id": "oom-killed",
                    "score": 0.2,
                    "reason": "신호 미충족",
                    "supporting_evidence": [],
                    "missing_evidence": ["prometheus:container_memory"],
                },
                {
                    "candidate_id": "image-pull-backoff",
                    "score": 1.0,
                    "reason": "모든 신호 충족",
                    "supporting_evidence": ["kubernetes:events"],
                    "missing_evidence": [],
                },
            ],
            "rca_detail": {
                "confidence": 0.91,
                "reason": "필요한 근거가 모두 수집되었습니다.",
                "selected_candidate_id": "image-pull-backoff",
                "supporting_evidence": ["kubernetes"],
                "missing_evidence": [],
                "supporting_evidence_refs": [
                    {
                        "source": "kubernetes",
                        "name": "events",
                        "check_id": "events",
                        "summary": "Failed to pull image",
                        "query": "events(namespace=sandbox)",
                        "evidence_ref": "evidence://cluster-1/incident-1",
                    }
                ],
                "missing_evidence_checks": [
                    {
                        "check_id": "loki:app-logs",
                        "source": "loki",
                        "status": "collected",
                        "reason": "ok",
                    }
                ],
            },
            "evidence_bundle": {
                "items": [
                    {
                        "source": "kubernetes",
                        "name": "events",
                        "check_id": "events",
                        "evidence_ref": "evidence://cluster-1/incident-1",
                        "value": {
                            "_lineage": {
                                "schema_version": 1,
                                "source_version": "kubernetes",
                                "collector": "cluster-agent",
                                "collector_version": "agent:v1",
                                "query_version": "policy:v2",
                                "collected_at": "2026-07-07T09:59:59+00:00",
                                "evidence_key": "workspace-1:cluster-1:cluster-snapshot:window-1",
                                "source_id": "cluster-snapshot",
                                "agent_id": "agent-1",
                                "window_start": "window-1",
                            }
                        },
                    }
                ]
            },
            # 응답으로 새 나가면 안 되는 원문 payload 내용물
            "evidence": {"kubernetes": {"token": SECRET_MARKER}},
        },
    }


def make_client(db: QueryApiDb, *, session: Any | None = None) -> TestClient:
    app = FastAPI()
    app.include_router(query_router)
    app.state.db = db
    app.state.auth = _SessionAuth(session)
    return TestClient(app)


def _session() -> SimpleNamespace:
    return SimpleNamespace(user_id="user-1", roles=("user",), workspace_id=WORKSPACE_ID)


def test_both_endpoints_require_session() -> None:
    client = make_client(QueryApiDb(), session=None)
    assert client.get("/evidence").status_code == 401
    assert client.get("/evidence/windows").status_code == 401
    assert client.get("/evidence/windows/evidence-key-1").status_code == 401
    assert client.get("/rca-reports").status_code == 401


def test_evidence_scoped_to_session_workspace_with_filters() -> None:
    db = QueryApiDb(evidence_rows=[evidence_row(1)])
    client = make_client(db, session=_session())

    response = client.get(
        "/evidence",
        params={
            "correlation_id": "corr-1",
            "kind": "evidence.built",
            "since": "2026-07-01T00:00:00Z",
            "until": "2026-07-08T00:00:00Z",
            "limit": 10,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body["items"]] == [1]
    item = body["items"][0]
    assert item["cluster_id"] == "cluster-1"
    assert item["evidence_ref"] == "evidence://1"
    assert item["summary"] == "cluster-1: kubernetes, metrics, logs"
    assert "payload" not in item
    assert SECRET_MARKER not in response.text
    assert [src["source"] for src in item["sources"]] == ["kubernetes", "metrics", "logs"]
    kubernetes = item["sources"][0]
    assert kubernetes["summary"] == "pods=1, nodes=1, events=1"
    assert kubernetes["schema_version"] == 2
    assert kubernetes["collector"] == "cluster-agent"
    assert kubernetes["collector_version"] == "agent:v2"
    assert kubernetes["source_version"] == "kubernetes:v1.33"
    assert kubernetes["query_version"] == "k8s-snapshot:v3"
    assert kubernetes["evidence_key"] == "workspace-1:cluster-1:evidence-1"
    assert kubernetes["agent_id"] == "agent-1"
    assert item["sources"][1]["summary"] == "results=1"
    assert item["sources"][2]["summary"] == "entries=1, queries=app"
    assert body == {**body, "limit": 10, "offset": 0, "has_more": False, "next_cursor": None}
    name, kwargs = db.calls[0]
    assert name == "evidence"
    # 워크스페이스는 쿼리 파라미터가 아니라 세션에서만 온다.
    assert kwargs["workspace_id"] == WORKSPACE_ID
    assert kwargs["correlation_id"] == "corr-1"
    assert kwargs["kind"] == "evidence.built"
    assert kwargs["since"].isoformat() == "2026-07-01T00:00:00+00:00"
    assert kwargs["until"].isoformat() == "2026-07-08T00:00:00+00:00"
    # has_more 판정용 1건 추가 조회
    assert kwargs["limit"] == 11
    assert kwargs["offset"] == 0


def test_evidence_pagination_reports_has_more_and_trims_items() -> None:
    rows = [evidence_row(row_id) for row_id in range(1, 4)]  # limit+1 건 반환
    db = QueryApiDb(evidence_rows=rows)
    client = make_client(db, session=_session())

    response = client.get("/evidence", params={"limit": 2, "offset": 4})

    body = response.json()
    assert [item["id"] for item in body["items"]] == [1, 2]
    assert body["has_more"] is True
    assert body["next_cursor"] is not None
    assert body["limit"] == 2
    assert body["offset"] == 4
    assert db.calls[0][1]["limit"] == 3
    assert db.calls[0][1]["offset"] == 4
    assert db.calls[0][1]["cursor"] is None


def test_evidence_keyset_cursor_is_accepted_with_offset_compatibility() -> None:
    rows = [evidence_row(row_id) for row_id in range(1, 4)]
    cursor = next_page_cursor(rows[:2], has_more=True)
    assert cursor is not None
    db = QueryApiDb(evidence_rows=rows[2:])
    client = make_client(db, session=_session())

    response = client.get("/evidence", params={"limit": 2, "offset": 999, "cursor": cursor})

    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body["items"]] == [3]
    assert body["has_more"] is False
    assert body["next_cursor"] is None
    _, kwargs = db.calls[0]
    assert kwargs["offset"] == 999  # 기존 파라미터는 계속 허용한다.
    assert kwargs["cursor"] == (datetime.fromisoformat("2026-07-07T10:00:00+00:00"), 2)


def test_evidence_keyset_cursor_validation() -> None:
    client = make_client(QueryApiDb(), session=_session())

    response = client.get("/evidence", params={"cursor": "not-a-valid-cursor"})

    assert response.status_code == 422
    assert response.json()["detail"] == "cursor is invalid"


def test_evidence_keyset_cursor_validation_rejects_bad_timestamp() -> None:
    client = make_client(QueryApiDb(), session=_session())
    payload = {"v": 1, "created_at": "not-a-time", "id": 1}
    cursor = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")

    response = client.get("/evidence", params={"cursor": cursor.rstrip("=")})

    assert response.status_code == 422
    assert response.json()["detail"] == "cursor is invalid"


def test_evidence_query_validation() -> None:
    client = make_client(QueryApiDb(), session=_session())
    assert client.get("/evidence", params={"limit": 0}).status_code == 422
    assert client.get("/evidence", params={"limit": 201}).status_code == 422
    assert client.get("/evidence", params={"offset": -1}).status_code == 422
    assert client.get("/evidence", params={"since": "not-a-time"}).status_code == 422


def test_evidence_empty_result() -> None:
    client = make_client(QueryApiDb(evidence_rows=[]), session=_session())

    body = client.get("/evidence").json()

    assert body == {"items": [], "limit": 50, "offset": 0, "has_more": False, "next_cursor": None}


def test_evidence_windows_list_summarizes_recent_windows_without_payload() -> None:
    payload = {**evidence_row(1)["payload"], "metadata": {"current_workload_snapshots": [{}]}}
    db = QueryApiDb(evidence_window_rows=[evidence_window_row(1, payload=payload)])
    client = make_client(db, session=_session())

    response = client.get("/evidence/windows", params={"limit": 10, "offset": 0})

    assert response.status_code == 200
    body = response.json()
    assert body["limit"] == 10
    assert body["offset"] == 0
    assert body["has_more"] is False
    item = body["items"][0]
    assert item["evidence_key"] == "evidence-key-1"
    assert item["workspace_id"] == WORKSPACE_ID
    assert item["cluster_id"] == "cluster-1"
    assert item["source_id"] == "cluster-snapshot"
    assert item["agent_id"] == "agent-1"
    assert item["correlation_id"] == "corr-1"
    assert item["sources"] == ["kubernetes", "metrics", "logs", "metadata"]
    assert item["updated_at"] == "2026-07-07T10:00:10+00:00"
    assert "payload" not in item
    name, kwargs = db.calls[0]
    assert name == "evidence_windows"
    assert kwargs == {"workspace_id": WORKSPACE_ID, "limit": 11, "offset": 0}


def test_evidence_windows_list_reports_has_more() -> None:
    rows = [evidence_window_row(row_id) for row_id in range(1, 4)]
    db = QueryApiDb(evidence_window_rows=rows)
    client = make_client(db, session=_session())

    response = client.get("/evidence/windows", params={"limit": 2})

    body = response.json()
    assert [item["evidence_key"] for item in body["items"]] == [
        "evidence-key-1",
        "evidence-key-2",
    ]
    assert body["has_more"] is True
    assert db.calls[0][1]["limit"] == 3


def test_evidence_windows_list_validation() -> None:
    client = make_client(QueryApiDb(), session=_session())
    assert client.get("/evidence/windows", params={"limit": 0}).status_code == 422
    assert client.get("/evidence/windows", params={"limit": 201}).status_code == 422
    assert client.get("/evidence/windows", params={"offset": -1}).status_code == 422


def test_evidence_window_payload_scoped_to_session_workspace() -> None:
    payload = evidence_row(1)["payload"]
    db = QueryApiDb(evidence_window_payload=payload)
    client = make_client(db, session=_session())

    response = client.get("/evidence/windows/evidence-key-1")

    assert response.status_code == 200
    body = response.json()
    assert body["evidence_key"] == "evidence-key-1"
    assert body["workspace_id"] == WORKSPACE_ID
    assert body["cluster_id"] == "cluster-1"
    assert body["source"] is None
    assert body["payload"] == payload
    name, kwargs = db.calls[0]
    assert name == "evidence_window"
    assert kwargs == {"workspace_id": WORKSPACE_ID, "evidence_key": "evidence-key-1"}


def test_evidence_window_payload_can_select_one_source() -> None:
    payload = evidence_row(1)["payload"]
    db = QueryApiDb(evidence_window_payload=payload)
    client = make_client(db, session=_session())

    response = client.get("/evidence/windows/evidence-key-1", params={"source": "metrics"})

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "metrics"
    assert body["payload"] == {"metrics": payload["metrics"]}
    assert "kubernetes" not in body["payload"]


def test_evidence_window_payload_not_found() -> None:
    client = make_client(QueryApiDb(evidence_window_payload=None), session=_session())

    response = client.get("/evidence/windows/missing-key")

    assert response.status_code == 404
    assert response.json()["detail"] == "Evidence window not found"


def test_evidence_window_payload_source_not_found() -> None:
    payload = evidence_row(1)["payload"]
    client = make_client(QueryApiDb(evidence_window_payload=payload), session=_session())

    response = client.get("/evidence/windows/evidence-key-1", params={"source": "metadata"})

    assert response.status_code == 404
    assert response.json()["detail"] == "Evidence source not found: metadata"


def test_rca_reports_return_summary_without_raw_payload() -> None:
    db = QueryApiDb(report_rows=[report_row(1)])
    client = make_client(db, session=_session())

    response = client.get("/rca-reports", params={"correlation_id": "corr-1"})

    assert response.status_code == 200
    body = response.json()
    item = body["items"][0]
    assert item["root_cause"] == "image_pull_backoff"
    assert item["action"] == "restart deployment"
    assert item["incident_id"] == "incident-1"
    assert item["cluster_id"] == "cluster-1"
    assert item["symptom"] == "ImagePullBackOff"
    assert item["confidence"] == 0.91
    assert item["supporting_evidence"] == ["kubernetes"]
    assert item["created_at"] == "2026-07-07T10:00:00+00:00"
    # 분석 심화 필드 — 대상 리소스·부증상·후보 점수(내림차순)·근거 쿼리 트레일
    assert item["resource_kind"] == "Deployment"
    assert item["resource_name"] == "checkout-api"
    assert item["namespace"] == "sandbox"
    assert item["secondary_symptoms"] == ["restart_spike"]
    assert item["selected_candidate_id"] == "image-pull-backoff"
    assert [c["candidate_id"] for c in item["candidates"]] == ["image-pull-backoff", "oom-killed"]
    top = item["candidates"][0]
    assert top["title"] == "이미지 풀 실패"
    assert top["source"] == "rule"
    assert top["score"] == 1.0
    assert top["supporting_evidence"] == ["kubernetes:events"]
    assert item["candidates"][1]["missing_evidence"] == ["prometheus:container_memory"]
    ref = item["supporting_evidence_refs"][0]
    assert ref["source"] == "kubernetes"
    assert ref["query"] == "events(namespace=sandbox)"
    assert ref["schema_version"] == 1
    assert ref["collector_version"] == "agent:v1"
    assert ref["evidence_key"] == "workspace-1:cluster-1:cluster-snapshot:window-1"
    assert ref["agent_id"] == "agent-1"
    assert item["missing_evidence_checks"][0]["check_id"] == "loki:app-logs"
    # 후보의 signals DSL 원문·payload 원문(secret 포함 가능)은 응답 어디에도 실리지 않는다.
    assert "signals" not in top
    assert "payload" not in item
    assert SECRET_MARKER not in response.text
    name, kwargs = db.calls[0]
    assert name == "reports"
    assert kwargs["workspace_id"] == WORKSPACE_ID
    assert kwargs["correlation_id"] == "corr-1"


def test_rca_reports_return_summary_from_projection_without_payload() -> None:
    row = report_row(1)
    payload = row.pop("payload")
    row.update(rca_report_projection(payload))
    db = QueryApiDb(report_rows=[row])
    client = make_client(db, session=_session())

    response = client.get("/rca-reports", params={"correlation_id": "corr-1"})

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["incident_id"] == "incident-1"
    assert item["cluster_id"] == "cluster-1"
    assert item["confidence"] == 0.91
    assert item["supporting_evidence"] == ["kubernetes"]
    assert item["candidates"][0]["candidate_id"] == "image-pull-backoff"
    assert "payload" not in item
    assert SECRET_MARKER not in response.text


def test_rca_reports_pagination_and_empty() -> None:
    rows = [report_row(row_id) for row_id in range(1, 4)]
    client = make_client(QueryApiDb(report_rows=rows), session=_session())
    body = client.get("/rca-reports", params={"limit": 2}).json()
    assert len(body["items"]) == 2
    assert body["has_more"] is True
    assert body["next_cursor"] is not None

    empty = make_client(QueryApiDb(), session=_session()).get("/rca-reports").json()
    assert empty == {"items": [], "limit": 50, "offset": 0, "has_more": False, "next_cursor": None}

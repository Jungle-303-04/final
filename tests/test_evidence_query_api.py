"""범용 조회 API(/evidence, /rca-reports) — 인증·워크스페이스 범위·필터·페이지네이션 검증."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

from domains.rca.query_router import router as query_router

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
    """호출 인자를 기록하고 대본 row 를 돌려주는 가짜 저장소."""

    def __init__(
        self, evidence_rows: list[dict] | None = None, report_rows: list[dict] | None = None
    ) -> None:
        self.evidence_rows = evidence_rows or []
        self.report_rows = report_rows or []
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def list_evidence_records(self, workspace_id: str, **filters: Any) -> list[dict]:
        self.calls.append(("evidence", {"workspace_id": workspace_id, **filters}))
        return self.evidence_rows

    def list_rca_report_records(self, workspace_id: str, **filters: Any) -> list[dict]:
        self.calls.append(("reports", {"workspace_id": workspace_id, **filters}))
        return self.report_rows


def evidence_row(row_id: int = 1, kind: str = "evidence.built") -> dict:
    return {
        "id": row_id,
        "workspace_id": WORKSPACE_ID,
        "correlation_id": f"corr-{row_id}",
        "kind": kind,
        "payload": {"cluster_id": "cluster-1", "object_ref": f"evidence://{row_id}"},
        "created_at": "2026-07-07T10:00:00+00:00",
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
                "symptom": "ImagePullBackOff",
                "severity": "high",
            },
            "rca_detail": {
                "confidence": 0.91,
                "reason": "필요한 근거가 모두 수집되었습니다.",
                "supporting_evidence": ["kubernetes"],
                "missing_evidence": [],
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
    assert body == {**body, "limit": 10, "offset": 0, "has_more": False}
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
    assert body["limit"] == 2
    assert body["offset"] == 4
    assert db.calls[0][1]["limit"] == 3
    assert db.calls[0][1]["offset"] == 4


def test_evidence_query_validation() -> None:
    client = make_client(QueryApiDb(), session=_session())
    assert client.get("/evidence", params={"limit": 0}).status_code == 422
    assert client.get("/evidence", params={"limit": 201}).status_code == 422
    assert client.get("/evidence", params={"offset": -1}).status_code == 422
    assert client.get("/evidence", params={"since": "not-a-time"}).status_code == 422


def test_evidence_empty_result() -> None:
    client = make_client(QueryApiDb(evidence_rows=[]), session=_session())

    body = client.get("/evidence").json()

    assert body == {"items": [], "limit": 50, "offset": 0, "has_more": False}


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
    # payload 원문(secret 포함 가능)은 응답 어디에도 실리지 않는다.
    assert "payload" not in item
    assert SECRET_MARKER not in response.text
    name, kwargs = db.calls[0]
    assert name == "reports"
    assert kwargs["workspace_id"] == WORKSPACE_ID
    assert kwargs["correlation_id"] == "corr-1"


def test_rca_reports_pagination_and_empty() -> None:
    rows = [report_row(row_id) for row_id in range(1, 4)]
    client = make_client(QueryApiDb(report_rows=rows), session=_session())
    body = client.get("/rca-reports", params={"limit": 2}).json()
    assert len(body["items"]) == 2
    assert body["has_more"] is True

    empty = make_client(QueryApiDb(), session=_session()).get("/rca-reports").json()
    assert empty == {"items": [], "limit": 50, "offset": 0, "has_more": False}

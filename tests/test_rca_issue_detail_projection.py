from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from domains.dashboard.repository import _rca_timeline_response_columns
from domains.dashboard.router import issue_item


def test_issue_query_projects_latest_report_narrative_and_evidence_summary() -> None:
    statement = select(*_rca_timeline_response_columns(include_issue_severity=True))
    sql = str(
        statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )

    assert "rca_reports" in sql
    assert "executive_summary" in sql
    assert "recommended_action" in sql
    assert "evidence_bundle_summary" in sql
    assert "rca_issue_report_summary" in sql


def test_issue_item_fills_nullable_detail_fields_from_report_projection() -> None:
    item = issue_item(
        {
            "workspace_id": "default",
            "correlation_id": "correlation-1",
            "cluster_id": "target-1",
            "incident_id": "incident-1",
            "current_subject": "rca.completed",
            "status": "rca_completed",
            "supporting_evidence": [
                "object://evidence/correlation-1.json#traces:cluster_recent_traces"
            ],
            "missing_evidence": [],
            "issue_severity": "warning",
            "severity_availability": "available",
            "severity_reason_code": None,
            "rca_issue_report_summary": {
                "executive_summary": "Tempo 지연 구간에서 오류 span이 확인됐습니다.",
                "recommended_action": "문제 배포를 직전 안정 버전으로 되돌리세요.",
                "evidence_summary": "오류 trace와 재시작 지표가 함께 증가했습니다.",
                "evidence_bundle_summary": "traces, metrics",
            },
        }
    )

    assert item.situation_summary == "Tempo 지연 구간에서 오류 span이 확인됐습니다."
    assert item.recommended_action_summary == "문제 배포를 직전 안정 버전으로 되돌리세요."
    assert item.evidence_summary == "오류 trace와 재시작 지표가 함께 증가했습니다."
    assert item.evidence_bundle_summary == "traces, metrics"

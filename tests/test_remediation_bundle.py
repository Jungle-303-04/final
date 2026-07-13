"""RemediationBundle 3계층 투영·테넌트 인가·문서 계약 검증."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from conftest import ROOT, load_file
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

from domains.rca_bundle.router import router as remediation_bundle_router
from domains.rca_bundle.serializer import remediation_bundle_response
from packages.contracts.gateway import routes
from packages.contracts.gateway.responses import RemediationBundleResponse
from packages.contracts.identity import Permission

WORKSPACE_ID = "workspace-1"
OTHER_WORKSPACE_ID = "workspace-2"
CLUSTER_ID = "cluster-1"
CORRELATION_ID = "corr-1"
BUNDLE_NOT_FOUND = "Remediation bundle not found"
ROOT_DIR = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT_DIR / "docs" / "spec" / "remediation-bundle.schema.json"
BRUNO_PATH = ROOT_DIR / "docs" / "api" / "05-rca-dashboard" / "13-remediation-bundle.bru"


class _SessionAuth:
    def __init__(self, session: Any | None) -> None:
        self.session = session

    async def require_session(self, _request: Request) -> Any:
        if self.session is None:
            raise HTTPException(status_code=401, detail="authentication required")
        return self.session


class BundleDb:
    def __init__(
        self,
        *,
        reports: list[dict[str, Any]] | None = None,
        recovery: dict[str, Any] | None = None,
        cluster_access: bool = True,
    ) -> None:
        self.reports = reports or []
        self.recovery = recovery
        self.cluster_access = cluster_access
        self.calls: list[tuple[Any, ...]] = []

    def list_rca_report_records(
        self,
        workspace_id: str,
        **filters: Any,
    ) -> list[dict[str, Any]]:
        self.calls.append(("reports", workspace_id, filters))
        correlation_id = filters.get("correlation_id")
        rows = [
            row
            for row in self.reports
            if row["workspace_id"] == workspace_id
            and (correlation_id is None or row["correlation_id"] == correlation_id)
        ]
        rows.sort(key=lambda row: (str(row["created_at"]), int(row["id"])), reverse=True)
        return rows[: int(filters.get("limit", len(rows)))]

    def get_recovery_plan_by_correlation(
        self,
        correlation_id: str,
        workspace_id: str,
    ) -> dict[str, Any] | None:
        self.calls.append(("recovery", correlation_id, workspace_id))
        if (
            self.recovery is not None
            and self.recovery["correlation_id"] == correlation_id
            and self.recovery["workspace_id"] == workspace_id
        ):
            return self.recovery
        return None

    def can_access(
        self,
        user_id: str,
        organization_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        self.calls.append(
            ("access", user_id, organization_id, resource_type, resource_id, permission)
        )
        return self.cluster_access


def _session(workspace_id: str = WORKSPACE_ID) -> SimpleNamespace:
    return SimpleNamespace(user_id="user-1", roles=("user",), workspace_id=workspace_id)


def _report(
    *,
    row_id: int = 1,
    workspace_id: str = WORKSPACE_ID,
    correlation_id: str = CORRELATION_ID,
    cluster_id: str | None = CLUSTER_ID,
    created_at: str = "2026-07-13T01:00:00+00:00",
    root_cause: str = "image_pull_backoff",
) -> dict[str, Any]:
    return {
        "id": row_id,
        "workspace_id": workspace_id,
        "correlation_id": correlation_id,
        "root_cause": root_cause,
        "action": "restart deployment",
        "incident_id": "incident-1",
        "cluster_id": cluster_id,
        "confidence": 0.91,
        "supporting_evidence": ["kubernetes:events"],
        "missing_evidence": ["loki:application_logs"],
        "selected_candidate_id": "diagnosis-image-pull",
        "supporting_evidence_refs": [
            {
                "source": "kubernetes",
                "name": "events",
                "check_id": "events",
                "summary": "Failed to pull image",
                "query": "events(namespace=sandbox)",
                "evidence_ref": "evidence://incident-1",
            }
        ],
        "missing_evidence_checks": [
            {
                "check_id": "loki:application-logs",
                "source": "loki",
                "status": "missing",
                "reason": "query pending",
            }
        ],
        "created_at": created_at,
    }


def _candidate() -> dict[str, Any]:
    return {
        "action_id": "remediation-restart",
        "title": "Restart deployment",
        "description": "Restart checkout-api after image correction",
        "draft": {
            "action_type": "rollout_restart",
            "namespace": "sandbox",
            "resource_kind": "Deployment",
            "resource_name": "checkout-api",
            "reason": "recover from image pull failure",
            "risk_level": "medium",
            "dry_run": False,
            "source_evidence": ["kubernetes:events"],
            "params": {"deployment": "checkout-api"},
        },
        "route": "agent_command",
        "rank": 1,
        "score": 0.94,
        "risk_level": "medium",
        "blast_radius": "single_deployment",
        "approval_required": True,
        "prerequisites": ["image tag corrected"],
        "validation_checks": ["deployment.available_replicas"],
        "rollback_plan": "restore previous image tag",
        "evidence_refs": ["evidence://incident-1"],
    }


def _recovery() -> dict[str, Any]:
    return {
        "plan_id": "plan-1",
        "workspace_id": WORKSPACE_ID,
        "correlation_id": CORRELATION_ID,
        "incident_id": "incident-1",
        "evidence_ref": "evidence://incident-1",
        "status": "selected",
        "selected_action_id": "remediation-restart",
        "selected_by": "user-1",
        "payload": {
            "plan_id": "plan-1",
            "incident_id": "incident-1",
            "evidence_ref": "evidence://incident-1",
            "summary": "checkout-api recovery",
            "target": {"workspace_id": WORKSPACE_ID, "cluster_id": CLUSTER_ID},
            "recommended_action_id": "remediation-restart",
            "execution_route": "manual_selection",
            "selection_required": True,
            "candidates": [_candidate()],
        },
    }


def _client(
    db: BundleDb,
    *,
    session: Any | None = None,
) -> TestClient:
    app = FastAPI()
    app.include_router(remediation_bundle_router)
    app.state.db = db
    app.state.auth = _SessionAuth(session)
    return TestClient(app)


def test_serializer_preserves_three_layers_and_distinct_selection_ids() -> None:
    report = _report()
    recovery = _recovery()

    body = remediation_bundle_response(report, recovery).model_dump(mode="json")

    assert set(body) == {"meta", "diagnosis", "remediation"}
    assert body["meta"] == {
        "correlation_id": CORRELATION_ID,
        "incident_id": "incident-1",
        "cluster_id": CLUSTER_ID,
        "workspace_id": WORKSPACE_ID,
        "created_at": "2026-07-13T01:00:00+00:00",
    }
    diagnosis = body["diagnosis"]
    assert set(diagnosis) == {
        "root_cause",
        "confidence",
        "supporting_evidence",
        "missing_evidence",
        "supporting_evidence_refs",
        "missing_evidence_checks",
        "selected_candidate_id",
    }
    assert diagnosis["root_cause"] == "image_pull_backoff"
    assert diagnosis["confidence"] == 0.91
    assert diagnosis["supporting_evidence"] == ["kubernetes:events"]
    assert diagnosis["missing_evidence"] == ["loki:application_logs"]
    assert (
        diagnosis["supporting_evidence_refs"][0]["query"]
        == (report["supporting_evidence_refs"][0]["query"])
    )
    assert diagnosis["missing_evidence_checks"] == report["missing_evidence_checks"]
    assert diagnosis["selected_candidate_id"] == "diagnosis-image-pull"
    assert body["remediation"] == {
        "status": "selected",
        "selected_action_id": "remediation-restart",
        "selected_by": "user-1",
        "candidates": recovery["payload"]["candidates"],
        "evidence_ref": "evidence://incident-1",
    }
    assert "contradicting_evidence" not in json.dumps(body)


def test_serializer_keeps_remediation_null_when_recovery_plan_is_absent() -> None:
    body = remediation_bundle_response(_report(), None)

    assert body.remediation is None


def test_route_returns_latest_report_and_valid_response_schema() -> None:
    older = _report(
        row_id=1,
        created_at="2026-07-13T00:00:00+00:00",
        root_cause="older-diagnosis",
    )
    latest = _report(row_id=2, created_at="2026-07-13T02:00:00+00:00")
    db = BundleDb(reports=[older, latest], recovery=_recovery())

    response = _client(db, session=_session()).get(
        routes.RCA_BUNDLE_PATH.format(correlation_id=CORRELATION_ID)
    )

    assert response.status_code == 200
    parsed = RemediationBundleResponse.model_validate(response.json())
    assert parsed.meta.created_at == latest["created_at"]
    assert parsed.diagnosis.root_cause == latest["root_cause"]
    assert parsed.diagnosis.selected_candidate_id == "diagnosis-image-pull"
    assert parsed.remediation is not None
    assert parsed.remediation.selected_action_id == "remediation-restart"
    assert [call[0] for call in db.calls] == ["reports", "access", "recovery"]
    assert db.calls[0][1:] == (
        WORKSPACE_ID,
        {"correlation_id": CORRELATION_ID, "limit": 1},
    )
    assert db.calls[1][-1] == Permission.RCA_READ.value


def test_route_returns_200_with_null_remediation_before_plan_exists() -> None:
    db = BundleDb(reports=[_report()], recovery=None)

    response = _client(db, session=_session()).get(
        routes.RCA_BUNDLE_PATH.format(correlation_id=CORRELATION_ID)
    )

    assert response.status_code == 200
    assert response.json()["remediation"] is None


def test_route_hides_missing_report_as_not_found() -> None:
    db = BundleDb(reports=[], recovery=_recovery())

    response = _client(db, session=_session()).get(
        routes.RCA_BUNDLE_PATH.format(correlation_id=CORRELATION_ID)
    )

    assert response.status_code == 404
    assert response.json() == {"detail": BUNDLE_NOT_FOUND}
    assert [call[0] for call in db.calls] == ["reports"]


def test_route_hides_cross_workspace_report_as_not_found() -> None:
    db = BundleDb(reports=[_report(workspace_id=OTHER_WORKSPACE_ID)], recovery=_recovery())

    response = _client(db, session=_session(WORKSPACE_ID)).get(
        routes.RCA_BUNDLE_PATH.format(correlation_id=CORRELATION_ID)
    )

    assert response.status_code == 404
    assert response.json() == {"detail": BUNDLE_NOT_FOUND}
    assert [call[0] for call in db.calls] == ["reports"]


def test_route_hides_inaccessible_cluster_and_does_not_read_recovery() -> None:
    db = BundleDb(reports=[_report()], recovery=_recovery(), cluster_access=False)

    response = _client(db, session=_session()).get(
        routes.RCA_BUNDLE_PATH.format(correlation_id=CORRELATION_ID)
    )

    assert response.status_code == 404
    assert response.json() == {"detail": BUNDLE_NOT_FOUND}
    assert [call[0] for call in db.calls] == ["reports", "access"]
    assert db.calls[1][-1] == Permission.RCA_READ.value


def test_route_hides_report_without_cluster_id() -> None:
    db = BundleDb(reports=[_report(cluster_id=None)], recovery=_recovery())

    response = _client(db, session=_session()).get(
        routes.RCA_BUNDLE_PATH.format(correlation_id=CORRELATION_ID)
    )

    assert response.status_code == 404
    assert response.json() == {"detail": BUNDLE_NOT_FOUND}
    assert [call[0] for call in db.calls] == ["reports"]


def test_bundle_json_schema_and_bruno_request_match_contract() -> None:
    documented = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    generated = RemediationBundleResponse.model_json_schema()

    assert documented.pop("$schema") == "https://json-schema.org/draft/2020-12/schema"
    assert documented == generated

    bruno = BRUNO_PATH.read_text(encoding="utf-8")
    assert "{{base_url}}rca/bundles/{{rca_correlation_id}}" in bruno
    assert "tests {" in bruno
    assert "[200, 401, 404]" in bruno


def test_gateway_registers_remediation_bundle_route(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgresql:5432/service")
    gateway = load_file(
        ROOT / "src" / "services" / "gateway" / "api-gateway" / "gateway.py",
        "test_remediation_bundle_gateway_module",
    )

    app = gateway.create_app()

    assert routes.RCA_BUNDLE_PATH in app.openapi()["paths"]

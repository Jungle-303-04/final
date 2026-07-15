from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
from typing import Any

from conftest import SpyDb, load_service, run_handler, subjects_of
from sqlalchemy.dialects import postgresql

from domains.rca.events import Evidence, EvidenceBuiltBody, IncidentRecord
from domains.rca.repository import RcaRepository
from services.ai.agent.pipeline.incident_signal import (
    incident_claim_identity,
    incident_termination_identity,
)


def oom_evidence(
    *,
    pod_uid: str = "pod-uid-1",
    restart_count: int = 1,
    finished_at: str = "2026-07-15T01:56:19Z",
) -> Evidence:
    return Evidence(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        object_ref="object://evidence/oom.json",
        kubernetes={
            "severity": "high",
            "pods": [
                {
                    "uid": pod_uid,
                    "name": "game-server-abc",
                    "namespace": "color-turf",
                    "owner_kind": "ReplicaSet",
                    "owner_name": "game-server-5cb84b9d77",
                    "restart_total": restart_count,
                    "terminated_reasons": ["OOMKilled"],
                    "containers": [
                        {
                            "name": "server",
                            "restart_count": restart_count,
                            "last_state": "terminated",
                            "last_state_reason": "OOMKilled",
                            "last_exit_code": 137,
                            "last_finished_at": finished_at,
                        }
                    ],
                }
            ],
        },
        metrics={"oom_last_terminated": 1},
        logs=[{"line": "container terminated reason=OOMKilled"}],
        traces={},
    )


def incident() -> IncidentRecord:
    return IncidentRecord(
        incident_id="corr-1",
        cluster_id="cluster-1",
        resource_kind="ReplicaSet",
        resource_name="game-server-5cb84b9d77",
        namespace="color-turf",
        symptom="CrashLoopBackOff",
        severity="high",
        first_seen_at=None,
        summary="server was OOMKilled",
        workspace_id="workspace-1",
    )


def test_termination_identity_is_stable_but_changes_for_a_new_termination() -> None:
    original = incident_termination_identity(oom_evidence(), incident())
    same_poll = incident_termination_identity(deepcopy(oom_evidence()), incident())
    next_restart = incident_termination_identity(
        oom_evidence(restart_count=2, finished_at="2026-07-15T02:01:00Z"), incident()
    )
    replacement_pod = incident_termination_identity(oom_evidence(pod_uid="pod-uid-2"), incident())

    assert original is not None
    assert same_poll == original
    assert next_restart is not None and next_restart.signal_key != original.signal_key
    assert replacement_pod is not None and replacement_pod.signal_key != original.signal_key


def test_incident_worker_suppresses_same_termination_across_reloaded_workers() -> None:
    db = SpyDb()
    event = EvidenceBuiltBody(evidence=oom_evidence())

    first_worker = load_service("ai/incident-worker")
    first = run_handler(
        first_worker.on_evidence_built,
        event,
        db=db,
        correlation_id="corr-first",
    )
    # Reloading the module simulates a new worker process; the shared store still
    # owns the claim, which is the production database behavior.
    restarted_worker = load_service("ai/incident-worker")
    duplicate = run_handler(
        restarted_worker.on_evidence_built,
        event,
        db=db,
        correlation_id="corr-duplicate",
    )

    assert subjects_of(first) == ["incident.detected", "evidence.bundle.built"]
    assert duplicate == []
    assert [name for name, _args in db.calls].count("claim_incident_signal") == 2
    timeline_events = [args[0] for name, args in db.calls if name == "append_timeline_event"]
    assert len(timeline_events) == 1
    timeline = timeline_events[0]
    assert timeline.source == "incident"
    assert timeline.subject.kind == "incident"
    assert timeline.subject.incident_id == "corr-first"
    assert timeline.subject.correlation_id == "corr-first"
    assert timeline.resource is None
    assert timeline.metadata == {"status": "detected", "severity": "critical"}
    assert "raw" not in timeline.metadata
    assert "logs" not in timeline.metadata


def test_incident_worker_does_not_publish_an_unconfirmed_detection() -> None:
    worker = load_service("ai/incident-worker")
    db = SpyDb()

    outs = run_handler(
        worker.on_evidence_built,
        EvidenceBuiltBody(
            evidence=Evidence(
                workspace_id="workspace-1",
                cluster_id="cluster-1",
                object_ref="object://evidence/empty.json",
                kubernetes={},
                metrics={},
                logs=[],
                traces={},
            )
        ),
        db=db,
        correlation_id="corr-empty",
    )

    assert outs == []
    assert not db.called("claim_incident_signal")
    assert not db.called("append_timeline_event")


def test_incident_worker_emits_when_restart_count_or_finished_at_advances() -> None:
    worker = load_service("ai/incident-worker")
    db = SpyDb()

    first = run_handler(
        worker.on_evidence_built,
        EvidenceBuiltBody(evidence=oom_evidence()),
        db=db,
        correlation_id="corr-first",
    )
    next_failure = run_handler(
        worker.on_evidence_built,
        EvidenceBuiltBody(
            evidence=oom_evidence(
                restart_count=2,
                finished_at="2026-07-15T02:01:00Z",
            )
        ),
        db=db,
        correlation_id="corr-second",
    )

    assert subjects_of(first) == ["incident.detected", "evidence.bundle.built"]
    assert subjects_of(next_failure) == ["incident.detected", "evidence.bundle.built"]


def test_incomplete_termination_identity_fails_open() -> None:
    evidence = oom_evidence(restart_count=0, finished_at="")

    assert incident_termination_identity(evidence, incident()) is None


def test_evidence_backed_incident_claim_identity_deduplicates_the_same_evidence_reference() -> None:
    evidence = Evidence(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        object_ref="object://evidence/crashloop.json",
        kubernetes={
            "resource": {
                "kind": "ReplicaSet",
                "name": "game-server-5cb84b9d77",
                "namespace": "color-turf",
            }
        },
        metrics={},
        logs=[],
        traces={},
    )

    first = incident_claim_identity(evidence, incident())
    repeated = incident_claim_identity(deepcopy(evidence), incident())

    assert first is not None
    assert repeated == first
    assert first.payload["object_ref"] == "object://evidence/crashloop.json"


def test_repository_claim_is_atomic_and_reports_conflict() -> None:
    statements: list[Any] = []
    inserted_ids: list[int | None] = [7, None]

    class Result:
        def scalar_one_or_none(self) -> int | None:
            return inserted_ids.pop(0)

    class Connection:
        def execute(self, statement: Any) -> Result:
            statements.append(statement)
            return Result()

    @contextmanager
    def connection():
        yield Connection()

    repository = object.__new__(RcaRepository)
    repository.connection = connection  # type: ignore[method-assign]
    payload = {"pod_uid": "pod-uid-1", "restart_count": 1}

    assert repository.claim_incident_signal(
        "workspace-1", "cluster-1", "signal-1", "corr-1", payload
    )
    assert not repository.claim_incident_signal(
        "workspace-1", "cluster-1", "signal-1", "corr-2", payload
    )

    compiled = statements[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "ON CONFLICT ON CONSTRAINT uq_incident_signal_claim_identity DO NOTHING" in sql
    assert "RETURNING incident_signal_claims.id" in sql

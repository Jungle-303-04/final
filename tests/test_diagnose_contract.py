"""Diagnose contract journeys.

As an operator, I can start one resource-scoped investigation safely, resume
its ordered transcript after reconnecting, and distinguish disclosure consent
from a separately confirmed command.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from packages.contracts.diagnose import (
    DiagnoseActionExecutionRequest,
    DiagnoseAgentSelection,
    DiagnoseConsentRequest,
    DiagnoseEvent,
    DiagnoseEventReplay,
    DiagnoseRun,
    DiagnoseRunCreateRequest,
    DiagnoseTarget,
    make_diagnose_target_key,
)
from pydantic import ValidationError

from packages.contracts.parity import ClusterScope, CommandRequest, ResourceRef


def make_scope(*, freshness: str = "live") -> ClusterScope:
    return ClusterScope(
        workspace_id="workspace-a",
        cluster_id="cluster-a",
        namespaces=("team-a",),
        freshness=freshness,
    )


def make_resource() -> ResourceRef:
    return ResourceRef(
        api_group="apps",
        version="v1",
        kind="Deployment",
        namespace="team-a",
        name="api",
        uid="deployment-uid",
    )


def make_target(*, freshness: str = "live") -> DiagnoseTarget:
    return DiagnoseTarget(scope=make_scope(freshness=freshness), resource=make_resource())


def make_request() -> DiagnoseRunCreateRequest:
    return DiagnoseRunCreateRequest(
        target=make_target(),
        agent=DiagnoseAgentSelection(agent_id="ops-investigator", effort="medium"),
    )


def test_create_request_is_strict_and_target_must_be_in_the_selected_namespace() -> None:
    raw = make_request().model_dump(mode="json")
    raw["unexpected"] = True

    with pytest.raises(ValidationError, match="unexpected"):
        DiagnoseRunCreateRequest.model_validate(raw)

    with pytest.raises(ValidationError, match="resource namespace"):
        DiagnoseTarget(
            scope=make_scope(),
            resource=make_resource().model_copy(update={"namespace": "team-b"}),
        )


def test_target_key_ignores_freshness_but_run_deduplication_is_actor_and_agent_scoped() -> None:
    live_target = make_target(freshness="live")
    stale_target = make_target(freshness="stale")

    assert make_diagnose_target_key(live_target) == make_diagnose_target_key(stale_target)

    run = DiagnoseRun.from_create_request(
        run_id="run-1",
        request=make_request(),
        requested_by="operator-a",
    )
    same_target_other_actor = DiagnoseRun.from_create_request(
        run_id="run-2",
        request=make_request(),
        requested_by="operator-b",
    )
    other_agent = DiagnoseRun.from_create_request(
        run_id="run-3",
        request=DiagnoseRunCreateRequest(
            target=make_target(),
            agent=DiagnoseAgentSelection(agent_id="another-investigator"),
        ),
        requested_by="operator-a",
    )

    assert run.target_key == make_diagnose_target_key(live_target)
    assert run.deduplication_key != same_target_other_actor.deduplication_key
    assert run.deduplication_key != other_agent.deduplication_key


def test_disclosure_consent_never_substitutes_for_command_confirmation() -> None:
    consent = DiagnoseConsentRequest(
        scope=make_scope(),
        agent_id="ops-investigator",
        disclosure_revision="2026-07",
        surface="browser",
    )
    assert "confirmation" not in consent.model_dump()

    unconfirmed = CommandRequest.model_construct(
        scope=make_scope(),
        resource=make_resource(),
        action="restart",
        diff={"replicas": 2},
        confirmation=False,
        reason="recover service",
    )
    with pytest.raises(ValidationError, match="confirmation"):
        DiagnoseActionExecutionRequest.model_validate(
            {
                "run_id": "run-1",
                "proposal_id": "proposal-1",
                "target": make_target().model_dump(mode="json"),
                "command": unconfirmed.model_dump(mode="json"),
            }
        )


def test_replay_requires_monotonic_events_and_makes_resync_explicit() -> None:
    timestamp = datetime(2026, 7, 15, tzinfo=UTC)
    first = DiagnoseEvent(
        run_id="run-1",
        sequence=3,
        kind="phase",
        payload={"status": "running"},
        occurred_at=timestamp,
    )
    second = DiagnoseEvent(
        run_id="run-1",
        sequence=4,
        kind="thinking",
        payload={"text": "collecting evidence"},
        occurred_at=timestamp,
    )

    replay = DiagnoseEventReplay(
        run_id="run-1",
        state="available",
        requested_after_sequence=2,
        next_cursor_sequence=4,
        high_water_sequence=4,
        events=(first, second),
    )
    assert replay.next_cursor_sequence == 4

    with pytest.raises(ValidationError, match="strictly ordered"):
        DiagnoseEventReplay(
            run_id="run-1",
            state="available",
            requested_after_sequence=2,
            next_cursor_sequence=3,
            high_water_sequence=4,
            events=(second, first),
        )

    resync = DiagnoseEventReplay(
        run_id="run-1",
        state="resync_required",
        requested_after_sequence=2,
        next_cursor_sequence=2,
        high_water_sequence=8,
        earliest_available_sequence=5,
    )
    assert resync.events == ()

    with pytest.raises(ValidationError, match="must not include events"):
        DiagnoseEventReplay(
            run_id="run-1",
            state="resync_required",
            requested_after_sequence=2,
            next_cursor_sequence=2,
            high_water_sequence=8,
            earliest_available_sequence=5,
            events=(first,),
        )

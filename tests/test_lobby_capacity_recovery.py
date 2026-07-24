from domains.rca.events import (
    IncidentRecord,
    RcaCompletedBody,
    RcaReportDetail,
    RecoveryPlannedBody,
)
from packages.contracts.gitops_authority import GitOpsAuthorityContext
from services.ai.agent.defaults import ActionRoutes
from services.ai.agent.recovery.catalog import registered_recovery_rules
from services.ai.agent.recovery.dispatch import scalar_replacements_for
from services.ai.agent.recovery.engine import RecoveryPlanner


def lobby_report() -> RcaCompletedBody:
    incident = IncidentRecord(
        incident_id="incident-lobby",
        cluster_id="game-server111-7224",
        resource_kind="Deployment",
        resource_name="api-server",
        namespace="target",
        symptom="application admission failure ratio high",
        severity="warning",
        first_seen_at="2026-07-24T00:00:00Z",
        summary="new player admissions are being rejected",
        workspace_id="workspace-1",
    )
    detail = RcaReportDetail(
        root_cause="lobby_capacity_saturation",
        confidence=0.98,
        selected_candidate_id="lobby_capacity_saturation",
        supporting_evidence=["object://evidence/incident-lobby.json#metrics"],
        missing_evidence=[],
        reason="the lobby was reduced from two replicas to one before traffic increased",
    )
    return RcaCompletedBody(
        root_cause=detail.root_cause,
        action="restore the approved lobby replica count",
        evidence_ref="object://evidence/incident-lobby.json",
        workspace_id="workspace-1",
        incident=incident,
        rca_detail=detail,
    )


def lobby_authority(*, changes: tuple[dict[str, object], ...]) -> GitOpsAuthorityContext:
    return GitOpsAuthorityContext(
        workspace_id="workspace-1",
        repository_id="repo-1",
        binding_id="binding-1",
        application_id="app-1",
        workflow_run_id="run-1",
        environment="target",
        cluster_id="game-server111-7224",
        manifest_path="k8s/api-server.yaml",
        repo_ref="example/game-server",
        base_branch="main",
        commit_sha="a" * 40,
        source_type="raw-yaml",
        source_manifest_sha256="sha256:" + "b" * 64,
        resource="Deployment/api-server",
        desired_manifest={
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {"name": "api-server", "namespace": "target"},
            "spec": {
                "replicas": 1,
                "template": {
                    "spec": {
                        "containers": [
                            {"name": "api-server", "image": "example/game:v2"}
                        ]
                    }
                },
            },
        },
        changes=changes,
        evidence={},
    )


def test_lobby_capacity_recommends_only_gitops_safe_pr() -> None:
    matching = [
        rule
        for rule in registered_recovery_rules()
        if "lobby_capacity_saturation" in getattr(rule, "root_causes", ())
    ]

    assert len(matching) == 1
    assert len(matching[0].action_specs) == 1
    spec = matching[0].action_specs[0]
    assert spec.action_type == "replica_scale"
    assert spec.route == ActionRoutes().safe_pr
    assert spec.params == {"strategy": "last_approved_snapshot"}
    assert all(action.action_type != "deployment_scale" for action in matching[0].action_specs)

    planned = RecoveryPlanner().plan_body(lobby_report())

    assert isinstance(planned, RecoveryPlannedBody)
    assert planned.plan is not None
    recommended = next(
        candidate
        for candidate in planned.plan.candidates
        if candidate.action_id == planned.plan.recommended_action_id
    )
    assert recommended.draft.action_type == "replica_scale"
    assert recommended.route == ActionRoutes().safe_pr
    assert recommended.draft.params["strategy"] == "last_approved_snapshot"


def test_lobby_safe_pr_restores_exact_previous_approved_replicas() -> None:
    planned = RecoveryPlanner().plan_body(lobby_report())
    assert isinstance(planned, RecoveryPlannedBody)
    assert planned.plan is not None
    selected = next(
        candidate
        for candidate in planned.plan.candidates
        if candidate.action_id == planned.plan.recommended_action_id
    )
    authority = lobby_authority(
        changes=(
            {
                "field_path": "spec.replicas",
                "old_desired": 2,
                "new_desired": 1,
            },
        )
    )

    replacements = scalar_replacements_for("replica_scale", selected, authority)

    assert len(replacements) == 1
    assert replacements[0].field_path == "spec.replicas"
    assert replacements[0].current_value == 1
    assert replacements[0].desired_value == 2


def test_lobby_safe_pr_does_not_guess_without_one_approved_previous_value() -> None:
    planned = RecoveryPlanner().plan_body(lobby_report())
    assert isinstance(planned, RecoveryPlannedBody)
    assert planned.plan is not None
    selected = next(
        candidate
        for candidate in planned.plan.candidates
        if candidate.action_id == planned.plan.recommended_action_id
    )

    assert scalar_replacements_for(
        "replica_scale",
        selected,
        lobby_authority(changes=()),
    ) == []

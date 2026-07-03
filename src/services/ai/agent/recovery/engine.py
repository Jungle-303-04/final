from __future__ import annotations

from dataclasses import dataclass

from domains.rca.events import (
    HealingActionDraft,
    RcaActionRequiredBody,
    RcaCompletedBody,
    RecoveryActionCandidate,
    RecoveryPlan,
    RecoveryPlannedBody,
)
from packages.contracts.event_bus.bodies import EventBody
from services.ai.agent.defaults import ActionRoutes, RcaMessages, RecoveryDefaults
from services.ai.agent.playbooks.recovery import RecoveryRule, build_recovery_context
from services.ai.agent.recovery.catalog import registered_recovery_rules

NO_RECOVERY_CANDIDATES = "복구 후보를 생성할 수 없습니다."


@dataclass(frozen=True)
class RecoveryPlanner:
    defaults: RecoveryDefaults = RecoveryDefaults()
    messages: RcaMessages = RcaMessages()
    routes: ActionRoutes = ActionRoutes()

    def plan_body(self, report: RcaCompletedBody) -> EventBody:
        context = build_recovery_context(report)
        if context is None:
            return RcaActionRequiredBody(
                reason=self.messages.missing_analysis_context,
                evidence_ref=report.evidence_ref,
                workspace_id=report.workspace_id,
            )
        candidates = ranked_candidates(context, registered_recovery_rules())
        draft = first_draft_or_default(report, candidates, self.defaults)
        if not candidates:
            return RcaActionRequiredBody(
                reason=NO_RECOVERY_CANDIDATES,
                evidence_ref=report.evidence_ref,
                workspace_id=report.workspace_id,
            )
        recommended = candidates[0]
        return RecoveryPlannedBody(
            draft=draft,
            plan=RecoveryPlan(
                plan_id=f"recovery:{report.evidence_ref}",
                incident_id=context.incident.incident_id,
                evidence_ref=report.evidence_ref,
                summary=context.detail.reason,
                target=context.target,
                recommended_action_id=recommended.action_id,
                execution_route=recommended.route,
                selection_required=recommended.approval_required,
                candidates=candidates,
            ),
            workspace_id=report.workspace_id,
        )


def ranked_candidates(context, rules: tuple[RecoveryRule, ...]) -> list[RecoveryActionCandidate]:
    candidates: list[RecoveryActionCandidate] = []
    for rule in rules:
        if rule.supports(context):
            candidates.extend(rule.candidates(context))
    return sorted(candidates, key=lambda candidate: (candidate.rank, -candidate.score))


def first_draft_or_default(
    report: RcaCompletedBody,
    candidates: list[RecoveryActionCandidate],
    defaults: RecoveryDefaults,
) -> HealingActionDraft:
    if candidates:
        return candidates[0].draft
    incident = report.incident
    detail = report.rca_detail
    return HealingActionDraft(
        action_type=defaults.action_type,
        namespace=incident.namespace
        if incident and incident.namespace
        else defaults.unknown_namespace,
        resource_kind=incident.resource_kind if incident else "unknown",
        resource_name=incident.resource_name if incident else "unknown",
        reason=detail.reason if detail else NO_RECOVERY_CANDIDATES,
        risk_level=defaults.risk_level,
        dry_run=defaults.dry_run,
        source_evidence=detail.supporting_evidence if detail else [],
        params={},
    )

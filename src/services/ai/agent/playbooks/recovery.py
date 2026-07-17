from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

from domains.rca.events import (
    HealingActionDraft,
    IncidentRecord,
    RcaCompletedBody,
    RcaReportDetail,
    RecoveryActionCandidate,
)
from packages.config.constants import Sandbox
from packages.contracts.event_bus.bodies import JsonObject
from services.ai.agent.defaults import RecoveryDefaults


@dataclass(frozen=True)
class RecoveryContext:
    report: RcaCompletedBody
    incident: IncidentRecord
    detail: RcaReportDetail
    evidence_ref: str

    @property
    def root_cause(self) -> str:
        return self.detail.root_cause

    @property
    def target(self) -> JsonObject:
        return {
            "cluster_id": self.incident.cluster_id,
            "workspace_id": self.incident.workspace_id,
            "namespace": self.incident.namespace,
            "resource_kind": self.incident.resource_kind,
            "resource_name": self.incident.resource_name,
            "symptom": self.incident.symptom,
            "severity": self.incident.severity,
        }


class RecoveryRule(Protocol):
    def supports(self, context: RecoveryContext) -> bool: ...

    def candidates(self, context: RecoveryContext) -> list[RecoveryActionCandidate]: ...


@dataclass(frozen=True)
class RecoveryActionSpec:
    action_type: str
    title: str
    description: str
    route: str
    risk_level: str
    score: float
    blast_radius: str
    approval_required: bool
    prerequisites: tuple[str, ...]
    validation_checks: tuple[str, ...]
    rollback_plan: str
    params: JsonObject
    approval_required_outside_sandbox: bool = False
    recommendation_reason: str = ""
    expected_outcome: str = ""
    risk_explanation: str = ""
    rollback_reason: str = ""

    def to_candidate(
        self,
        context: RecoveryContext,
        rank: int,
        defaults: RecoveryDefaults | None = None,
    ) -> RecoveryActionCandidate:
        active_defaults = defaults or RecoveryDefaults()
        incident = context.incident
        detail = context.detail
        approval_required = self.approval_required or (
            self.approval_required_outside_sandbox and incident.namespace != Sandbox.NAMESPACE
        )
        action_id = f"{context.report.evidence_ref}:{self.action_type}"
        params = {
            "root_cause": detail.root_cause,
            "confidence": detail.confidence,
            "symptom": incident.symptom,
            **self.params,
        }
        draft = HealingActionDraft(
            action_type=self.action_type,
            namespace=incident.namespace or active_defaults.unknown_namespace,
            resource_kind=incident.resource_kind,
            resource_name=incident.resource_name,
            reason=detail.reason,
            risk_level=self.risk_level,
            dry_run=active_defaults.dry_run,
            source_evidence=detail.supporting_evidence,
            params=params,
        )
        return RecoveryActionCandidate(
            action_id=action_id,
            title=self.title,
            description=self.description,
            draft=draft,
            route=self.route,
            rank=rank,
            score=self.score,
            risk_level=self.risk_level,
            blast_radius=self.blast_radius,
            approval_required=approval_required,
            prerequisites=list(self.prerequisites),
            validation_checks=list(self.validation_checks),
            rollback_plan=self.rollback_plan,
            evidence_refs=[context.evidence_ref, *detail.supporting_evidence],
            recommendation_reason=self.recommendation_reason,
            expected_outcome=self.expected_outcome,
            risk_explanation=self.risk_explanation,
            rollback_reason=self.rollback_reason,
        )


@dataclass(frozen=True)
class RootCauseRecoveryRule:
    root_causes: tuple[str, ...]
    action_specs: tuple[RecoveryActionSpec, ...]
    defaults: RecoveryDefaults = RecoveryDefaults()

    def supports(self, context: RecoveryContext) -> bool:
        return context.root_cause in self.root_causes

    def candidates(self, context: RecoveryContext) -> list[RecoveryActionCandidate]:
        return [
            spec.to_candidate(context, rank=index + 1, defaults=self.defaults)
            for index, spec in enumerate(self.action_specs)
        ]


@dataclass(frozen=True)
class AlwaysAvailableRecoveryRule:
    action_specs: tuple[RecoveryActionSpec, ...]
    defaults: RecoveryDefaults = RecoveryDefaults()

    def supports(self, context: RecoveryContext) -> bool:
        return True

    def candidates(self, context: RecoveryContext) -> list[RecoveryActionCandidate]:
        return [
            spec.to_candidate(context, rank=index + 1, defaults=self.defaults)
            for index, spec in enumerate(self.action_specs)
        ]


RECOVERY_RULES: list[RecoveryRule] = []


def recovery_for(
    *,
    root_causes: tuple[str, ...],
    actions: tuple[RecoveryActionSpec, ...],
) -> Callable[[type], type]:
    def decorator(marker: type) -> type:
        RECOVERY_RULES.append(RootCauseRecoveryRule(root_causes, actions))
        return marker

    return decorator


def fallback_recovery(
    *,
    actions: tuple[RecoveryActionSpec, ...],
) -> Callable[[type], type]:
    def decorator(marker: type) -> type:
        RECOVERY_RULES.append(AlwaysAvailableRecoveryRule(actions))
        return marker

    return decorator


def registered_recovery_rules() -> tuple[RecoveryRule, ...]:
    import services.ai.agent.recovery.catalog  # noqa: F401

    return tuple(RECOVERY_RULES)


def build_recovery_context(report: RcaCompletedBody) -> RecoveryContext | None:
    if report.incident is None or report.rca_detail is None:
        return None

    return RecoveryContext(
        report=report,
        incident=report.incident,
        detail=report.rca_detail,
        evidence_ref=report.evidence_ref,
    )

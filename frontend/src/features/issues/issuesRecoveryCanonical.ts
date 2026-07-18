import type {
  IssuesEndpointRecoveryCandidate,
  IssuesEndpointRecoveryPlan,
  IssuesEndpointRecoveryReceipt,
} from "./issuesEndpointContract";
import type {
  IssueRecoveryCandidate,
  IssueRecoveryPlan,
  IssueRecoveryReceipt,
} from "./issuesRecoveryContract";
import { IssuesCanonicalError } from "./issuesContract";

export function toIssueRecoveryPlan(
  correlationId: string,
  response: IssuesEndpointRecoveryPlan,
): IssueRecoveryPlan {
  const responseCorrelationId = required(response.correlation_id, "correlation_id");
  if (responseCorrelationId !== correlationId) {
    throw new IssuesCanonicalError("Recovery plan correlation_id does not match request");
  }
  const candidates = response.candidates.map(recoveryCandidate);
  const candidateIds = new Set(candidates.map(({ id }) => id));
  if (candidateIds.size !== candidates.length) {
    throw new IssuesCanonicalError("Recovery plan contains duplicate action ids");
  }
  const selectedAction = response.selected_action === null
    ? null
    : recoveryCandidate(response.selected_action);
  const selectedActionId = optional(response.selected_action_id);
  if (selectedAction !== null && selectedAction.id !== selectedActionId) {
    throw new IssuesCanonicalError("Recovery selected action does not match selected_action_id");
  }

  return {
    id: required(response.plan_id, "plan_id"),
    correlationId,
    incidentId: required(response.incident_id, "incident_id"),
    evidenceRef: required(response.evidence_ref, "evidence_ref"),
    status: required(response.status, "recovery status"),
    summary: response.summary,
    recommendedActionId: required(response.recommended_action_id, "recommended_action_id"),
    executionRoute: response.execution_route,
    selectionRequired: response.selection_required,
    selectedActionId,
    selectedBy: optional(response.selected_by),
    selectedAction,
    candidates,
  };
}

export function toIssueRecoveryReceipt(
  correlationId: string,
  response: IssuesEndpointRecoveryReceipt,
): IssueRecoveryReceipt {
  const responseCorrelationId = required(response.correlation_id, "receipt correlation_id");
  if (responseCorrelationId !== correlationId) {
    throw new IssuesCanonicalError("Recovery receipt correlation_id does not match request");
  }
  return {
    accepted: response.accepted,
    eventId: required(response.event_id, "event_id"),
    correlationId,
  };
}

function recoveryCandidate(
  candidate: IssuesEndpointRecoveryCandidate,
): IssueRecoveryCandidate {
  if (!Number.isFinite(candidate.score)) {
    throw new IssuesCanonicalError("Recovery candidate score must be finite");
  }
  return {
    id: required(candidate.action_id, "action_id"),
    title: candidate.title,
    description: candidate.description,
    route: candidate.route,
    rank: candidate.rank,
    score: candidate.score,
    riskLevel: candidate.risk_level,
    blastRadius: candidate.blast_radius,
    approvalRequired: candidate.approval_required,
    prerequisites: [...candidate.prerequisites],
    validationChecks: [...candidate.validation_checks],
    rollbackPlan: candidate.rollback_plan,
    evidenceRefs: [...candidate.evidence_refs],
    recommendationReason: optional(candidate.recommendation_reason ?? null),
    expectedOutcome: optional(candidate.expected_outcome ?? null),
    riskExplanation: optional(candidate.risk_explanation ?? null),
    rollbackReason: optional(candidate.rollback_reason ?? null),
  };
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new IssuesCanonicalError(`${field} is required`);
  return normalized;
}

function optional(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

import type { TranslationFunction } from "../../shared/i18n";
import type { IssuesMessageKey } from "../../shared/i18n/keys/issues";
import type { IssueAuditEvent } from "./issuesAuditContract";

const EVENT_KEYS: Readonly<Record<string, IssuesMessageKey>> = {
  "cluster.evidence.received": "issues.audit.event.clusterEvidenceReceived",
  "evidence.built": "issues.audit.event.evidenceBuilt",
  "incident.detected": "issues.audit.event.incidentDetected",
  "evidence.bundle.built": "issues.audit.event.evidenceBundleBuilt",
  "rca.candidates.planned": "issues.audit.event.rcaCandidatesPlanned",
  "rca.candidates.evaluated": "issues.audit.event.rcaCandidatesEvaluated",
  "rca.completed": "issues.audit.event.rcaCompleted",
  "recovery.planned": "issues.audit.event.recoveryPlanned",
  "recovery.action_selected": "issues.audit.event.recoveryActionSelected",
  "command.requested": "issues.audit.event.commandRequested",
  "command.dispatched": "issues.audit.event.commandDispatched",
  "command.queued_for_agent": "issues.audit.event.commandQueuedForAgent",
  "command.completed": "issues.audit.event.commandCompleted",
  "command.rejected": "issues.audit.event.commandRejected",
  "incident.resolved": "issues.audit.event.incidentResolved",
  "safe_pr.requested": "issues.audit.event.safePrRequested",
  "safe_pr.patch_prepared": "issues.audit.event.safePrPatchPrepared",
  "safe_pr.ready_for_creation": "issues.audit.event.safePrReady",
  "safe_pr.created": "issues.audit.event.safePrCreated",
  "safe_pr.failed": "issues.audit.event.safePrFailed",
  "workflow.run.failed": "issues.audit.event.workflowFailed",
  "workflow.failed": "issues.audit.event.workflowFailed",
  "workflow.step": "issues.audit.event.workflowStep",
  "alert.requested": "issues.audit.event.alertRequested",
  "alert.dispatched": "issues.audit.event.alertDispatched",
};

const STAGE_KEYS: Readonly<Record<IssueAuditEvent["journeyStage"], IssuesMessageKey>> = {
  alert: "issues.audit.stage.alert",
  evidence: "issues.audit.stage.evidence",
  rca: "issues.audit.stage.rca",
  recovery: "issues.audit.stage.recovery",
  command: "issues.audit.stage.command",
  pr: "issues.audit.stage.pr",
  workflow: "issues.audit.stage.workflow",
  cluster: "issues.audit.stage.cluster",
  ai: "issues.audit.stage.ai",
  notification: "issues.audit.stage.notification",
  system: "issues.audit.stage.system",
  unknown: "issues.audit.stage.unknown",
};

export function issueAuditEventLabel(subject: string, t: TranslationFunction): string {
  return t(EVENT_KEYS[subject] ?? "issues.audit.event.unknown");
}

export function issueAuditStageLabel(
  stage: IssueAuditEvent["journeyStage"],
  t: TranslationFunction,
): string {
  return t(STAGE_KEYS[stage]);
}

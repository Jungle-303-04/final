import type { RcaIssueList } from "../api/schemas";

export type RcaIssueItem = RcaIssueList["items"][number];

export const RCA_RECENT_ATTEMPT_LIMIT = 3;

export interface RcaIssueAttemptSummary {
  correlationId: string;
  incidentId: string | null;
  currentSubject: string;
  clusterId: string | null;
  namespace: string | null;
  resourceName: string | null;
  resourceKind: string | null;
  rawSymptom: string | null;
  status: string;
  updatedAt: string | null;
  severity: "critical" | "warning" | null;
  rootCause: string | null;
  confidence: number | null;
  supportingEvidence: string[];
  missingEvidence: string[];
  situationSummary: string | null;
  recommendedActionSummary: string | null;
  evidenceSummary: string | null;
  evidenceBundleSummary: string | null;
  actionRoute: string | null;
  prUrl: string | null;
  errorReason: string | null;
  recoveryReasonCode: string | null;
}

export interface RcaIssueAttemptMetadata {
  attemptCount: number;
  recentAttempts: RcaIssueAttemptSummary[];
}

export type RcaIssueRepresentativeItem = RcaIssueItem & RcaIssueAttemptMetadata;

const TERMINAL_ISSUE_STATUSES = new Set([
  "cancelled",
  "closed",
  "completed",
  "dismissed",
  "incident_resolved",
  "resolved",
]);

const REPRESENTATIVE_PRIORITY_ORDER = [
  { key: "verificationPending", statuses: ["verification_pending"] },
  { key: "deployPending", statuses: ["deploy_pending"] },
  { key: "prUrlObserved", statuses: [] },
  { key: "prOpen", statuses: ["pr_open"] },
  { key: "prCreated", statuses: ["pr_created"] },
  { key: "prReadyForCreation", statuses: ["pr_ready_for_creation"] },
  { key: "prDiffExplained", statuses: ["pr_diff_explained"] },
  { key: "prPatchPrepared", statuses: ["pr_patch_prepared"] },
  { key: "prRequested", statuses: ["pr_requested"] },
  { key: "commandQueued", statuses: ["command_queued"] },
  { key: "commandDispatched", statuses: ["command_dispatched"] },
  { key: "commandRequested", statuses: ["command_requested"] },
  { key: "recoverySelected", statuses: ["recovery_selected", "selected"] },
  { key: "selectionRequired", statuses: ["selection_required"] },
  { key: "approvalRecommended", statuses: ["approval_recommended"] },
  { key: "recoveryPlanned", statuses: ["recovery_planned"] },
  { key: "actionRouteObserved", statuses: [] },
  { key: "operatorFollowup", statuses: ["action_required", "followup_required"] },
  { key: "analysisComplete", statuses: ["rca_completed"] },
  { key: "rcaEvaluated", statuses: ["rca_evaluated"] },
  { key: "rcaPlanned", statuses: ["rca_planned"] },
  { key: "evidenceBundled", statuses: ["evidence_bundled"] },
  { key: "incidentDetected", statuses: ["incident_detected"] },
] as const;

type RepresentativePriorityKey = (typeof REPRESENTATIVE_PRIORITY_ORDER)[number]["key"];

const REPRESENTATIVE_PRIORITY_BY_KEY = new Map<RepresentativePriorityKey, number>(
  REPRESENTATIVE_PRIORITY_ORDER.map((entry, index) => [
    entry.key,
    REPRESENTATIVE_PRIORITY_ORDER.length - index,
  ]),
);

const REPRESENTATIVE_STATUS_PRIORITY = new Map<string, number>(
  REPRESENTATIVE_PRIORITY_ORDER.flatMap(({ key, statuses }) =>
    statuses.map((status) => [status, representativePriorityFor(key)] as const)
  ),
);

interface RankedIssue {
  item: RcaIssueItem;
  index: number;
  updatedMs: number;
}

/**
 * RCA can create many correlations for one still-active resource symptom. The
 * issue list should keep a recovery-bearing attempt visible while still noting
 * the latest raw attempt for operator context.
 */
export function selectRcaIssueRepresentatives(
  items: readonly RcaIssueItem[],
): RcaIssueRepresentativeItem[] {
  const groups = new Map<string, RankedIssue[]>();
  items.forEach((item, index) => {
    const identity = rcaIssueIdentity(item);
    const group = groups.get(identity) ?? [];
    group.push({ item, index, updatedMs: parseUpdatedMs(item.updated_at) });
    groups.set(identity, group);
  });

  return [...groups.entries()]
    .map(([, group]) => representativeForGroup(group))
    .sort((a, b) => {
      const latestTime = parseUpdatedMs(b.recentAttempts[0]?.updatedAt ?? null) -
        parseUpdatedMs(a.recentAttempts[0]?.updatedAt ?? null);
      if (latestTime !== 0) return latestTime;
      return parseUpdatedMs(b.updated_at) - parseUpdatedMs(a.updated_at);
    });
}

export function rcaIssueIdentity(item: Pick<RcaIssueItem,
  "cluster_id" | "incident_namespace" | "incident_resource_kind" |
  "incident_resource_name" | "incident_symptom" | "incident_id" | "correlation_id"
>): string {
  const resourceName = normalizeIdentityPart(item.incident_resource_name);
  const symptom = normalizeIdentityPart(item.incident_symptom);
  if (resourceName === "" || symptom === "") {
    return `event:${item.incident_id ?? item.correlation_id}`;
  }
  return [
    normalizeIdentityPart(item.cluster_id),
    normalizeIdentityPart(item.incident_namespace),
    normalizeIdentityPart(item.incident_resource_kind),
    resourceName,
    symptom,
  ].join("\u0000");
}

export function isTerminalRcaIssueStatus(status: string): boolean {
  return TERMINAL_ISSUE_STATUSES.has(normalizeRcaStatus(status));
}

export function normalizeRcaStatus(status: string): string {
  return status.trim().toLocaleLowerCase().replace(/[.\s-]+/gu, "_");
}

function representativeForGroup(group: readonly RankedIssue[]): RcaIssueRepresentativeItem {
  const ordered = [...group].sort((a, b) =>
    b.updatedMs - a.updatedMs || a.index - b.index
  );
  const latest = ordered[0];
  const representative = isTerminalRcaIssueStatus(latest.item.status)
    ? latest
    : ordered.reduce((best, candidate) => (
      compareRepresentative(candidate, best) < 0 ? candidate : best
    ), latest);
  return {
    ...representative.item,
    attemptCount: group.length,
    recentAttempts: ordered.slice(0, RCA_RECENT_ATTEMPT_LIMIT).map(({ item }) => attemptSummary(item)),
  };
}

function compareRepresentative(left: RankedIssue, right: RankedIssue): number {
  const priority = representativePriority(right.item) - representativePriority(left.item);
  if (priority !== 0) return priority;
  const updated = right.updatedMs - left.updatedMs;
  if (updated !== 0) return updated;
  return left.index - right.index;
}

function representativePriority(item: RcaIssueItem): number {
  const statusPriority = REPRESENTATIVE_STATUS_PRIORITY.get(normalizeRcaStatus(item.status)) ?? 0;
  return Math.max(
    statusPriority,
    item.pr_url?.trim() ? representativePriorityFor("prUrlObserved") : 0,
    item.action_route?.trim() ? representativePriorityFor("actionRouteObserved") : 0,
  );
}

function representativePriorityFor(key: RepresentativePriorityKey): number {
  return REPRESENTATIVE_PRIORITY_BY_KEY.get(key) ?? 0;
}

function attemptSummary(item: RcaIssueItem): RcaIssueAttemptSummary {
  return {
    correlationId: item.correlation_id,
    incidentId: item.incident_id,
    currentSubject: item.current_subject,
    clusterId: item.cluster_id,
    namespace: item.incident_namespace,
    resourceName: item.incident_resource_name,
    resourceKind: item.incident_resource_kind,
    rawSymptom: item.incident_symptom,
    status: item.status,
    updatedAt: item.updated_at,
    severity: item.issue_severity,
    rootCause: item.root_cause,
    confidence: item.confidence,
    supportingEvidence: Array.isArray(item.supporting_evidence) ? [...item.supporting_evidence] : [],
    missingEvidence: Array.isArray(item.missing_evidence) ? [...item.missing_evidence] : [],
    situationSummary: item.situation_summary,
    recommendedActionSummary: item.recommended_action_summary,
    evidenceSummary: item.evidence_summary,
    evidenceBundleSummary: item.evidence_bundle_summary,
    actionRoute: item.action_route,
    prUrl: item.pr_url,
    errorReason: item.error_reason,
    recoveryReasonCode: item.recovery_reason_code ?? null,
  };
}

function normalizeIdentityPart(value: string | null): string {
  return (value ?? "").trim().toLocaleLowerCase().replace(/[\s_-]+/gu, " ");
}

function parseUpdatedMs(value: string | null): number {
  if (value === null) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

import { useEffect, useState } from "react";

import { listRcaIssues } from "../api/rca-issues";
import { getRecoveryPlanByCorrelation } from "../api/recovery";
import type { RecoveryPlan } from "../api/recovery-schemas";
import type { RcaIssueList } from "../api/schemas";

// UI-PHASE2-001: typed live adapters for the RCA Issue *detail* drawer. Unlike
// the reduced `rcaIssuesFeed` view (list/bell), this exposes the full observed
// RCA fields the Issue-queue contract already carries — root cause, confidence,
// supporting/missing evidence and the AI-authored summaries — plus the recovery
// candidate plan (`GET /api/rca/recovery-plans/by-correlation/{id}`). Nothing is
// fabricated: absent fields stay null/empty and a load failure is an honest
// `unavailable`, never a synthesised cause/evidence/recovery.

export type RcaDetailStatus = "loading" | "ready" | "unavailable";

export interface RcaIssueDetailView {
  correlationId: string;
  incidentId: string | null;
  clusterId: string | null;
  namespace: string | null;
  resourceName: string | null;
  resourceKind: string | null;
  symptom: string | null;
  status: string;
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
}

export interface RcaIssueDetailsFeed {
  status: RcaDetailStatus;
  items: RcaIssueDetailView[];
}

type RcaIssueItem = RcaIssueList["items"][number];

export function toRcaIssueDetailView(item: RcaIssueItem): RcaIssueDetailView {
  return {
    correlationId: item.correlation_id,
    incidentId: item.incident_id,
    clusterId: item.cluster_id,
    namespace: item.incident_namespace,
    resourceName: item.incident_resource_name,
    resourceKind: item.incident_resource_kind,
    symptom: item.incident_symptom,
    status: item.status,
    severity: item.issue_severity,
    rootCause: item.root_cause,
    confidence: item.confidence,
    supportingEvidence: [...item.supporting_evidence],
    missingEvidence: [...item.missing_evidence],
    situationSummary: item.situation_summary,
    recommendedActionSummary: item.recommended_action_summary,
    evidenceSummary: item.evidence_summary,
    evidenceBundleSummary: item.evidence_bundle_summary,
    actionRoute: item.action_route,
    prUrl: item.pr_url,
    errorReason: item.error_reason,
  };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

/**
 * Reads the full Issue-queue projection for the detail drawer. A load failure is
 * an honest `unavailable`; the queue already carries the observed RCA fields, so
 * no per-incident refetch is needed for cause/confidence/evidence.
 */
export function useRcaIssueDetails(clusterId?: string): RcaIssueDetailsFeed {
  const [feed, setFeed] = useState<RcaIssueDetailsFeed>({ status: "loading", items: [] });
  useEffect(() => {
    const controller = new AbortController();
    void listRcaIssues({ clusterId, signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setFeed({ status: "ready", items: response.items.map(toRcaIssueDetailView) });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setFeed({ status: "unavailable", items: [] });
      });
    return () => controller.abort();
  }, [clusterId]);
  return feed;
}

export type RecoveryPlanStatus = "idle" | "loading" | "ready" | "unavailable";

export interface RecoveryPlanFeed {
  status: RecoveryPlanStatus;
  plan: RecoveryPlan | null;
}

/**
 * Loads the recovery candidate plan for one Incident correlation. This is a
 * read-only observation of the server-generated candidates; it never executes a
 * recovery. Without a correlation id the feed stays `idle` (nothing to observe).
 */
export function useRecoveryPlan(correlationId?: string | null): RecoveryPlanFeed {
  const [feed, setFeed] = useState<RecoveryPlanFeed>(
    () => ({ status: correlationId ? "loading" : "idle", plan: null }),
  );
  useEffect(() => {
    if (!correlationId) return;
    const controller = new AbortController();
    void getRecoveryPlanByCorrelation(correlationId, { signal: controller.signal })
      .then((plan) => {
        if (controller.signal.aborted) return;
        setFeed({ status: "ready", plan });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setFeed({ status: "unavailable", plan: null });
      });
    return () => controller.abort();
  }, [correlationId]);
  return feed;
}

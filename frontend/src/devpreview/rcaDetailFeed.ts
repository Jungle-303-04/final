import { useEffect, useState } from "react";

import { getRecoveryPlanByCorrelation } from "../api/recovery";
import type { RecoveryPlan } from "../api/recovery-schemas";
import { getRemediationBundle } from "../api/rca-bundle";
import type { RemediationBundleResponse } from "../api/rca-bundle-schemas";
import { getAuditTimeline } from "../api/audit-timeline";
import type { AuditTimelineItem } from "../api/audit-timeline-schemas";
import { getIncidentRecentChanges } from "../api/recent-changes";
import type { RecentChangeItem } from "../api/recent-changes-schemas";
import { getEvidenceWindowPayload, listRcaReports } from "../api/evidence";
import type { EvidenceWindowPayload, RcaReport } from "../api/evidence-schemas";
import type { RcaIssueList } from "../api/schemas";
import { loadRcaIssueItems } from "./rcaIssuesFeed";
import { operationalMessageLabel } from "./statusLabel";
import {
  RCA_PREVIEW_AUDIT,
  RCA_PREVIEW_CORRELATION_ID,
  RCA_PREVIEW_INCIDENT_ID,
  RCA_PREVIEW_ISSUE,
  RCA_PREVIEW_RECENT_CHANGES,
  RCA_PREVIEW_RECOVERY_PLAN,
  RCA_PREVIEW_REMEDIATION_BUNDLE,
  RCA_PREVIEW_REPORT,
  rcaPreviewEvidence,
} from "./rcaPreviewFixtures";

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
  currentSubject: string;
  clusterId: string | null;
  namespace: string | null;
  resourceName: string | null;
  resourceKind: string | null;
  rawSymptom: string | null;
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
  updatedAt: string | null;
}

export interface RcaIssueDetailsFeed {
  status: RcaDetailStatus;
  items: RcaIssueDetailView[];
}

type RcaIssueItem = RcaIssueList["items"][number];
const previewEnabled = import.meta.env.DEV;

export function toRcaIssueDetailView(item: RcaIssueItem): RcaIssueDetailView {
  return {
    correlationId: item.correlation_id,
    incidentId: item.incident_id,
    currentSubject: item.current_subject,
    clusterId: item.cluster_id,
    namespace: item.incident_namespace,
    resourceName: item.incident_resource_name,
    resourceKind: item.incident_resource_kind,
    rawSymptom: item.incident_symptom,
    symptom: item.incident_symptom === null ? null : operationalMessageLabel(item.incident_symptom),
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
    updatedAt: item.updated_at,
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
export function useRcaIssueDetails(clusterIds?: readonly string[], pollMs = 0): RcaIssueDetailsFeed {
  const scopeKey = clusterIds === undefined
    ? null
    : [...new Set(clusterIds.filter((clusterId) => clusterId.trim() !== ""))].sort().join("\u0000");
  const [snapshot, setSnapshot] = useState<{ scopeKey: string | null; feed: RcaIssueDetailsFeed }>({
    scopeKey,
    feed: { status: "loading", items: [] },
  });
  useEffect(() => {
    const controller = new AbortController();
    const scopedClusterIds = scopeKey === null ? undefined : scopeKey === "" ? [] : scopeKey.split("\u0000");
    let timer: number | undefined;
    const load = () => {
      void loadRcaIssueItems(scopedClusterIds, controller.signal)
        .then((items) => {
          if (controller.signal.aborted) return;
          const visibleItems = previewEnabled
            ? [
                RCA_PREVIEW_ISSUE,
                ...items.filter((item) => item.correlation_id !== RCA_PREVIEW_CORRELATION_ID),
              ]
            : items;
          setSnapshot({ scopeKey, feed: { status: "ready", items: visibleItems.map(toRcaIssueDetailView) } });
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted || isAbortError(cause)) return;
          setSnapshot({
            scopeKey,
            feed: previewEnabled
              ? { status: "ready", items: [toRcaIssueDetailView(RCA_PREVIEW_ISSUE)] }
              : { status: "unavailable", items: [] },
          });
        })
        .finally(() => {
          if (!controller.signal.aborted && pollMs > 0) timer = window.setTimeout(load, pollMs);
        });
    };
    load();
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [scopeKey, pollMs]);
  return snapshot.scopeKey === scopeKey
    ? snapshot.feed
    : { status: "loading", items: [] };
}

export type RecoveryPlanStatus = "idle" | "loading" | "ready" | "unavailable";

export interface RecoveryPlanFeed {
  status: RecoveryPlanStatus;
  plan: RecoveryPlan | null;
}

export interface RemediationBundleFeed {
  status: RecoveryPlanStatus;
  bundle: RemediationBundleResponse | null;
}

export type RecoveryAuditStatus = "idle" | "loading" | "ready" | "unavailable";

export interface RecoveryAuditFeed {
  status: RecoveryAuditStatus;
  items: AuditTimelineItem[];
}

export type IncidentRecentChangesStatus = "idle" | "loading" | "ready" | "unavailable";

export interface IncidentRecentChangesFeed {
  status: IncidentRecentChangesStatus;
  items: RecentChangeItem[];
}

export interface RcaReportFeed {
  status: RcaDetailStatus | "idle";
  report: RcaReport | null;
}

export interface EvidenceWindowFeed {
  status: RcaDetailStatus | "idle";
  evidence: EvidenceWindowPayload | null;
}

export function useEvidenceWindowPayload(
  evidenceKey: string | null,
  source: string | null,
  enabled: boolean,
): EvidenceWindowFeed {
  const requestKey = enabled && evidenceKey ? `${evidenceKey}\u0000${source ?? ""}` : null;
  const preview = previewEnabled && evidenceKey ? rcaPreviewEvidence(evidenceKey, source) : null;
  const [snapshot, setSnapshot] = useState<{ requestKey: string | null; feed: EvidenceWindowFeed }>({
    requestKey: null,
    feed: { status: "idle", evidence: null },
  });
  useEffect(() => {
    if (!requestKey || !evidenceKey || preview) return;
    const controller = new AbortController();
    void getEvidenceWindowPayload(evidenceKey, { source: source ?? undefined, signal: controller.signal })
      .then((evidence) => {
        if (controller.signal.aborted) return;
        setSnapshot({ requestKey, feed: { status: "ready", evidence } });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setSnapshot({ requestKey, feed: { status: "unavailable", evidence: null } });
      });
    return () => controller.abort();
  }, [requestKey, evidenceKey, source, preview]);
  if (requestKey === null) return { status: "idle", evidence: null };
  if (preview) return { status: "ready", evidence: preview };
  return snapshot.requestKey === requestKey
    ? snapshot.feed
    : { status: "loading", evidence: null };
}

export function useLatestRcaReport(correlationId: string | null): RcaReportFeed {
  const isPreview = previewEnabled && correlationId === RCA_PREVIEW_CORRELATION_ID;
  const [snapshot, setSnapshot] = useState<{ correlationId: string | null; feed: RcaReportFeed }>({
    correlationId: null,
    feed: { status: "idle", report: null },
  });
  useEffect(() => {
    if (!correlationId || isPreview) return;
    const controller = new AbortController();
    void listRcaReports({ correlationId, limit: 1, signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setSnapshot({ correlationId, feed: { status: "ready", report: response.items[0] ?? null } });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setSnapshot({ correlationId, feed: { status: "unavailable", report: null } });
      });
    return () => controller.abort();
  }, [correlationId, isPreview]);
  if (!correlationId) return { status: "idle", report: null };
  if (isPreview) return { status: "ready", report: RCA_PREVIEW_REPORT };
  return snapshot.correlationId === correlationId
    ? snapshot.feed
    : { status: "loading", report: null };
}

export function useIncidentRecentChanges(incidentId: string | null): IncidentRecentChangesFeed {
  const isPreview = previewEnabled && incidentId === RCA_PREVIEW_INCIDENT_ID;
  const [snapshot, setSnapshot] = useState<{ incidentId: string | null; feed: IncidentRecentChangesFeed }>({
    incidentId: null,
    feed: { status: "idle", items: [] },
  });
  useEffect(() => {
    if (!incidentId || isPreview) return;
    const controller = new AbortController();
    void getIncidentRecentChanges(incidentId, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setSnapshot({ incidentId, feed: { status: "ready", items: response.items } });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setSnapshot({ incidentId, feed: { status: "unavailable", items: [] } });
      });
    return () => controller.abort();
  }, [incidentId, isPreview]);
  if (!incidentId) return { status: "idle", items: [] };
  if (isPreview) return { status: "ready", items: RCA_PREVIEW_RECENT_CHANGES };
  return snapshot.incidentId === incidentId
    ? snapshot.feed
    : { status: "loading", items: [] };
}

/**
 * Loads the recovery candidate plan for one Incident correlation. This is a
 * read-only observation of the server-generated candidates; it never executes a
 * recovery. Without a correlation id the feed stays `idle` (nothing to observe).
 */
export function useRecoveryPlan(correlationId?: string | null): RecoveryPlanFeed {
  const isPreview = previewEnabled && correlationId === RCA_PREVIEW_CORRELATION_ID;
  const [feed, setFeed] = useState<RecoveryPlanFeed>(
    () => ({ status: correlationId ? "loading" : "idle", plan: null }),
  );
  useEffect(() => {
    if (!correlationId || isPreview) return;
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
  }, [correlationId, isPreview]);
  if (isPreview) return { status: "ready", plan: RCA_PREVIEW_RECOVERY_PLAN };
  return feed;
}

export function useRemediationBundle(correlationId?: string | null): RemediationBundleFeed {
  const isPreview = previewEnabled && correlationId === RCA_PREVIEW_CORRELATION_ID;
  const [snapshot, setSnapshot] = useState<{
    correlationId: string | null;
    feed: RemediationBundleFeed;
  }>({
    correlationId: null,
    feed: { status: "idle", bundle: null },
  });
  useEffect(() => {
    if (!correlationId || isPreview) return;
    const controller = new AbortController();
    void getRemediationBundle(correlationId, { signal: controller.signal })
      .then((bundle) => {
        if (controller.signal.aborted) return;
        setSnapshot({ correlationId, feed: { status: "ready", bundle } });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setSnapshot({ correlationId, feed: { status: "unavailable", bundle: null } });
      });
    return () => controller.abort();
  }, [correlationId, isPreview]);
  if (!correlationId) return { status: "idle", bundle: null };
  if (isPreview) return { status: "ready", bundle: RCA_PREVIEW_REMEDIATION_BUNDLE };
  return snapshot.correlationId === correlationId
    ? snapshot.feed
    : { status: "loading", bundle: null };
}

export function useRecoveryAudit(correlationId?: string | null, pollMs = 0): RecoveryAuditFeed {
  const isPreview = previewEnabled && correlationId === RCA_PREVIEW_CORRELATION_ID;
  const [feed, setFeed] = useState<RecoveryAuditFeed>(
    () => ({ status: correlationId ? "loading" : "idle", items: [] }),
  );
  useEffect(() => {
    if (!correlationId || isPreview) return;
    const controller = new AbortController();
    let timer: number | undefined;
    const load = () => {
      void getAuditTimeline(correlationId, { limit: 50, signal: controller.signal })
        .then((response) => {
          if (controller.signal.aborted) return;
          setFeed({ status: "ready", items: response.items });
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted || isAbortError(cause)) return;
          setFeed({ status: "unavailable", items: [] });
        })
        .finally(() => {
          if (!controller.signal.aborted && pollMs > 0) timer = window.setTimeout(load, pollMs);
        });
    };
    load();
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [correlationId, isPreview, pollMs]);
  if (isPreview) return { status: "ready", items: RCA_PREVIEW_AUDIT };
  return feed;
}

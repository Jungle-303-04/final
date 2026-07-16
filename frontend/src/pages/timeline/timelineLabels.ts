import type { MessageKey } from "../../shared/i18n/types";
import type { TimelineCoverage, TimelineSource } from "../../features/timeline/timelineContract";

/** Shared labels keep every timeline surface aligned with the API source enum. */
export const TIMELINE_SOURCE_LABEL: Record<TimelineSource, MessageKey> = {
  inventory: "timeline.source.inventory",
  incident: "timeline.source.incident",
  application_workflow: "timeline.source.applicationWorkflow",
  kubernetes_event: "timeline.source.kubernetesEvent",
  gitops: "timeline.source.gitops",
};

export const TIMELINE_COVERAGE_REASON_LABEL: Record<TimelineCoverage["reason"], MessageKey> = {
  collection_gap: "timeline.coverage.reason.collectionGap",
  retention_boundary: "timeline.coverage.reason.retentionBoundary",
  partial_scope: "timeline.coverage.reason.partialScope",
};

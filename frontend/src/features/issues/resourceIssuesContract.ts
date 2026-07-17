import type { ResourceIdentity } from "../resources/resourcesContract";
import type { IssueSummary } from "./issuesContract";

export interface ResourceIssueOnset {
  firstObservedAt: string;
  source: "timeline_created_at";
  timingKind: null;
  timingAvailability: "unavailable";
  timingReasonCode: "health_transition_evidence_unavailable";
}

export interface ResourceIssue extends IssueSummary {
  onset: ResourceIssueOnset;
}

export interface ResourceIssueScope {
  workspaceId: string;
  clusterId: string;
  namespaces: readonly string[];
  freshness: "live" | "stale" | "partial" | "disconnected";
}

export interface ResourceIssueList {
  scope: ResourceIssueScope;
  coverageAvailability: "available" | "partial" | "unavailable";
  observedAt: string | null;
  reasonCodes: readonly string[];
  items: ResourceIssue[];
  hasMore: boolean;
  limit: number;
}

export interface ResourceIssuesPort {
  loadResourceIssues(
    clusterId: string,
    identity: ResourceIdentity,
    signal?: AbortSignal,
  ): Promise<ResourceIssueList>;
}

import { useEffect, useState } from "react";

import { listApplications } from "../api/applications";
import type { Application } from "../api/applications-schemas";
import { listHelmReleases } from "../api/helm-releases";

// UI-PHASE2-001 §2 "Deploy": typed live adapters for the /deploy surface.
//
// `GET /api/applications` returns an opaque `jsonMap` per Application, so every
// field is read defensively — a missing field renders as an honest gap, never a
// fabricated value. `GET /api/helm/releases` currently reports coverage
// `unavailable` with reason codes; that honest state is surfaced rather than a
// backfilled release table. Both hooks are strictly read-only.

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

// ── defensive jsonMap readers ────────────────────────────────────────────────

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function readObject(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = record[key];
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// ── applications ─────────────────────────────────────────────────────────────

export type DeployFeedStatus = "loading" | "ready" | "unavailable";

export interface ApplicationView {
  id: string;
  name: string;
  environments: string[];
  lifecycleStatus: string | null;
  repositoryRef: string | null;
  defaultBranch: string | null;
  manifestPath: string | null;
  /** Runtime health status, e.g. "unknown" — never coerced to "healthy". */
  healthStatus: string | null;
  /** Delivery/GitOps rollout status, e.g. "pending". */
  deliveryStatus: string | null;
  deliveryAvailability: string | null;
  workflowRunId: string | null;
  deliveryObservedAt: string | null;
}

export interface ApplicationsFeed {
  status: DeployFeedStatus;
  items: ApplicationView[];
}

function toApplicationView(record: Application, index: number): ApplicationView {
  const health = readObject(record, "health");
  const delivery = readObject(record, "delivery");
  const id = readString(record, "id") ?? `app-${index}`;
  return {
    id,
    name: readString(record, "name") ?? id,
    environments: readStringArray(record, "environments"),
    lifecycleStatus: readString(record, "lifecycle_status"),
    repositoryRef: readString(record, "repository_ref"),
    defaultBranch: readString(record, "default_branch"),
    manifestPath: readString(record, "manifest_path"),
    healthStatus: health ? readString(health, "status") : null,
    deliveryStatus: delivery ? readString(delivery, "status") : null,
    deliveryAvailability: delivery ? readString(delivery, "availability") : null,
    workflowRunId: delivery ? readString(delivery, "workflow_run_id") : null,
    deliveryObservedAt: delivery ? readString(delivery, "observed_at") : null,
  };
}

/**
 * Reads the live Application list. An empty list is an honest "관측된
 * 애플리케이션 없음"; a load failure is an honest `unavailable`.
 */
export function useApplications(refreshKey: unknown = null): ApplicationsFeed {
  const [feed, setFeed] = useState<ApplicationsFeed>({ status: "loading", items: [] });
  useEffect(() => {
    const controller = new AbortController();
    void listApplications({ signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setFeed({ status: "ready", items: response.applications.map(toApplicationView) });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setFeed({ status: "unavailable", items: [] });
      });
    return () => controller.abort();
  }, [refreshKey]);
  return feed;
}

// ── helm releases ────────────────────────────────────────────────────────────

export interface HelmReleaseView {
  name: string;
  namespace: string;
  clusterId: string;
  chart: string | null;
  chartVersion: string | null;
  status: string | null;
  revision: number | null;
}

export interface HelmReleasesFeed {
  status: DeployFeedStatus;
  items: HelmReleaseView[];
  coverageAvailability: string | null;
  reasonCodes: string[];
}

/**
 * Reads the live Helm release inventory. When coverage is `unavailable` the
 * hook still reports `ready` with an empty release list and the server reason
 * codes so the surface can render an honest "관측 안 됨" rather than a fake
 * release table.
 */
export function useHelmReleases(): HelmReleasesFeed {
  const [feed, setFeed] = useState<HelmReleasesFeed>({
    status: "loading",
    items: [],
    coverageAvailability: null,
    reasonCodes: [],
  });
  useEffect(() => {
    const controller = new AbortController();
    void listHelmReleases({}, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setFeed({
          status: "ready",
          items: response.releases.map((release) => ({
            name: release.name,
            namespace: release.scope.namespaces[0] ?? release.storage_namespace,
            clusterId: release.scope.cluster_id,
            chart: release.chart,
            chartVersion: release.chart_version,
            status: release.status,
            revision: release.revision,
          })),
          coverageAvailability: response.coverage.availability,
          reasonCodes: [...response.coverage.reason_codes],
        });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setFeed({ status: "unavailable", items: [], coverageAvailability: null, reasonCodes: [] });
      });
    return () => controller.abort();
  }, []);
  return feed;
}

import { useEffect, useState } from "react";

import { listApplicationRuns, listApplications } from "../api/applications";
import type { Application, WorkflowRun } from "../api/applications-schemas";
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

function readObjects(record: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
    : [];
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

// ── actual GitOps workflow evidence ─────────────────────────────────────────

export interface WorkflowStepView {
  name: string;
  status: string | null;
  message: string | null;
  updatedAt: string | null;
  details: Record<string, unknown>;
}

export interface ApplicationRunView {
  applicationId: string;
  applicationName: string;
  repositoryRef: string | null;
  workflowRunId: string;
  status: string | null;
  currentStep: string | null;
  commitSha: string | null;
  clusterId: string | null;
  commandId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  steps: WorkflowStepView[];
  promotionGate: Record<string, unknown> | null;
}

export interface ApplicationRunsFeed {
  status: DeployFeedStatus;
  items: ApplicationRunView[];
}

function toRunView(run: WorkflowRun, application: ApplicationView): ApplicationRunView | null {
  const workflowRunId = readString(run, "workflow_run_id");
  if (workflowRunId === null) return null;
  return {
    applicationId: application.id,
    applicationName: application.name,
    repositoryRef: application.repositoryRef,
    workflowRunId,
    status: readString(run, "status"),
    currentStep: readString(run, "current_step"),
    commitSha: readString(run, "commit_sha"),
    clusterId: readString(run, "cluster_id"),
    commandId: readString(run, "command_id"),
    createdAt: readString(run, "created_at"),
    updatedAt: readString(run, "updated_at"),
    steps: readObjects(run, "steps").map((step) => ({
      name: readString(step, "name") ?? "unknown",
      status: readString(step, "status"),
      message: readString(step, "message"),
      updatedAt: readString(step, "updated_at"),
      details: readObject(step, "details") ?? {},
    })),
    promotionGate: readObject(run, "promotion_gate"),
  };
}

/**
 * Reads server-recorded workflow history for the currently visible
 * Applications. This is deliberately read-only: the demo gate never advances
 * from a timer or a local optimistic state.
 */
export function useApplicationRuns(
  applications: ApplicationView[],
  refreshKey: unknown = null,
): ApplicationRunsFeed {
  const [feed, setFeed] = useState<ApplicationRunsFeed>({ status: "loading", items: [] });
  const applicationKey = applications.map(({ id, workflowRunId }) => `${id}:${workflowRunId ?? ""}`).join("|");
  useEffect(() => {
    const controller = new AbortController();
    if (applications.length === 0) {
      setFeed({ status: "ready", items: [] });
      return () => controller.abort();
    }
    setFeed({ status: "loading", items: [] });
    void Promise.allSettled(applications.map(async (application) => {
      // A single application can accumulate many connect-validation and retry
      // runs before the GitOps recovery flow completes. Read the full bounded
      // server history so preserved failure/recovery evidence is not pushed
      // out of the local demo surface by newer validation-only runs.
      const response = await listApplicationRuns(application.id, { limit: 500, signal: controller.signal });
      return response.runs
        .map((run) => toRunView(run, application))
        .filter((run): run is ApplicationRunView => run !== null);
    })).then((results) => {
      if (controller.signal.aborted) return;
      const fulfilled = results.filter((result): result is PromiseFulfilledResult<ApplicationRunView[]> => result.status === "fulfilled");
      const items = fulfilled.flatMap(({ value }) => value).sort((left, right) =>
        (right.updatedAt ?? right.createdAt ?? "").localeCompare(left.updatedAt ?? left.createdAt ?? ""));
      setFeed({ status: fulfilled.length > 0 ? "ready" : "unavailable", items });
    });
    return () => controller.abort();
    // applicationKey is a stable serialization of the server-owned identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationKey, refreshKey]);
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

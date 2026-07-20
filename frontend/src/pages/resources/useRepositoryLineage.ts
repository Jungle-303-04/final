import { useEffect, useState } from "react";

import type {
  GitOpsPort,
  GitOpsSyncTarget,
  ReleaseApplication,
} from "../../features/gitops/gitOpsContract";
import {
  gitOpsSyncCategory,
  type GitOpsSyncCategory,
} from "../../features/gitops/gitOpsPresentation";

export type RepositoryLineagePort = Pick<GitOpsPort, "listApplications" | "listSyncTargets">;

export interface RepositoryLineage {
  applicationNames: string[];
  key: string;
  repository: string;
  rows: GitOpsSyncTarget[];
  status: GitOpsSyncCategory;
}

export type RepositoryLineageFrame =
  | { phase: "idle" | "loading" | "failed"; data: RepositoryLineage[] }
  | { phase: "ready"; data: RepositoryLineage[] };

export function useRepositoryLineage(
  port: RepositoryLineagePort | undefined,
  clusterId: string | null,
  request: number,
): RepositoryLineageFrame {
  const scope = port === undefined || clusterId === null ? null : `${clusterId}:${request}`;
  const [record, setRecord] = useState<{
    frame: RepositoryLineageFrame;
    scope: string | null;
  }>({ frame: { phase: "idle", data: [] }, scope: null });

  useEffect(() => {
    if (port === undefined || clusterId === null || scope === null) return undefined;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setRecord((current) => ({
          frame: { phase: "loading", data: current.frame.data },
          scope,
        }));
      }
    });
    void Promise.all([
      port.listApplications(controller.signal),
      port.listSyncTargets(controller.signal, { clusters: [clusterId] }),
    ]).then(([applications, rows]) => {
      if (!controller.signal.aborted) {
        setRecord({
          frame: { phase: "ready", data: repositoryLineages(applications, rows, clusterId) },
          scope,
        });
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && !isAbortError(error)) {
        setRecord((current) => ({
          frame: { phase: "failed", data: current.frame.data },
          scope,
        }));
      }
    });
    return () => controller.abort();
  }, [clusterId, port, scope]);

  if (scope === null) return { phase: "idle", data: [] };
  if (record.scope !== scope) return { phase: "loading", data: [] };
  return record.frame;
}

function repositoryLineages(
  applications: ReleaseApplication[],
  rows: GitOpsSyncTarget[],
  clusterId: string,
): RepositoryLineage[] {
  const applicationById = new Map(applications.map((application) => [application.id, application]));
  const scopedApplicationIds = new Set<string>();
  rows.forEach((row) => {
    (row.applicationIds?.length ? row.applicationIds : [row.applicationId])
      .forEach((applicationId) => scopedApplicationIds.add(applicationId));
  });
  const scopedApplications = applications.filter((application) =>
    !application.clusterId.trim() || application.clusterId === clusterId ||
    scopedApplicationIds.has(application.id));
  const buckets = new Map<string, { applications: Set<string>; rows: GitOpsSyncTarget[] }>();

  scopedApplications.forEach((application) => {
    const repository = application.repository.trim();
    if (!repository) return;
    const bucket = buckets.get(repository) ?? { applications: new Set<string>(), rows: [] };
    bucket.applications.add(application.id);
    buckets.set(repository, bucket);
  });
  rows.forEach((row) => {
    const applicationIds = row.applicationIds?.length ? row.applicationIds : [row.applicationId];
    applicationIds.forEach((applicationId) => {
      const application = applicationById.get(applicationId);
      const repository = application?.repository.trim();
      if (!repository) return;
      const bucket = buckets.get(repository) ?? { applications: new Set<string>(), rows: [] };
      bucket.applications.add(applicationId);
      bucket.rows.push({ ...row, applicationId, applicationIds: [applicationId] });
      buckets.set(repository, bucket);
    });
  });

  return [...buckets.entries()].map(([repository, bucket]) => ({
    applicationNames: [...bucket.applications].map((applicationId) =>
      applicationById.get(applicationId)?.name ?? applicationId),
    key: repository,
    repository,
    rows: uniqueSyncRows(bucket.rows),
    status: aggregateRepositoryStatus(bucket.rows),
  })).sort((left, right) => left.repository.localeCompare(right.repository));
}

function uniqueSyncRows(rows: GitOpsSyncTarget[]): GitOpsSyncTarget[] {
  return [...new Map(rows.map((row) => [`${row.id}:${row.applicationId}`, row])).values()];
}

function aggregateRepositoryStatus(rows: GitOpsSyncTarget[]): GitOpsSyncCategory {
  const categories = rows.map((row) => gitOpsSyncCategory(row.syncStatus));
  if (categories.includes("failed")) return "failed";
  if (categories.includes("out-of-sync")) return "out-of-sync";
  if (categories.includes("checking")) return "checking";
  if (categories.length > 0 && categories.every((category) => category === "synced")) return "synced";
  return "unknown";
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

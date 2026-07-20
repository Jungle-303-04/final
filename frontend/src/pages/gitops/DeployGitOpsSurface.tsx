import { useEffect, useMemo, useState } from "react";

import type {
  GitOpsPort,
  GitOpsSyncTarget,
  ReleaseApplication,
} from "../../features/gitops/gitOpsContract";
import { gitOpsSyncCategory } from "../../features/gitops/gitOpsPresentation";
import type { BrowserRefreshPolicyRegistry } from "../../shared/data/browserRefreshPolicyRegistry";
import { EMPTY_RCA_CONTEXT_PORT, type RcaContextPort } from "../../features/issues/rcaContextContract";
import { useI18n } from "../../shared/i18n";
import { acquireSharedRequest } from "../../shared/data/sharedRequest";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { GitOpsSyncTableView } from "./GitOpsSyncTableView";
import { DeployWorkflowWorkspace } from "./DeployWorkflowWorkspace";

export type DeployGitOpsTab = "applications" | "repositories" | "workflows" | "helm";

interface DeployOverview {
  applications: ReleaseApplication[];
  rows: GitOpsSyncTarget[];
  failed: boolean;
  loading: boolean;
}

export function DeployGitOpsSurface({
  port,
  rcaContextPort = EMPTY_RCA_CONTEXT_PORT,
  refreshPolicies,
  tab,
}: {
  port: GitOpsPort;
  rcaContextPort?: RcaContextPort;
  refreshPolicies: BrowserRefreshPolicyRegistry<"gitops_rows" | "gitops_counts">;
  tab: DeployGitOpsTab;
}) {
  const overview = useDeployOverview(port);
  const summaryOnly = tab === "applications" || tab === "helm";

  return (
    <ProductPageFrame className={summaryOnly ? "gap-0 pt-0 pb-0" : "gap-5 pt-0"}>
      <DeploySummary overview={overview} />
      {tab === "repositories" ? (
        overview.loading ? <ProductStateScreen kind="loading" placement="content" /> : (
          <GitOpsSyncTableView
            initialApplications={overview.failed ? undefined : overview.applications}
            initialRows={overview.failed ? undefined : overview.rows}
            port={port}
            rcaContextPort={rcaContextPort}
            refreshPolicies={refreshPolicies}
          />
        )
      ) : null}
      {tab === "workflows" ? (
        <DeployWorkflowWorkspace port={port} refreshPolicies={refreshPolicies} />
      ) : null}
    </ProductPageFrame>
  );
}

function DeploySummary({ overview }: { overview: DeployOverview }) {
  const { t } = useI18n();
  const summary = useMemo(() => summarizeDeploy(overview), [overview]);

  return (
    <div
      aria-busy={overview.loading || undefined}
      aria-label={t("shell.deploy.tabs")}
      className="flex min-w-0 flex-wrap items-center gap-2"
      role="status"
    >
      <DeploySummaryMetric
        label={t("shell.deploy.applications")}
        value={summary?.applications ?? null}
      />
      <DeploySummaryMetric
        label={t("workflows.sync.status.synced")}
        value={summary?.synced ?? null}
      />
      <DeploySummaryMetric
        label={t("workflows.sync.status.outOfSync")}
        tone={summary?.outOfSync ? "warning" : "neutral"}
        value={summary?.outOfSync ?? null}
      />
      <DeploySummaryMetric
        label={t("applications.repository")}
        value={summary?.repositories ?? null}
      />
    </div>
  );
}

function DeploySummaryMetric({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "warning" | "neutral";
  value: number | null;
}) {
  const toneClass = tone === "warning"
    ? "border-tint-warn-border bg-tint-warn-bg text-tint-warn-fg"
    : "border-border bg-card text-muted-foreground";
  return (
    <span className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-label font-semibold ${toneClass}`}>
      <span>{label}</span>
      <strong className="font-mono text-body-strong font-bold text-foreground tabular-nums">
        {value ?? "—"}
      </strong>
    </span>
  );
}

function summarizeDeploy(overview: DeployOverview) {
  if (overview.loading || overview.failed) return null;
  const applicationIds = new Set(overview.applications.map((application) => application.id));
  const statusByApplication = new Map<string, ReturnType<typeof gitOpsSyncCategory>[]>();
  overview.rows.forEach((row) => {
    const rowApplicationIds = row.applicationIds?.length
      ? row.applicationIds
      : [row.applicationId];
    rowApplicationIds.forEach((applicationId) => {
      applicationIds.add(applicationId);
      statusByApplication.set(applicationId, [
        ...(statusByApplication.get(applicationId) ?? []),
        gitOpsSyncCategory(row.syncStatus),
      ]);
    });
  });
  let synced = 0;
  let outOfSync = 0;
  applicationIds.forEach((applicationId) => {
    const statuses = statusByApplication.get(applicationId) ?? [];
    if (statuses.some((status) => status === "out-of-sync" || status === "failed")) {
      outOfSync += 1;
    } else if (statuses.length > 0 && statuses.every((status) => status === "synced")) {
      synced += 1;
    }
  });
  return {
    applications: applicationIds.size,
    synced,
    outOfSync,
    repositories: new Set(
      overview.applications
        .map((application) => application.repository.trim())
        .filter(Boolean),
    ).size,
  };
}

function useDeployOverview(port: GitOpsPort): DeployOverview {
  const [state, setState] = useState<DeployOverview>({
    applications: [],
    rows: [],
    failed: false,
    loading: true,
  });

  useEffect(() => {
    let active = true;
    const applicationsRequest = acquireSharedRequest(
      port,
      "gitops:applications:0",
      (signal) => port.listApplications(signal),
    );
    const syncTargetsRequest = acquireSharedRequest(
      port,
      "gitops:sync-targets:0",
      (signal) => port.listSyncTargets(signal),
    );
    void Promise.all([
      applicationsRequest.promise,
      syncTargetsRequest.promise,
    ]).then(([applications, rows]) => {
      if (active) {
        setState({ applications, rows, failed: false, loading: false });
      }
    }).catch((error: unknown) => {
      if (active && !isAbortError(error)) {
        setState({ applications: [], rows: [], failed: true, loading: false });
      }
    });
    return () => {
      active = false;
      applicationsRequest.release();
      syncTargetsRequest.release();
    };
  }, [port]);

  return state;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

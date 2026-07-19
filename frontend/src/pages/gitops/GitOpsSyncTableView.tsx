import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  GitOpsPort,
  GitOpsSyncTarget,
  GitOpsSyncTargetQuery,
  ReleaseApplication,
  ReleaseCluster,
} from "../../features/gitops/gitOpsContract";
import type {
  RepositoryConnectionInput,
  RepositoryConnectionStage,
} from "../../features/gitops/repositoryConnectionContract";
import type {
  BrowserRefreshPolicy,
  BrowserRefreshPolicyRegistry,
} from "../../shared/data/browserRefreshPolicyRegistry";
import { useServerRefreshScheduler } from "../../shared/data/useServerRefreshScheduler";
import { useI18n } from "../../shared/i18n";
import { EMPTY_RCA_CONTEXT_PORT, type RcaContextPort } from "../../features/issues/rcaContextContract";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { GitOpsRepositoryWorkspace } from "./GitOpsRepositoryTable";
import { RepoConnectDialog } from "./RepoConnectDialog";
import { repositoryGroups } from "./gitOpsRepositoryModel";

type GitOpsRefreshPolicyKey = "gitops_rows" | "gitops_counts";

export function GitOpsSyncTableView({
  initialApplications,
  initialRows,
  port,
  rcaContextPort = EMPTY_RCA_CONTEXT_PORT,
  scopeQuery,
  refreshPolicies,
}: {
  initialApplications?: ReleaseApplication[];
  initialRows?: GitOpsSyncTarget[];
  port: GitOpsPort;
  rcaContextPort?: RcaContextPort;
  scopeQuery?: GitOpsSyncTargetQuery;
  refreshPolicies: BrowserRefreshPolicyRegistry<GitOpsRefreshPolicyKey>;
}) {
  const { t } = useI18n();
  const seeded = initialApplications !== undefined && initialRows !== undefined;
  const [request, setRequest] = useState(0);
  const [applications, setApplications] = useState<ReleaseApplication[]>(initialApplications ?? []);
  const [rows, setRows] = useState<GitOpsSyncTarget[]>(initialRows ?? []);
  const [clusters, setClusters] = useState<ReleaseCluster[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(!seeded);
  const [targetPending, setTargetPending] = useState(false);
  const [error, setError] = useState(false);
  const [policies, setPolicies] = useState<{
    rows: BrowserRefreshPolicy;
    counts: BrowserRefreshPolicy;
  } | null>(null);
  const [successfulRead, setSuccessfulRead] = useState<{ sequence: number; empty: boolean } | null>(
    seeded ? { sequence: 1, empty: initialRows.length === 0 } : null,
  );
  const requestSharedRefresh = useCallback(() => setRequest((value) => value + 1), []);
  const rowsRefresh = useServerRefreshScheduler(requestSharedRefresh);
  const countsRefresh = useServerRefreshScheduler(requestSharedRefresh);
  const groups = useMemo(() => repositoryGroups(applications, rows), [applications, rows]);
  const refresh = useCallback(() => {
    setLoading(true);
    setError(false);
    rowsRefresh.backgroundFailure();
    countsRefresh.requestRefresh();
  }, [countsRefresh, rowsRefresh]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      refreshPolicies.getPolicy("gitops_rows", controller.signal),
      refreshPolicies.getPolicy("gitops_counts", controller.signal),
    ]).then(([rowsPolicy, countsPolicy]) => {
      if (!controller.signal.aborted) setPolicies({ rows: rowsPolicy, counts: countsPolicy });
    }).catch((reason: unknown) => {
      if (!isAbortError(reason)) {
        rowsRefresh.backgroundFailure();
        countsRefresh.backgroundFailure();
      }
    });
    return () => controller.abort();
  }, [countsRefresh, refreshPolicies, rowsRefresh]);

  useEffect(() => {
    if (policies === null || successfulRead === null) return;
    rowsRefresh.acceptSuccess(policies.rows, { coldEmpty: successfulRead.empty });
    countsRefresh.acceptSuccess(policies.counts);
  }, [countsRefresh, policies, rowsRefresh, successfulRead]);

  useEffect(() => {
    if (request === 0 && seeded) return;
    const controller = new AbortController();
    rowsRefresh.backgroundFailure();
    countsRefresh.backgroundFailure();
    void Promise.all([
      port.listApplications(controller.signal),
      port.listSyncTargets(controller.signal, scopeQuery),
    ]).then(([nextApplications, nextRows]) => {
      if (controller.signal.aborted) return;
      setApplications(nextApplications);
      setRows(nextRows);
      setSuccessfulRead((current) => ({
        sequence: (current?.sequence ?? 0) + 1,
        empty: nextRows.length === 0,
      }));
      setError(false);
      setLoading(false);
    }).catch((reason: unknown) => {
      if (isAbortError(reason)) return;
      rowsRefresh.backgroundFailure();
      countsRefresh.backgroundFailure();
      setError(true);
      setLoading(false);
    });
    return () => controller.abort();
  }, [countsRefresh, port, request, rowsRefresh, scopeQuery, seeded]);

  useEffect(() => {
    const controller = new AbortController();
    void port.listClusters(controller.signal).then(setClusters).catch((reason: unknown) => {
      if (!isAbortError(reason)) setClusters([]);
    });
    return () => controller.abort();
  }, [port, request]);

  const createRepositoryTarget = async (
    input: RepositoryConnectionInput,
    onStage: (stage: RepositoryConnectionStage) => void,
  ): Promise<ReleaseApplication | null> => {
    if (targetPending) return null;
    setTargetPending(true);
    setError(false);
    try {
      onStage("probe");
      const probe = await port.probeRepository(input.repository);
      if (!probe.valid || !probe.reachable) return null;

      onStage("branches");
      const branches = await port.listRepositoryBranches(probe.normalizedRepoRef);
      const branch = branches.branches.find((candidate) => candidate.default)
        ?? branches.branches.find((candidate) => candidate.name === branches.defaultBranch)
        ?? branches.branches[0];
      if (!branch) return null;

      onStage("manifests");
      const manifests = await port.listRepositoryManifests(probe.normalizedRepoRef, branch.name);
      const manifest = manifests.candidates[0];
      if (!manifest) return null;

      onStage("validate");
      const validation = await port.validateRepositoryManifest({
        repoRef: probe.normalizedRepoRef,
        branch: branch.name,
        manifestPath: manifest.path,
        sourceType: manifest.sourceType,
      });
      if (!validation.valid) return null;

      onStage("connect");
      const created = await port.connectApplication({
        ...input,
        repository: validation.repoRef,
        branch: validation.branch,
        manifestPath: validation.manifestPath,
        sourceType: validation.sourceType,
      });

      onStage("status");
      const status = await waitForRepositoryReady(port, validation.repoRef);
      if (status !== "ready") return null;
      const [nextApplications, nextRows] = await Promise.all([
        port.listApplications(),
        port.listSyncTargets(undefined, scopeQuery),
      ]);
      if (!nextApplications.some((application) => application.id === created.id) ||
          !nextRows.some((row) => row.applicationId === created.id || row.applicationIds?.includes(created.id))) {
        return null;
      }
      setApplications(nextApplications);
      setRows(nextRows);
      setSuccessfulRead((current) => ({
        sequence: (current?.sequence ?? 0) + 1,
        empty: nextRows.length === 0,
      }));
      return created;
    } catch {
      rowsRefresh.backgroundFailure();
      countsRefresh.backgroundFailure();
      return null;
    } finally {
      setTargetPending(false);
    }
  };

  return (
    <section aria-labelledby="gitops-repositories-title" className="grid min-w-0 gap-3">
      <h2 className="sr-only" id="gitops-repositories-title">{t("workflows.target.repository")}</h2>
      <div className="absolute top-(--product-page-block-start) right-(--product-page-inline) z-10">
        <RepoConnectDialog
          clusters={clusters}
          onCreate={createRepositoryTarget}
          pending={targetPending}
        />
      </div>
      {loading && groups.length === 0 ? (
        <ProductStateScreen kind="loading" placement="content" />
      ) : error && groups.length === 0 ? (
        <ProductStateScreen
          issue={{ code: "server", safeDetail: t("workflows.sync.failure") }}
          kind="error"
          placement="content"
          retry={{ onRetry: refresh, pending: false }}
        />
      ) : (
        <>
          {error ? (
            <p className="rounded-lg border border-tint-warn-border bg-tint-warn-bg px-3 py-2 text-label text-tint-warn-fg">
              {t("workflows.sync.stale")}
            </p>
          ) : null}
          <GitOpsRepositoryWorkspace
            groups={groups}
            onSelect={setSelectedKey}
            port={port}
            rcaContextPort={rcaContextPort}
            selectedKey={selectedKey}
          />
        </>
      )}
    </section>
  );
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

async function waitForRepositoryReady(
  port: GitOpsPort,
  repoRef: string,
): Promise<"ready" | "error"> {
  while (true) {
    const status = await port.getRepositoryConnectionStatus(repoRef);
    if (status.connectionStage === "ready") {
      return status.repositoryStatus === "active" &&
        status.terminal &&
        status.refreshAfterSeconds === null &&
        status.repositoryId !== null
        ? "ready"
        : "error";
    }
    if (status.connectionStage === "error" || status.terminal) return "error";
    if (status.refreshAfterSeconds === null) return "error";
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, status.refreshAfterSeconds! * 1_000);
    });
  }
}

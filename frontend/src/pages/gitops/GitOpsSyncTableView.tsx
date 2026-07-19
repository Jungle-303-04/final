import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type {
  GitOpsPort,
  GitOpsSyncTarget,
  GitOpsSyncTargetQuery,
  ReleaseApplication,
  ReleaseCluster,
  ReleaseTargetInput,
} from "../../features/gitops/gitOpsContract";
import type {
  RepositoryConnectionInput,
  RepositoryConnectionStage,
} from "../../features/gitops/repositoryConnectionContract";
import { useI18n } from "../../shared/i18n";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Button } from "../../shared/ui/primitives/button";
import type {
  BrowserRefreshPolicy,
  BrowserRefreshPolicyRegistry,
} from "../../shared/data/browserRefreshPolicyRegistry";
import { useServerRefreshScheduler } from "../../shared/data/useServerRefreshScheduler";
import { DeploymentTargetDialog } from "./DeploymentTargetDialog";
import { GitOpsSyncTargetsTable } from "./GitOpsSyncTargetsTable";
import { RepoConnectDialog } from "./RepoConnectDialog";

type GitOpsRefreshPolicyKey = "gitops_rows" | "gitops_counts";

export function GitOpsSyncTableView({
  port,
  scopeQuery,
  refreshPolicies,
}: {
  port: GitOpsPort;
  scopeQuery?: GitOpsSyncTargetQuery;
  refreshPolicies: BrowserRefreshPolicyRegistry<GitOpsRefreshPolicyKey>;
}) {
  const { t } = useI18n();
  const [request, setRequest] = useState(0);
  const [rows, setRows] = useState<GitOpsSyncTarget[]>([]);
  const [clusters, setClusters] = useState<ReleaseCluster[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [targetPending, setTargetPending] = useState(false);
  const [error, setError] = useState(false);
  const [policies, setPolicies] = useState<{
    rows: BrowserRefreshPolicy;
    counts: BrowserRefreshPolicy;
  } | null>(null);
  const [successfulRead, setSuccessfulRead] = useState<{ sequence: number; empty: boolean } | null>(null);
  const requestSharedRefresh = useCallback(() => setRequest((value) => value + 1), []);
  const rowsRefresh = useServerRefreshScheduler(requestSharedRefresh);
  const countsRefresh = useServerRefreshScheduler(requestSharedRefresh);
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
    const controller = new AbortController();
    rowsRefresh.backgroundFailure();
    countsRefresh.backgroundFailure();
    void port.listSyncTargets(controller.signal, scopeQuery).then((nextRows) => {
      setRows(nextRows);
      setSuccessfulRead((current) => ({
        sequence: (current?.sequence ?? 0) + 1,
        empty: nextRows.length === 0,
      }));
      setLoading(false);
    }).catch((reason: unknown) => {
      if (isAbortError(reason)) return;
      rowsRefresh.backgroundFailure();
      countsRefresh.backgroundFailure();
      setError(true);
      setLoading(false);
    });
    return () => controller.abort();
  }, [countsRefresh, port, request, rowsRefresh, scopeQuery]);

  useEffect(() => {
    const controller = new AbortController();
    void port.listClusters(controller.signal).then(setClusters).catch((reason: unknown) => {
      if (!isAbortError(reason)) setClusters([]);
    });
    return () => controller.abort();
  }, [port, request]);

  const createTarget = async (
    input: ReleaseTargetInput,
  ): Promise<ReleaseApplication | null> => {
    if (targetPending) return null;
    setTargetPending(true);
    setError(false);
    try {
      const created = await port.connectApplication(input);
      try {
        const nextRows = await port.listSyncTargets(undefined, scopeQuery);
        if (!nextRows.some((row) => row.applicationId === created.id)) return null;
        setRows(nextRows);
        setSuccessfulRead((current) => ({
          sequence: (current?.sequence ?? 0) + 1,
          empty: nextRows.length === 0,
        }));
      } catch {
        rowsRefresh.backgroundFailure();
        countsRefresh.backgroundFailure();
        return null;
      }
      return created;
    } catch {
      return null;
    } finally {
      setTargetPending(false);
    }
  };

  const createRepositoryTarget = async (
    input: RepositoryConnectionInput,
    onStage: (stage: RepositoryConnectionStage) => void,
  ): Promise<ReleaseApplication | null> => {
    if (targetPending) return null;
    setTargetPending(true);
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
      const manifests = await port.listRepositoryManifests(
        probe.normalizedRepoRef,
        branch.name,
      );
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
      const nextRows = await port.listSyncTargets(undefined, scopeQuery);
      if (!nextRows.some((row) => row.applicationId === created.id)) return null;
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

  if (loading && rows.length === 0) {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (error && rows.length === 0) {
    return (
      <ProductStateScreen
        issue={{ code: "server", safeDetail: t("workflows.sync.failure") }}
        kind="error"
        placement="content"
        retry={{ onRetry: refresh, pending: false }}
      />
    );
  }

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{t("workflows.sync.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("workflows.sync.description")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RepoConnectDialog
            clusters={clusters}
            onCreate={createRepositoryTarget}
            pending={targetPending}
          />
          <DeploymentTargetDialog
            clusters={clusters}
            onCreate={createTarget}
            pending={targetPending}
          />
          <Button
            aria-label={t("common.action.refresh")}
            disabled={loading}
            onClick={refresh}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw aria-hidden="true" className={loading ? "motion-safe:animate-spin" : undefined} />
          </Button>
        </div>
      </div>
      {error ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          {t("workflows.sync.stale")}
        </p>
      ) : null}
      <GitOpsSyncTargetsTable
        onSelect={setSelectedId}
        rows={rows}
        selectedId={selectedId}
      />
    </div>
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

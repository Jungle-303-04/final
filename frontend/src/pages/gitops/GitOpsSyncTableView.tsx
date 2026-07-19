import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  GitOpsPort,
  GitOpsSyncTarget,
  GitOpsSyncTargetQuery,
  ReleaseApplication,
  ReleaseCluster,
  ReleaseTargetInput,
} from "../../features/gitops/gitOpsContract";
import { filterGitOpsSyncTargets } from "../../features/gitops/gitOpsPresentation";
import { useI18n } from "../../shared/i18n";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Button } from "../../shared/ui/primitives/button";
import type {
  BrowserRefreshPolicy,
  BrowserRefreshPolicyRegistry,
} from "../../shared/data/browserRefreshPolicyRegistry";
import { useServerRefreshScheduler } from "../../shared/data/useServerRefreshScheduler";
import { DeploymentTargetDialog } from "./DeploymentTargetDialog";
import { GitOpsSyncSearch } from "./GitOpsSyncSearch";
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
  const [query, setQuery] = useState("");
  const [policies, setPolicies] = useState<{
    rows: BrowserRefreshPolicy;
    counts: BrowserRefreshPolicy;
  } | null>(null);
  const [successfulRead, setSuccessfulRead] = useState<{ sequence: number; empty: boolean } | null>(null);
  const visibleRows = useMemo(() => filterGitOpsSyncTargets(rows, query), [query, rows]);
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
    onRegistered?: () => void,
  ): Promise<ReleaseApplication | null> => {
    if (targetPending) return null;
    setTargetPending(true);
    setError(false);
    try {
      const created = await port.connectApplication(input);
      onRegistered?.();
      try {
        const nextRows = await port.listSyncTargets(undefined, scopeQuery);
        setRows(nextRows);
        setSuccessfulRead((current) => ({
          sequence: (current?.sequence ?? 0) + 1,
          empty: nextRows.length === 0,
        }));
      } catch {
        rowsRefresh.backgroundFailure();
        countsRefresh.backgroundFailure();
        setError(true);
        setRows((current) => current.some((row) => row.applicationId === created.id)
          ? current
          : [{
            id: `${created.id}:${input.clusterId}`,
            applicationId: created.id,
            applicationName: created.name,
            clusterId: input.clusterId,
            namespace: input.namespace,
            environment: input.environment,
            syncStatus: null,
            revision: null,
            observedAt: null,
            authority: "registered",
            provider: "internal",
            kind: "GitOpsApplication",
            freshness: "stale",
            partialReasonCodes: ["post_mutation_refresh_failed"],
          }, ...current]);
      }
      return created;
    } catch {
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
            onCreate={createTarget}
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
      {rows.length > 0 ? (
        <GitOpsSyncSearch onChange={setQuery} query={query} />
      ) : null}
      {error ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          {t("workflows.sync.stale")}
        </p>
      ) : null}
      <GitOpsSyncTargetsTable
        onClearQuery={() => setQuery("")}
        onSelect={setSelectedId}
        rows={rows}
        selectedId={selectedId}
        visibleRows={visibleRows}
      />
    </div>
  );
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

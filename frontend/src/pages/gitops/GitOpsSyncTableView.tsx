import { ChevronDown, GitBranch, RefreshCw, Search } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import type {
  GitOpsPort,
  GitOpsSyncTarget,
  ReleaseApplication,
  ReleaseCluster,
  ReleaseTargetInput,
} from "../../features/gitops/gitOpsContract";
import {
  filterGitOpsSyncTargets,
  gitOpsSyncCategory,
  type GitOpsSyncCategory,
} from "../../features/gitops/gitOpsPresentation";
import { useI18n, type TranslationFunction } from "../../shared/i18n";
import { StatusMark, type StatusTone } from "../../shared/ui/StatusMark";
import { Surface } from "../../shared/ui/Surface";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Button } from "../../shared/ui/primitives/button";
import { OverflowIdentity } from "../../shared/ui/OverflowIdentity";
import { DeploymentTargetDialog } from "./DeploymentTargetDialog";
import { GitOpsSyncSearch } from "./GitOpsSyncSearch";
import { GitOpsSyncTargetDetails } from "./GitOpsSyncTargetDetails";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui/primitives/table";

export function GitOpsSyncTableView({ port }: { port: GitOpsPort }) {
  const { formatDate, t } = useI18n();
  const [request, setRequest] = useState(0);
  const [rows, setRows] = useState<GitOpsSyncTarget[]>([]);
  const [clusters, setClusters] = useState<ReleaseCluster[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [targetPending, setTargetPending] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const visibleRows = useMemo(() => filterGitOpsSyncTargets(rows, query), [query, rows]);
  const refresh = useCallback(() => {
    setLoading(true);
    setError(false);
    setRequest((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void port.listSyncTargets(controller.signal).then((nextRows) => {
      setRows(nextRows);
      setLoading(false);
    }).catch((reason: unknown) => {
      if (isAbortError(reason)) return;
      setError(true);
      setLoading(false);
    });
    return () => controller.abort();
  }, [port, request]);

  useEffect(() => {
    const controller = new AbortController();
    void port.listClusters(controller.signal).then(setClusters).catch((reason: unknown) => {
      if (!isAbortError(reason)) setClusters([]);
    });
    return () => controller.abort();
  }, [port, request]);

  const createTarget = async (input: ReleaseTargetInput): Promise<ReleaseApplication | null> => {
    if (targetPending) return null;
    setTargetPending(true);
    try {
      const created = await port.connectApplication(input);
      refresh();
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
      <Surface aria-labelledby="gitops-sync-table-title" className="min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h3 className="font-medium" id="gitops-sync-table-title">{t("workflows.sync.table.title")}</h3>
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("workflows.sync.table.count", { count: visibleRows.length })}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="grid min-h-52 place-items-center p-8 text-center">
            <div className="grid max-w-md justify-items-center gap-2 rounded-xl border border-dashed p-6">
              <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                <GitBranch aria-hidden="true" className="size-5" />
              </span>
              <p className="font-medium">{t("workflows.sync.empty.title")}</p>
              <p className="text-sm text-muted-foreground">{t("workflows.sync.empty.description")}</p>
            </div>
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="grid min-h-52 place-items-center p-8 text-center">
            <div className="grid max-w-md justify-items-center gap-3 rounded-xl border border-dashed p-6">
              <Search aria-hidden="true" className="size-5 text-muted-foreground" />
              <p className="font-medium">{t("workflows.sync.search.empty")}</p>
              <Button onClick={() => setQuery("")} type="button" variant="outline">
                {t("workflows.sync.search.clear")}
              </Button>
            </div>
          </div>
        ) : (
          <Table scrollAreaLabel={t("workflows.sync.table.aria")}>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>{t("workflows.sync.table.application")}</TableHead>
                <TableHead>{t("workflows.sync.table.target")}</TableHead>
                <TableHead>{t("workflows.sync.table.environment")}</TableHead>
                <TableHead>{t("workflows.sync.table.status")}</TableHead>
                <TableHead>{t("workflows.sync.table.revision")}</TableHead>
                <TableHead>{t("workflows.sync.table.observed")}</TableHead>
                <TableHead className="w-16 text-right">
                  <span className="sr-only">{t("common.action.details")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => {
                const status = syncStatus(row.syncStatus, t);
                const selected = row.id === selectedId;
                return (
                  <Fragment key={row.id}>
                    <TableRow data-state={selected ? "selected" : undefined}>
                      <TableCell>
                        <span className="grid min-w-40 gap-0.5">
                          <span className="font-medium">{row.applicationName}</span>
                          <OverflowIdentity className="font-mono text-xs text-muted-foreground" value={row.applicationId} />
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="grid min-w-36 gap-0.5">
                          <span>{row.clusterId ?? t("common.value.unavailable")}</span>
                          <span className="text-xs text-muted-foreground">
                            {row.namespace ?? t("common.value.unavailable")}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>{row.environment ?? t("common.value.unavailable")}</TableCell>
                      <TableCell title={status.raw ?? undefined}>
                        <StatusMark label={status.label} tone={status.tone} />
                      </TableCell>
                      <TableCell className="max-w-48 font-mono text-xs">
                        {row.revision ? (
                          <OverflowIdentity value={row.revision} />
                        ) : t("common.value.unavailable")}
                      </TableCell>
                      <TableCell>
                        {formatObserved(row.observedAt, formatDate, t("common.value.unavailable"))}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          aria-expanded={selected}
                          aria-label={`${selected ? t("common.action.close") : t("common.action.details")}: ${row.applicationName}`}
                          onClick={() => setSelectedId(selected ? null : row.id)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <ChevronDown
                            aria-hidden="true"
                            className={selected ? "rotate-180 transition-transform motion-reduce:transition-none" : "transition-transform motion-reduce:transition-none"}
                          />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {selected ? (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell className="p-0" colSpan={7}>
                          <GitOpsSyncTargetDetails row={row} statusLabel={status.label} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Surface>
    </div>
  );
}

function syncStatus(
  value: string | null,
  t: TranslationFunction,
): { label: string; tone: StatusTone; raw: string | null } {
  const category = gitOpsSyncCategory(value);
  return {
    label: syncCategoryLabel(category, t),
    tone: syncCategoryTone(category),
    raw: value,
  };
}

function syncCategoryLabel(category: GitOpsSyncCategory, t: TranslationFunction): string {
  if (category === "synced") return t("workflows.sync.status.synced");
  if (category === "out-of-sync") return t("workflows.sync.status.outOfSync");
  if (category === "checking") return t("workflows.sync.status.checking");
  if (category === "failed") return t("workflows.sync.status.failed");
  return t("workflows.sync.status.unknown");
}

function syncCategoryTone(category: GitOpsSyncCategory): StatusTone {
  if (category === "synced") return "healthy";
  if (category === "out-of-sync" || category === "checking") return "warning";
  if (category === "failed") return "critical";
  return "unknown";
}

function formatObserved(
  value: string | null,
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string,
  unavailable: string,
): string {
  if (value === null) return unavailable;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? unavailable
    : formatDate(timestamp, { dateStyle: "medium", timeStyle: "short" });
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

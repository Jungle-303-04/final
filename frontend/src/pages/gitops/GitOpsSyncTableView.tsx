import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type {
  GitOpsPort,
  GitOpsSyncTarget,
} from "../../features/gitops/gitOpsContract";
import { useI18n, type TranslationFunction } from "../../shared/i18n";
import { StatusMark, type StatusTone } from "../../shared/ui/StatusMark";
import { Surface } from "../../shared/ui/Surface";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Button } from "../../shared/ui/primitives/button";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
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
      {error ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          {t("workflows.sync.stale")}
        </p>
      ) : null}
      <Surface aria-labelledby="gitops-sync-table-title" className="min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h3 className="font-medium" id="gitops-sync-table-title">{t("workflows.sync.table.title")}</h3>
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("workflows.sync.table.count", { count: rows.length })}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="grid min-h-52 place-items-center p-8 text-center">
            <div>
              <p className="font-medium">{t("workflows.sync.empty.title")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("workflows.sync.empty.description")}</p>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const status = syncStatus(row.syncStatus, t);
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className="grid min-w-40 gap-0.5">
                        <span className="font-medium">{row.applicationName}</span>
                        <span className="font-mono text-xs text-muted-foreground">{row.applicationId}</span>
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
                    <TableCell className="max-w-48 truncate font-mono text-xs" title={row.revision ?? undefined}>
                      {row.revision ?? t("common.value.unavailable")}
                    </TableCell>
                    <TableCell>
                      {formatObserved(row.observedAt, formatDate, t("common.value.unavailable"))}
                    </TableCell>
                  </TableRow>
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
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? "";
  if (["synced", "synchronized", "success", "succeeded"].includes(normalized)) {
    return { label: t("workflows.sync.status.synced"), tone: "healthy", raw: value };
  }
  if (["out_of_sync", "outofsync", "drifted", "diverged"].includes(normalized)) {
    return { label: t("workflows.sync.status.outOfSync"), tone: "warning", raw: value };
  }
  if (["pending", "running", "polling", "progressing"].includes(normalized)) {
    return { label: t("workflows.sync.status.checking"), tone: "warning", raw: value };
  }
  if (["failed", "error", "degraded"].includes(normalized)) {
    return { label: t("workflows.sync.status.failed"), tone: "critical", raw: value };
  }
  return { label: t("workflows.sync.status.unknown"), tone: "unknown", raw: value };
}

function formatObserved(
  value: string | null,
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string,
  unavailable: string,
): string {
  if (value === null) return unavailable;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return unavailable;
  return formatDate(timestamp, { dateStyle: "medium", timeStyle: "short" });
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

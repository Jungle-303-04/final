import { ChevronDown, GitBranch } from "lucide-react";
import { Fragment } from "react";
import { Link } from "react-router-dom";

import type { GitOpsSyncTarget } from "../../features/gitops/gitOpsContract";
import {
  gitOpsSyncCategory,
  type GitOpsSyncCategory,
} from "../../features/gitops/gitOpsPresentation";
import { gitOpsResourceDetailPath } from "../../features/gitops/gitOpsResourceDetailRoute";
import { useI18n, type TranslationFunction } from "../../shared/i18n";
import { OverflowIdentity } from "../../shared/ui/OverflowIdentity";
import { StatusMark, type StatusTone } from "../../shared/ui/StatusMark";
import { Surface } from "../../shared/ui/Surface";
import { Button } from "../../shared/ui/primitives/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui/primitives/table";
import { GitOpsSyncTargetDetails } from "./GitOpsSyncTargetDetails";

export function GitOpsSyncTargetsTable({
  onSelect,
  rows,
  selectedId,
}: {
  onSelect: (id: string | null) => void;
  rows: GitOpsSyncTarget[];
  selectedId: string | null;
}) {
  const { formatDate, t } = useI18n();
  return (
    <Surface aria-labelledby="gitops-sync-table-title" className="min-w-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h3 className="font-medium" id="gitops-sync-table-title">{t("workflows.sync.table.title")}</h3>
        <span className="text-xs tabular-nums text-muted-foreground">
          {t("workflows.sync.table.count", { count: rows.length })}
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
            {rows.map((row) => {
              const status = syncStatus(row.syncStatus, t);
              const selected = row.id === selectedId;
              return (
                <Fragment key={row.id}>
                  <TableRow data-state={selected ? "selected" : undefined}>
                    <TableCell>
                      <span className="grid min-w-40 gap-0.5">
                        {row.resourceLocator ? (
                          <Link
                            className="w-fit font-medium text-primary underline-offset-4 hover:underline"
                            to={gitOpsResourceDetailPath(row.resourceLocator)}
                          >
                            {row.applicationName}
                          </Link>
                        ) : (
                          <span className="font-medium">{row.applicationName}</span>
                        )}
                        <OverflowIdentity className="font-mono text-xs text-muted-foreground" value={row.applicationId} />
                        {row.partialReasonCodes?.length ? (
                          <span className="text-xs text-amber-700 dark:text-amber-300">
                            {row.partialReasonCodes.join(", ")}
                          </span>
                        ) : null}
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
                        onClick={() => onSelect(selected ? null : row.id)}
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

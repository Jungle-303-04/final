import { ChevronDown } from "lucide-react";

import type { GitOpsPort, GitOpsSyncTarget } from "../../features/gitops/gitOpsContract";
import type { RcaContextPort } from "../../features/issues/rcaContextContract";
import { gitOpsSyncCategory, type GitOpsSyncCategory } from "../../features/gitops/gitOpsPresentation";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { StatusPill, type StatusTone } from "../../shared/ui/status";
import { GitOpsApplicationWorkspace } from "./GitOpsApplicationWorkspace";
import type { RepositoryGroup } from "./gitOpsRepositoryModel";

export function GitOpsRepositoryApplications({
  formatDate,
  group,
  onSelect,
  port,
  rcaContextPort,
  selectedApplicationId,
}: {
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  group: RepositoryGroup;
  onSelect: (applicationId: string | null) => void;
  port: GitOpsPort;
  rcaContextPort: RcaContextPort;
  selectedApplicationId: string | null;
}) {
  const { t } = useI18n();
  const applications = group.applicationIds.map((applicationId) => ({
    application: group.applications.find((candidate) => candidate.id === applicationId),
    applicationId,
    rows: group.rows.filter((row) => applicationIdsForRow(row).includes(applicationId)),
  }));
  return (
    <ul className="m-0 grid animate-in list-none divide-y divide-border-subtle p-0 fade-in-0 slide-in-from-top-1 duration-(--motion-soft) ease-(--ease-soft) motion-reduce:animate-none">
      {applications.map(({ application, applicationId, rows }) => {
        const selected = selectedApplicationId === applicationId;
        const primary = rows[0] ?? null;
        const name = application?.name ?? primary?.applicationName ?? applicationId;
        return (
          <li className="grid min-w-0" key={applicationId}>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(6rem,.8fr)_minmax(6rem,.8fr)_minmax(0,.8fr)_auto]">
              <span className="grid min-w-0 gap-0.5">
                <strong className="truncate text-label-2">{name}</strong>
                <span className="truncate font-mono text-caption text-caption-foreground">
                  {targetIdentity(rows, application?.clusterId, t("common.value.unavailable"))}
                </span>
              </span>
              <span className="hidden min-w-0 sm:flex"><TargetStatus category={aggregateStatus(rows)} /></span>
              <span className="hidden min-w-0 sm:flex"><HealthStatus value={aggregateHealth(rows)} /></span>
              <span className="hidden min-w-0 sm:grid">
                <span className="truncate font-mono text-caption-2 text-foreground">
                  {revisionSummary(rows, t("common.value.unavailable"))}
                </span>
                <span className="truncate font-mono text-caption text-caption-foreground">
                  {formatObserved(primary?.observedAt ?? null, formatDate, t("common.value.unavailable"))}
                </span>
              </span>
              <Button
                aria-expanded={selected}
                aria-label={`${selected ? t("common.action.close") : t("common.action.details")}: ${name}`}
                onClick={() => onSelect(selected ? null : applicationId)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ChevronDown
                  aria-hidden="true"
                  className={selected
                    ? "rotate-180 transition-transform duration-(--motion-fade) motion-reduce:transition-none"
                    : "transition-transform duration-(--motion-fade) motion-reduce:transition-none"}
                />
              </Button>
            </div>
            {selected ? (
              <div className="grid min-w-0 border-t border-border-subtle bg-card">
                {rows.length > 1 ? <TargetEvidence formatDate={formatDate} rows={rows} /> : null}
                <GitOpsApplicationWorkspace
                  applicationId={applicationId}
                  port={port}
                  rcaContextPort={rcaContextPort}
                  row={primary}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function applicationIdsForRow(row: GitOpsSyncTarget): readonly string[] {
  return row.applicationIds?.length ? row.applicationIds : [row.applicationId];
}

function TargetEvidence({
  formatDate,
  rows,
}: {
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  rows: GitOpsSyncTarget[];
}) {
  const { t } = useI18n();
  return (
    <ul className="m-0 grid list-none divide-y divide-border-subtle bg-background-subtle px-4 py-1 text-caption">
      {rows.map((row) => (
        <li className="grid min-w-0 gap-2 py-1.5 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center" key={row.id}>
          <span className="truncate font-mono">{[row.clusterId, row.namespace, row.environment].filter(Boolean).join(" / ")}</span>
          <span className="truncate font-mono text-caption-foreground">{row.revision ?? t("common.value.unavailable")}</span>
          <TargetStatus category={gitOpsSyncCategory(row.syncStatus)} />
          <span className="text-caption-foreground">{formatObserved(row.observedAt, formatDate, t("common.value.unavailable"))}</span>
        </li>
      ))}
    </ul>
  );
}

function targetIdentity(rows: GitOpsSyncTarget[], fallbackCluster: string | undefined, unavailable: string): string {
  const primary = rows[0];
  const base = [primary?.clusterId ?? fallbackCluster, primary?.namespace].filter(Boolean).join(" / ") || unavailable;
  return rows.length > 1 ? `${base} +${rows.length - 1}` : base;
}

function revisionSummary(rows: GitOpsSyncTarget[], unavailable: string): string {
  const revisions = [...new Set(rows.map((row) => row.revision).filter((value): value is string => Boolean(value)))];
  if (!revisions.length) return unavailable;
  return revisions.length > 1 ? `${revisions[0]} +${revisions.length - 1}` : revisions[0] as string;
}

function aggregateStatus(rows: GitOpsSyncTarget[]): GitOpsSyncCategory {
  const categories = rows.map((row) => gitOpsSyncCategory(row.syncStatus));
  if (categories.includes("failed")) return "failed";
  if (categories.includes("out-of-sync")) return "out-of-sync";
  if (categories.includes("checking")) return "checking";
  if (categories.length && categories.every((category) => category === "synced")) return "synced";
  return "unknown";
}

function TargetStatus({ category }: { category: GitOpsSyncCategory }) {
  const { t } = useI18n();
  const label = category === "synced" ? t("workflows.sync.status.synced")
    : category === "out-of-sync" ? t("workflows.sync.status.outOfSync")
      : category === "checking" ? t("workflows.sync.status.checking")
        : category === "failed" ? t("workflows.sync.status.failed")
          : t("workflows.sync.status.unknown");
  return <StatusPill label={label} tone={statusTone(category)} />;
}

function HealthStatus({ value }: { value: string | null }) {
  const { t } = useI18n();
  return (
    <StatusPill
      label={value ?? t("common.value.unavailable")}
      tone={healthTone(value)}
    />
  );
}

function statusTone(category: GitOpsSyncCategory): StatusTone {
  if (category === "synced") return "healthy";
  if (category === "out-of-sync" || category === "checking") return "warning";
  if (category === "failed") return "critical";
  return "unknown";
}

function aggregateHealth(rows: GitOpsSyncTarget[]): string | null {
  const values = rows.map((row) => row.health?.trim()).filter((value): value is string => Boolean(value));
  if (!values.length) return null;
  const critical = values.find((value) => healthTone(value) === "critical");
  if (critical) return critical;
  const warning = values.find((value) => healthTone(value) === "warning");
  if (warning) return warning;
  return values[0] ?? null;
}

function healthTone(value: string | null): StatusTone {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? "";
  if (["healthy", "ready", "active", "available"].includes(normalized)) return "healthy";
  if (["degraded", "unhealthy", "failed", "error", "missing"].includes(normalized)) return "critical";
  if (["progressing", "pending", "suspended", "warning"].includes(normalized)) return "warning";
  return "unknown";
}

function formatObserved(
  value: string | null,
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string,
  unavailable: string,
): string {
  if (value === null) return unavailable;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? unavailable : formatDate(timestamp, { dateStyle: "short", timeStyle: "short" });
}

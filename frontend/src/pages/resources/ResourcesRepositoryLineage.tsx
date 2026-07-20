import { GitBranch, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import type { GitOpsSyncCategory } from "../../features/gitops/gitOpsPresentation";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { GitHubBrandIcon } from "../../shared/ui/brand";
import { Button } from "../../shared/ui/primitives/button";
import { StatusPill, type StatusTone } from "../../shared/ui/status";
import type { RepositoryLineage } from "./useRepositoryLineage";

export function RepositoryLineageList({
  focusedKey,
  href,
  lineages,
  onFocus,
  onOpen,
}: {
  focusedKey: string | null;
  href: string;
  lineages: RepositoryLineage[];
  onFocus: (key: string | null) => void;
  onOpen: () => void;
}) {
  const { formatNumber, t } = useI18n();
  return (
    <div className="grid min-w-0 gap-1">
      <ul aria-label={t("resources.connectionPanel.list")} className="grid min-w-0 gap-1">
        {lineages.map((lineage) => {
          const selected = focusedKey === lineage.key;
          const revisions = [...new Set(
            lineage.rows
              .map((row) => row.revision)
              .filter((revision): revision is string => Boolean(revision)),
          )];
          return (
            <li className="min-w-0" key={lineage.key}>
              <button
                aria-label={`${lineage.repository} · ${lineage.applicationNames.length} ${t("shell.deploy.applications")} · ${t("workflows.sync.table.count", { count: formatNumber(lineage.rows.length) })}`}
                aria-expanded={selected}
                aria-pressed={selected}
                className={cn(
                  "grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-[9px] border px-2.5 py-2 text-left outline-none transition-[background-color,border-color,transform] duration-(--motion-quick) ease-(--ease-soft) hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none",
                  selected ? "border-primary/35 bg-primary/8" : "border-transparent",
                )}
                onClick={() => onFocus(selected ? null : lineage.key)}
                onDoubleClick={onOpen}
                title={`${lineage.repository} · ${t("resources.connectionPanel.openRepositories")}`}
                type="button"
              >
                <GitHubBrandIcon className="size-3.5 shrink-0 text-caption-foreground" label={t("shell.brand.github")} />
                <span className="grid min-w-0 gap-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <strong className="min-w-0 flex-1 truncate font-mono text-label-2 font-bold" title={lineage.repository}>
                      {lineage.repository}
                    </strong>
                    <RepositoryLineageStatus status={lineage.status} />
                  </span>
                  <span className="truncate text-caption text-caption-foreground">
                    {formatNumber(lineage.applicationNames.length)} {t("shell.deploy.applications")} · {t("workflows.sync.table.count", { count: formatNumber(lineage.rows.length) })}
                  </span>
                </span>
              </button>
              {selected ? <RepositoryLineageDetails lineage={lineage} revisions={revisions} /> : null}
            </li>
          );
        })}
      </ul>
      <Button className="mt-1 w-full" render={<Link to={href} />} size="sm" variant="outline">
        <GitBranch aria-hidden="true" />
        {t("resources.connectionPanel.openRepositories")}
      </Button>
    </div>
  );
}

function RepositoryLineageDetails({
  lineage,
  revisions,
}: {
  lineage: RepositoryLineage;
  revisions: string[];
}) {
  const { t } = useI18n();
  return (
    <div className="motion-topology-overlay mx-1 grid min-w-0 gap-2 rounded-b-lg border border-t-0 bg-background-subtle px-2.5 py-2 text-caption">
      <p className="truncate font-medium text-foreground" title={lineage.applicationNames.join(" · ")}>
        {lineage.applicationNames.join(" · ")}
      </p>
      {lineage.rows.length > 0 ? (
        <ul className="grid min-w-0 gap-1">
          {lineage.rows.slice(0, 4).map((row) => (
            <li className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2" key={`${row.id}:${row.applicationId}`}>
              <span className="truncate font-mono text-caption-foreground" title={[row.clusterId, row.namespace].filter(Boolean).join(" / ")}>
                {[row.clusterId, row.namespace].filter(Boolean).join(" / ") || t("common.value.unavailable")}
              </span>
              <span className="max-w-16 truncate font-mono text-foreground" title={row.revision ?? undefined}>
                {row.revision?.slice(0, 7) ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {revisions.length > 1 ? (
        <span className="truncate text-caption-foreground">
          {t("resources.connectionPanel.revisions", { count: revisions.length })}
        </span>
      ) : null}
    </div>
  );
}

function RepositoryLineageStatus({ status }: { status: GitOpsSyncCategory }) {
  const { t } = useI18n();
  const label = status === "synced" ? t("workflows.sync.status.synced")
    : status === "out-of-sync" ? t("workflows.sync.status.outOfSync")
      : status === "checking" ? t("workflows.sync.status.checking")
        : status === "failed" ? t("workflows.sync.status.failed")
          : t("workflows.sync.status.unknown");
  const tone: StatusTone = status === "synced" ? "healthy"
    : status === "failed" ? "critical"
      : status === "out-of-sync" || status === "checking" ? "warning" : "unknown";
  return <StatusPill className="max-w-20" label={label} tone={tone} />;
}

export function RepositoryLineageFailure({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-40 place-items-center gap-3 px-3 text-center" role="alert">
      <p className="text-label leading-5 text-muted-foreground">{message}</p>
      <Button onClick={onRetry} size="sm" type="button" variant="outline">
        <RefreshCw aria-hidden="true" />
        {t("common.action.retry")}
      </Button>
    </div>
  );
}

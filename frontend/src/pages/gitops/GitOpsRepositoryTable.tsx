import { ChevronDown, GitBranch } from "lucide-react";
import { Fragment, useState } from "react";

import type { GitOpsPort } from "../../features/gitops/gitOpsContract";
import type { RcaContextPort } from "../../features/issues/rcaContextContract";
import {
  type GitOpsSyncCategory,
} from "../../features/gitops/gitOpsPresentation";
import { useI18n, type TranslationFunction } from "../../shared/i18n";
import { Surface } from "../../shared/ui/Surface";
import { GitHubBrandIcon } from "../../shared/ui/brand";
import { Button } from "../../shared/ui/primitives/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui/primitives/table";
import { StatusPill, type StatusTone } from "../../shared/ui/status";
import type { RepositoryGroup } from "./gitOpsRepositoryModel";
import { GitOpsRepositoryApplications } from "./GitOpsRepositoryApplications";

export function GitOpsRepositoryWorkspace({
  groups,
  onSelect,
  port,
  rcaContextPort,
  selectedKey,
}: {
  groups: RepositoryGroup[];
  onSelect: (key: string | null) => void;
  port: GitOpsPort;
  rcaContextPort: RcaContextPort;
  selectedKey: string | null;
}) {
  const { formatDate, t } = useI18n();
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  if (!groups.length) {
    return (
      <Surface
        aria-label={t("workflows.target.repository")}
        className="grid min-h-48 place-items-center p-8 text-center"
      >
        <div className="grid max-w-md justify-items-center gap-2">
          <span className="grid size-10 place-items-center rounded-full bg-background-subtle text-caption-foreground">
            <GitBranch aria-hidden="true" className="size-5" />
          </span>
          <strong className="text-body-strong font-bold">{t("workflows.sync.empty.title")}</strong>
          <p className="m-0 text-label-2 text-caption-foreground">{t("workflows.sync.empty.description")}</p>
        </div>
      </Surface>
    );
  }
  return (
    <Surface aria-label={t("workflows.target.repository")} className="min-w-0 overflow-hidden">
      <Table className="min-w-[54rem] table-fixed" scrollAreaLabel={t("workflows.target.repository")}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[34%] px-4 text-micro font-semibold tracking-[0.05em] text-caption-foreground">{t("workflows.target.repository")}</TableHead>
            <TableHead className="w-[14%] px-4 text-micro font-semibold tracking-[0.05em] text-caption-foreground">{t("metrics.meta.source")}</TableHead>
            <TableHead className="w-[18%] px-4 text-micro font-semibold tracking-[0.05em] text-caption-foreground">{t("workflows.sync.table.revision")}</TableHead>
            <TableHead className="w-[18%] px-4 text-micro font-semibold tracking-[0.05em] text-caption-foreground">{t("workflows.sync.table.status")}</TableHead>
            <TableHead className="w-[10%] px-4 text-micro font-semibold tracking-[0.05em] text-caption-foreground">{t("workflows.sync.table.application")}</TableHead>
            <TableHead className="w-14"><span className="sr-only">{t("common.action.details")}</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const selected = group.key === selectedKey;
            return (
              <Fragment key={group.key}>
                <TableRow className="animate-in fade-in-0 slide-in-from-bottom-1 duration-(--motion-soft) ease-(--ease-soft) motion-reduce:animate-none" data-state={selected ? "selected" : undefined}>
                  <TableCell className="max-w-96 truncate px-4 py-3 font-mono font-semibold">
                    <span className="flex min-w-0 items-center gap-2">
                      <GitHubBrandIcon
                        className="size-3.5 shrink-0 text-caption-foreground"
                        label={t("shell.brand.github")}
                      />
                      <span className="truncate">{group.repository ?? t("common.value.unavailable")}</span>
                    </span>
                  </TableCell>
                  <TableCell className="truncate px-4 py-3 text-caption-foreground">{providerText(group.providers, t)}</TableCell>
                  <TableCell
                    className="max-w-56 truncate px-4 py-3 font-mono text-caption-2"
                    title={group.revisions.join(" · ") || undefined}
                  >
                    {revisionText(group.revisions, t)}
                  </TableCell>
                  <TableCell className="px-4 py-3"><RepositoryStatus category={group.status} /></TableCell>
                  <TableCell className="px-4 py-3 font-mono font-semibold tabular-nums">{group.applicationIds.length}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      aria-expanded={selected}
                      aria-label={`${selected ? t("common.action.close") : t("common.action.details")}: ${group.repository ?? t("common.value.unavailable")}`}
                      onClick={() => {
                        setSelectedApplicationId(null);
                        onSelect(selected ? null : group.key);
                      }}
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
                  </TableCell>
                </TableRow>
                {selected ? (
                  <TableRow className="bg-background-subtle hover:bg-background-subtle">
                    <TableCell className="p-0" colSpan={6}>
                      <GitOpsRepositoryApplications
                        formatDate={formatDate}
                        group={group}
                        onSelect={setSelectedApplicationId}
                        port={port}
                        rcaContextPort={rcaContextPort}
                        selectedApplicationId={selectedApplicationId}
                      />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </Surface>
  );
}

function RepositoryStatus({ category }: { category: GitOpsSyncCategory }) {
  const { t } = useI18n();
  return <StatusPill label={syncCategoryLabel(category, t)} tone={syncCategoryTone(category)} />;
}

function providerText(providers: RepositoryGroup["providers"], t: TranslationFunction): string {
  if (!providers.length) return t("common.value.unavailable");
  return providers.map((provider) => (
    provider === "argo" ? "Argo CD" : provider === "flux" ? "Flux" : "Kyro"
  )).join(" · ");
}

function revisionText(revisions: string[], t: TranslationFunction): string {
  if (!revisions.length) return t("common.value.unavailable");
  const head = (revisions[0] as string).slice(0, 7);
  if (revisions.length === 1) return head;
  return `${head} +${revisions.length - 1}`;
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

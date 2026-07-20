import { GitBranch } from "lucide-react";
import { Link } from "react-router-dom";

import type { RelationHealthTone } from "../../features/resources/relationTopologyGraphModel";
import type { TranslationFunction } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { Button } from "../../shared/ui/primitives/button";
import { Skeleton } from "../../shared/ui/primitives/skeleton";

export function ConnectionStatusMark({ tone }: { tone: RelationHealthTone }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-[3px]",
        tone === "healthy" && "bg-status-healthy",
        tone === "warning" && "bg-status-warning",
        tone === "critical" && "bg-status-critical",
        tone === "unknown" && "bg-status-unknown",
      )}
    />
  );
}

export function ConnectionPanelSkeleton({ label }: { label: string }) {
  return (
    <div aria-label={label} className="grid gap-2 p-1" role="status">
      {[0, 1, 2, 3].map((index) => <Skeleton className="h-12 w-full rounded-lg" key={index} />)}
    </div>
  );
}

export function ConnectionPanelMessage({ message }: { message: string }) {
  return (
    <p className="grid min-h-40 place-items-center px-3 text-center text-label leading-5 text-muted-foreground" role="status">
      {message}
    </p>
  );
}

export function RepositoryConnectionAction({
  href,
  message,
  openLabel,
}: {
  href: string;
  message: string;
  openLabel: string;
}) {
  return (
    <div className="grid min-h-40 place-items-center gap-3 rounded-lg border border-dashed p-3 text-center">
      <GitBranch aria-hidden="true" className="size-5 text-muted-foreground" />
      <p className="text-label leading-5 text-muted-foreground">{message}</p>
      <Button render={<Link to={href} />} size="sm">
        {openLabel}
      </Button>
    </div>
  );
}

export function connectionCopy(t: TranslationFunction) {
  return {
    clear: t("resources.connectionPanel.clear"),
    configuration: t("resources.connectionPanel.configuration"),
    empty: t("resources.connectionPanel.empty"),
    list: t("resources.connectionPanel.list"),
    loading: t("resources.connectionPanel.loading"),
    openHint: t("resources.connectionPanel.openHint"),
    openRepositories: t("resources.connectionPanel.openRepositories"),
    repositories: t("resources.connectionPanel.repositories"),
    repositoryEmpty: t("resources.connectionPanel.repositoryEmpty"),
    services: t("resources.connectionPanel.services"),
    tabs: t("resources.connectionPanel.tabs"),
    title: t("resources.connectionPanel.title"),
    unavailable: t("resources.connectionPanel.unavailable"),
  };
}

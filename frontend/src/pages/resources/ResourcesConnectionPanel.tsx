import { FileCog, GitBranch, Plug, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  relationNodeHealthTone,
  type RelationHealthTone,
} from "../../features/resources/relationTopologyGraphModel";
import type { RelationTopologyNode } from "../../features/resources/relationTopologyContract";
import { useI18n, type TranslationFunction } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { Surface } from "../../shared/ui/Surface";
import { Button } from "../../shared/ui/primitives/button";
import { ButtonGroup } from "../../shared/ui/primitives/button-group";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import type { RelationTopologyFrame } from "./useRelationTopologyDataFrame";

type ConnectionTab = "services" | "configuration" | "repositories";

const SERVICE_KINDS = new Set(["service", "endpoints", "endpointslice", "ingress"]);
const CONFIGURATION_KINDS = new Set(["configmap", "secret"]);
const REPOSITORY_KINDS = new Set(["application", "applicationset", "appproject"]);

export function ResourcesConnectionPanel({
  focusedNodeId,
  frame,
  onFocus,
  onOpen,
  repositoryHref,
}: {
  focusedNodeId: string | null;
  frame: RelationTopologyFrame;
  onFocus: (node: RelationTopologyNode | null) => void;
  onOpen: (node: RelationTopologyNode) => void;
  repositoryHref: string;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<ConnectionTab>("services");
  const visibleNodes = useMemo(
    () => (frame.phase === "ready" ? frame.data.nodes : [])
      .filter((node) => belongsToTab(node, tab))
      .sort(compareConnectionNodes),
    [frame, tab],
  );
  const copy = connectionCopy(t);

  return (
    <Surface
      aria-labelledby="resources-connection-panel-title"
      className="flex min-h-0 min-w-0 flex-col overflow-hidden"
      data-slot="resources-connection-panel"
    >
      <header className="flex min-w-0 items-center gap-2 px-3 pb-2 pt-3">
        <h2
          className="min-w-0 flex-1 truncate text-body-strong font-bold tracking-[-0.02em]"
          id="resources-connection-panel-title"
        >
          {copy.title}
        </h2>
        {focusedNodeId ? (
          <Button
            aria-label={copy.clear}
            className="shrink-0"
            onClick={() => onFocus(null)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </header>
      <div className="px-2 pb-2">
        <ButtonGroup aria-label={copy.tabs} className="grid w-full grid-cols-3 rounded-lg bg-muted p-0.5">
          {(["services", "configuration", "repositories"] as const).map((candidate) => {
            const Icon = candidate === "services"
              ? Plug
              : candidate === "configuration"
                ? FileCog
                : GitBranch;
            return (
              <Button
                aria-pressed={tab === candidate}
                className="min-w-0 gap-1 px-1.5"
                key={candidate}
                onClick={() => setTab(candidate)}
                size="compact-segment"
                type="button"
                variant={tab === candidate ? "outline" : "ghost"}
              >
                <Icon aria-hidden="true" className="size-3 shrink-0" />
                <span className="truncate">{copy[candidate]}</span>
              </Button>
            );
          })}
        </ButtonGroup>
      </div>
      <div className="min-h-44 min-w-0 flex-1 overflow-y-auto px-2 pb-2 [scrollbar-gutter:stable]">
        {frame.phase === "idle" || frame.phase === "loading" ? (
          <ConnectionPanelSkeleton label={copy.loading} />
        ) : frame.phase === "failed" ? (
          <ConnectionPanelMessage message={copy.unavailable} />
        ) : tab === "repositories" && visibleNodes.length === 0 ? (
          <RepositoryConnectionAction href={repositoryHref} copy={copy} />
        ) : visibleNodes.length === 0 ? (
          <ConnectionPanelMessage message={copy.empty} />
        ) : (
          <ul aria-label={copy.list} className="grid min-w-0 gap-1">
            {visibleNodes.map((node) => (
              <li className="min-w-0" key={node.id}>
                <button
                  aria-label={`${node.name} · ${node.kind} · ${node.status || "—"}`}
                  aria-pressed={focusedNodeId === node.id}
                  className={cn(
                    "grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[9px] border px-2.5 py-2 text-left outline-none transition-[background-color,border-color,transform] duration-(--motion-quick) ease-(--ease-soft) hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none",
                    focusedNodeId === node.id
                      ? "border-primary/35 bg-primary/8"
                      : "border-transparent",
                  )}
                  onClick={() => onFocus(focusedNodeId === node.id ? null : node)}
                  onDoubleClick={() => onOpen(node)}
                  title={`${node.name} · ${copy.openHint}`}
                  type="button"
                >
                  <ConnectionStatusMark tone={relationNodeHealthTone(node.status)} />
                  <span className="grid min-w-0 gap-0.5">
                    <strong className="truncate font-mono text-label-2 font-bold" title={node.name}>
                      {node.name}
                    </strong>
                    <span className="truncate text-caption text-caption-foreground">
                      {[node.identity.namespace, node.kind].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="max-w-20 truncate text-caption font-semibold text-muted-foreground" title={node.status}>
                    {node.status || "—"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {tab === "repositories" && visibleNodes.length > 0 ? (
          <Button
            className="mt-2 w-full"
            render={<Link to={repositoryHref} />}
            size="sm"
            variant="outline"
          >
            <GitBranch aria-hidden="true" />
            {copy.openRepositories}
          </Button>
        ) : null}
      </div>
      <p className="border-t px-3 py-2 text-caption leading-5 text-caption-foreground">
        {copy.openHint}
      </p>
    </Surface>
  );
}

function belongsToTab(node: RelationTopologyNode, tab: ConnectionTab): boolean {
  const kind = node.kind.toLocaleLowerCase().replace(/[^a-z]/gu, "");
  if (tab === "services") return SERVICE_KINDS.has(kind);
  if (tab === "configuration") return CONFIGURATION_KINDS.has(kind);
  return REPOSITORY_KINDS.has(kind);
}

function compareConnectionNodes(left: RelationTopologyNode, right: RelationTopologyNode): number {
  const tonePriority: Record<RelationHealthTone, number> = {
    critical: 0,
    warning: 1,
    unknown: 2,
    healthy: 3,
  };
  return tonePriority[relationNodeHealthTone(left.status)]
    - tonePriority[relationNodeHealthTone(right.status)] ||
    left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

function ConnectionStatusMark({ tone }: { tone: RelationHealthTone }) {
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

function ConnectionPanelSkeleton({ label }: { label: string }) {
  return (
    <div aria-label={label} className="grid gap-2 p-1" role="status">
      {[0, 1, 2, 3].map((index) => <Skeleton className="h-12 w-full rounded-lg" key={index} />)}
    </div>
  );
}

function ConnectionPanelMessage({ message }: { message: string }) {
  return (
    <p className="grid min-h-40 place-items-center px-3 text-center text-label leading-5 text-muted-foreground" role="status">
      {message}
    </p>
  );
}

function RepositoryConnectionAction({
  copy,
  href,
}: {
  copy: ReturnType<typeof connectionCopy>;
  href: string;
}) {
  return (
    <div className="grid min-h-40 place-items-center gap-3 rounded-lg border border-dashed p-3 text-center">
      <GitBranch aria-hidden="true" className="size-5 text-muted-foreground" />
      <p className="text-label leading-5 text-muted-foreground">{copy.repositoryEmpty}</p>
      <Button render={<Link to={href} />} size="sm">
        {copy.openRepositories}
      </Button>
    </div>
  );
}

function connectionCopy(t: TranslationFunction) {
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

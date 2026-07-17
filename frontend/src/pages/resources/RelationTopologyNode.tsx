import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { KeyboardEvent } from "react";

import type {
  RelationHealthTone,
  RelationTopologyGraphNode,
} from "../../features/resources/relationTopologyGraphModel";
import { cn } from "../../shared/lib/cn";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../shared/ui/primitives/tooltip";
import type { RelationGraphNode } from "./relationTopologyGraphTypes";
import { normalizeResourceKind, renderResourceKindIcon } from "./resourcePresentation";

export function RelationTopologyNode({ data }: NodeProps<RelationGraphNode>) {
  return (
    <RelationTopologyNodeCard
      graphNode={data.graphNode}
      onSelect={data.onSelect}
      selected={data.selected}
      withHandles
    />
  );
}

export function RelationTopologyNodeCard({
  graphNode,
  onSelect,
  selected,
  withHandles = false,
}: {
  graphNode: RelationTopologyGraphNode;
  onSelect: (resourceId: string) => void;
  selected: boolean;
  withHandles?: boolean;
}) {
  const { t } = useI18n();
  const { resource, tone } = graphNode;
  const pod = normalizeResourceKind(resource.kind) === "pod";
  const status = resource.status || "—";
  const select = () => onSelect(resource.id);
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    select();
  };

  return (
    <article
      aria-label={`${resource.kind} ${resource.name}, ${status}`}
      aria-pressed={selected}
      className={cn(
        "motion-node-land group/relation-node relative grid w-44 min-w-0 cursor-pointer gap-2 overflow-hidden rounded-xl border bg-card/95 px-3 py-3 text-left shadow-sm outline-none transition-[border-color,box-shadow,transform] duration-(--motion-quick) ease-(--ease-out) hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/40 motion-reduce:transform-none motion-reduce:transition-none",
        toneClassName(tone),
        selected && "border-ring shadow-md ring-2 ring-ring/25",
      )}
      data-health={tone}
      data-morph-id={pod ? `pod:${resource.id}` : undefined}
      data-selected={selected ? "true" : "false"}
      data-slot="relation-topology-node"
      onClick={select}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      {withHandles ? (
        <Handle className="opacity-0" isConnectable={false} position={Position.Left} type="target" />
      ) : null}
      <span aria-hidden="true" className={cn(
        "absolute inset-y-0 left-0 w-0.5",
        toneRailClassName(tone),
      )} />
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg border bg-muted/70 text-muted-foreground",
          tone === "critical" && "border-destructive/25 bg-destructive/10 text-destructive",
          tone === "warning" && "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        )}>
          <RelationKindIcon kind={resource.kind} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
            {resource.kind}
          </p>
          <Tooltip>
            <TooltipTrigger
              render={<span className="block w-full truncate text-left text-sm font-semibold" />}
            >
              {resource.name}
            </TooltipTrigger>
            <TooltipContent className="max-w-sm break-all" side="top">
              {resource.name}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <Badge
          className={cn(
            "min-w-0 max-w-28 truncate",
            tone === "warning" && "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
          )}
          title={status}
          variant={tone === "critical" ? "destructive" : "outline"}
        >
          <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", toneDotClassName(tone))} />
          <span className="truncate">{status}</span>
        </Badge>
        <span className="shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground">
          {t("resources.graph.relations.count", { count: graphNode.degree })}
        </span>
      </div>
      {graphNode.hiddenRelationCount > 0 ? (
        <p className="truncate text-[0.6875rem] text-muted-foreground" title={t(
          "resources.graph.relations.hidden",
          { count: graphNode.hiddenRelationCount },
        )}>
          {t("resources.graph.relations.hidden", { count: graphNode.hiddenRelationCount })}
        </p>
      ) : null}
      {withHandles ? (
        <Handle className="opacity-0" isConnectable={false} position={Position.Right} type="source" />
      ) : null}
    </article>
  );
}

function RelationKindIcon({ kind }: { kind: string }) {
  return renderResourceKindIcon(kind, { "aria-hidden": true, className: "size-4" });
}

function toneClassName(tone: RelationHealthTone): string {
  if (tone === "critical") return "border-destructive/45";
  if (tone === "warning") return "border-amber-500/40";
  if (tone === "healthy") return "border-emerald-500/25";
  return "border-border";
}

function toneRailClassName(tone: RelationHealthTone): string {
  if (tone === "critical") return "bg-destructive";
  if (tone === "warning") return "bg-amber-500";
  if (tone === "healthy") return "bg-emerald-500";
  return "bg-muted-foreground/35";
}

function toneDotClassName(tone: RelationHealthTone): string {
  if (tone === "critical") return "bg-destructive";
  if (tone === "warning") return "bg-amber-500";
  if (tone === "healthy") return "bg-emerald-500";
  return "bg-muted-foreground/45";
}

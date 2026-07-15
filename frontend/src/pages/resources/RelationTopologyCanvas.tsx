import {
  Background,
  MarkerType,
  ReactFlow,
  type Edge,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import { ArrowRight, Link2, Unlink2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  buildRelationTopologyGraphModel,
  type RelationHealthTone,
} from "../../features/resources/relationTopologyGraphModel";
import type { RelationTopologyEdgeType } from "../../features/resources/relationTopologyContract";
import { cn } from "../../shared/lib/cn";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { useProductColorMode } from "../../shared/ui/useProductTheme";
import type { RelationTopologyFrame } from "./useRelationTopologyDataFrame";
import {
  RelationTopologyNode,
  RelationTopologyNodeCard,
} from "./RelationTopologyNode";
import { RelationTopologyEvidenceStatus } from "./RelationTopologyEvidenceStatus";
import type { RelationGraphNode } from "./relationTopologyGraphTypes";
import { useGraphRefit } from "./useGraphRefit";
import { useRelationTopologyLayout } from "./useRelationTopologyLayout";

const nodeTypes: NodeTypes = { "relation-resource": RelationTopologyNode };
const EDGE_TYPES: readonly RelationTopologyEdgeType[] = [
  "owns",
  "runs_on",
  "selects",
  "routes_to",
];

export function RelationTopologyCanvas({
  frame,
  onSelectResource,
  selectedResourceId,
}: {
  frame: RelationTopologyFrame;
  onSelectResource: (resourceId: string) => boolean;
  selectedResourceId: string | null;
}) {
  const { t } = useI18n();
  const colorMode = useProductColorMode();
  const [hiddenKinds, setHiddenKinds] = useState<ReadonlySet<string>>(new Set());
  const [localSelection, setLocalSelection] = useState<string | null>(null);
  const [selectionUnavailable, setSelectionUnavailable] = useState(false);
  const topology = frame.phase === "ready" ? frame.data : null;
  const kinds = useMemo(() => [...new Set(
    (topology?.nodes ?? []).map((node) => node.kind),
  )].sort((left, right) => left.localeCompare(right)), [topology]);
  const kindCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of topology?.nodes ?? []) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
    return counts;
  }, [topology]);
  const model = useMemo(
    () => topology ? buildRelationTopologyGraphModel(topology, hiddenKinds) : null,
    [hiddenKinds, topology],
  );
  const selected = selectedResourceId ?? localSelection;
  const selectResource = useCallback((resourceId: string) => {
    setLocalSelection(resourceId);
    setSelectionUnavailable(!onSelectResource(resourceId));
  }, [onSelectResource]);
  const inputNodes = useMemo<RelationGraphNode[]>(() => (
    model?.connected.map((graphNode) => ({
      id: graphNode.resource.id,
      type: "relation-resource",
      position: { x: 0, y: 0 },
      data: {
        graphNode,
        onSelect: selectResource,
        selected: selected === graphNode.resource.id,
      },
    })) ?? []
  ), [model, selectResource, selected]);
  const edges = useMemo<Edge[]>(() => model?.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: t(edgeLabelKey(edge.type)),
    ariaLabel: t("resources.graph.relations.edgeAria", {
      relation: t(edgeLabelKey(edge.type)),
    }),
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: edgeStroke(edge.tone),
      width: 15,
      height: 15,
    },
    animated: false,
    interactionWidth: 18,
    style: {
      stroke: edgeStroke(edge.tone),
      strokeWidth: edge.tone === "critical" ? 2.25 : 1.6,
      strokeDasharray: edge.tone === "unknown" ? "4 4" : undefined,
    },
    labelStyle: {
      fill: "var(--foreground)",
      fontSize: 10,
      fontWeight: 600,
    },
    labelBgStyle: {
      fill: "var(--card)",
      fillOpacity: 0.94,
      stroke: edgeStroke(edge.tone),
      strokeWidth: 0.5,
    },
    labelBgPadding: [5, 3] as [number, number],
    labelBgBorderRadius: 6,
    type: "smoothstep",
  })) ?? [], [model, t]);
  const nodes = useRelationTopologyLayout(inputNodes, edges);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<RelationGraphNode, Edge>>();
  useGraphRefit({
    fitKey: model?.signature ?? "empty",
    instance: flowInstance,
    nodeCount: nodes.length,
    viewportRef,
  });

  if (frame.phase === "loading" || frame.phase === "idle") {
    return <div className="h-full animate-pulse bg-muted/30 motion-reduce:animate-none" role="status" aria-label={t("resources.graph.relations.loading")} />;
  }
  if (frame.phase === "failed") {
    return <GraphMessage
      title={t("resources.graph.relations.failed.title")}
      description={t("resources.graph.relations.failed.description")}
    />;
  }
  if (topology?.availability === "unavailable") {
    return <GraphMessage title={t("resources.graph.unavailable.title")} description={t("resources.graph.unavailable.description")} />;
  }
  if (topology === null || topology.nodes.length === 0 || model === null) {
    return <GraphMessage
      title={t("resources.graph.relations.empty.title")}
      description={t("resources.graph.relations.empty.description")}
    />;
  }

  const visibleCount = model.connected.length + model.disconnected.length;
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden" data-slot="relation-topology-canvas">
      <div className="shrink-0 border-b bg-background/65 backdrop-blur-sm">
        <div
          aria-label={t("resources.graph.kindFilters")}
          className="scrollbar-thin flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto px-3 py-2"
          role="group"
        >
          <span className="mr-1 flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Link2 aria-hidden="true" className="size-3.5" />
            {t("resources.graph.relations.summary", {
              edges: model.edges.length,
              nodes: visibleCount,
            })}
          </span>
          {kinds.map((kind) => {
            const visible = !hiddenKinds.has(kind);
            return (
              <Button
                aria-label={`${kind} ${visible ? "✓" : ""}`}
                aria-pressed={visible}
                className="shrink-0 gap-1.5 whitespace-nowrap"
                key={kind}
                onClick={() => setHiddenKinds((current) => {
                  const next = new Set(current);
                  if (next.has(kind)) next.delete(kind);
                  else next.add(kind);
                  return next;
                })}
                size="sm"
                type="button"
                variant={visible ? "secondary" : "outline"}
              >
                <span className="max-w-28 truncate" title={kind}>{kind}</span>
                <Badge aria-hidden="true" className="h-4 min-w-4 px-1 text-[0.625rem]" variant="outline">
                  {kindCounts.get(kind) ?? 0}
                </Badge>
                <span aria-hidden="true">{visible ? "✓" : ""}</span>
              </Button>
            );
          })}
        </div>
        {model.edges.length > 0 ? (
          <div
            aria-label={t("resources.graph.relations.legend")}
            className="scrollbar-thin flex min-w-0 flex-nowrap items-center gap-3 overflow-x-auto border-t border-border/50 px-3 py-1.5 text-[0.6875rem] text-muted-foreground"
            role="list"
          >
            {EDGE_TYPES.filter((type) => model.edgeCounts[type] > 0).map((type) => (
              <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap" key={type} role="listitem">
                <span className={cn("h-px w-5", edgeTypeLineClassName(type))} />
                <ArrowRight aria-hidden="true" className="-ml-2 size-3" />
                {t(edgeLabelKey(type))}
                <span className="tabular-nums text-foreground">{model.edgeCounts[type]}</span>
              </span>
            ))}
            <span className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
              <StatusLegend tone="healthy" />
              <StatusLegend tone="warning" />
              <StatusLegend tone="critical" />
              <StatusLegend tone="unknown" />
            </span>
          </div>
        ) : null}
        <RelationTopologyEvidenceStatus frame={frame} />
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden" ref={viewportRef}>
        {nodes.length > 0 && typeof ResizeObserver !== "undefined" ? (
          <ReactFlow
            colorMode={colorMode}
            edges={edges}
            elementsSelectable
            fitView
            fitViewOptions={{ padding: 0.12, minZoom: 0.4 }}
            maxZoom={2}
            minZoom={0.4}
            nodes={nodes}
            nodeTypes={nodeTypes}
            nodesConnectable={false}
            nodesDraggable={false}
            onInit={setFlowInstance}
            panOnScroll={false}
            proOptions={{ hideAttribution: true }}
            zoomOnDoubleClick={false}
            zoomOnScroll
          >
            <Background color="var(--border)" gap={22} size={1} />
          </ReactFlow>
        ) : nodes.length > 0 ? (
          <div className="grid h-full grid-cols-[repeat(auto-fit,minmax(176px,1fr))] content-center gap-4 overflow-auto px-5 py-4">
            {nodes.map((node) => (
              <RelationTopologyNodeCard
                graphNode={node.data.graphNode}
                key={node.id}
                onSelect={selectResource}
                selected={selected === node.id}
              />
            ))}
          </div>
        ) : visibleCount > 0 ? (
          <GraphMessage
            title={t("resources.graph.relations.noVisibleEdges.title")}
            description={t("resources.graph.relations.noVisibleEdges.description")}
          />
        ) : (
          <GraphMessage title={t("resources.graph.kindEmpty.title")} description={t("resources.graph.kindEmpty.description")} />
        )}

        {selectionUnavailable ? (
          <div
            className="pointer-events-none absolute bottom-3 left-1/2 z-20 max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-lg border bg-card/95 px-3 py-2 text-center text-xs text-muted-foreground shadow-sm backdrop-blur"
            role="status"
          >
            {t("resources.graph.relations.selectionUnavailable")}
          </div>
        ) : null}
      </div>

      {model.disconnected.length > 0 ? (
        <section className="shrink-0 border-t bg-muted/20" data-slot="relation-topology-disconnected">
          <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border/50 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <Unlink2 aria-hidden="true" className="size-3.5" />
              </span>
              <div className="min-w-0">
                <h4 className="truncate text-xs font-semibold">{t("resources.graph.relations.disconnected.title")}</h4>
                <p className="truncate text-[0.6875rem] text-muted-foreground">
                  {t("resources.graph.relations.disconnected.description")}
                </p>
              </div>
            </div>
            <Badge className="shrink-0 tabular-nums" variant="outline">
              {model.disconnected.length}
            </Badge>
          </div>
          <div className="scrollbar-thin flex min-w-0 gap-3 overflow-x-auto px-3 py-3">
            {model.disconnected.map((graphNode) => (
              <RelationTopologyNodeCard
                graphNode={graphNode}
                key={graphNode.resource.id}
                onSelect={selectResource}
                selected={selected === graphNode.resource.id}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function GraphMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div className="grid max-w-md gap-1">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function StatusLegend({ tone }: { tone: RelationHealthTone }) {
  const { t } = useI18n();
  return (
    <span className="flex items-center gap-1">
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", edgeToneDotClassName(tone))} />
      {t(`resources.graph.relations.health.${tone}`)}
    </span>
  );
}

function edgeLabelKey(type: RelationTopologyEdgeType) {
  return `resources.graph.relations.edge.${type}` as const;
}

function edgeStroke(tone: RelationHealthTone): string {
  if (tone === "critical") return "var(--destructive)";
  if (tone === "warning") return "var(--color-amber-500)";
  if (tone === "healthy") return "var(--color-emerald-500)";
  return "var(--muted-foreground)";
}

function edgeTypeLineClassName(type: RelationTopologyEdgeType): string {
  if (type === "owns") return "bg-blue-500";
  if (type === "runs_on") return "bg-slate-500";
  if (type === "selects") return "bg-amber-500";
  return "bg-emerald-500";
}

function edgeToneDotClassName(tone: RelationHealthTone): string {
  if (tone === "critical") return "bg-destructive";
  if (tone === "warning") return "bg-amber-500";
  if (tone === "healthy") return "bg-emerald-500";
  return "bg-muted-foreground/45";
}

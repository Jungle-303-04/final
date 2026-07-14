import {
  Background,
  MarkerType,
  ReactFlow,
  type Edge,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useMemo, useRef, useState } from "react";

import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { useProductColorMode } from "../../shared/ui/useProductTheme";
import type { RelationTopologyFrame } from "./useRelationTopologyDataFrame";
import {
  RelationTopologyNode,
  RelationTopologyNodeCard,
} from "./RelationTopologyNode";
import type { RelationGraphNode } from "./relationTopologyGraphTypes";
import { useRelationTopologyLayout } from "./useRelationTopologyLayout";
import { useGraphRefit } from "./useGraphRefit";

const nodeTypes: NodeTypes = { "relation-resource": RelationTopologyNode };

export function RelationTopologyCanvas({ frame }: { frame: RelationTopologyFrame }) {
  const { t } = useI18n();
  const colorMode = useProductColorMode();
  const [hiddenKinds, setHiddenKinds] = useState<ReadonlySet<string>>(new Set());
  const topology = frame.phase === "ready" ? frame.data : null;
  const kinds = useMemo(() => [...new Set(
    (topology?.nodes ?? []).map((node) => node.kind),
  )].sort((left, right) => left.localeCompare(right)), [topology]);
  const visibleResources = useMemo(() => (
    topology?.nodes.filter((node) => !hiddenKinds.has(node.kind)) ?? []
  ), [hiddenKinds, topology]);
  const visibleIds = useMemo(
    () => new Set(visibleResources.map((node) => node.id)),
    [visibleResources],
  );
  const inputNodes = useMemo<RelationGraphNode[]>(() => visibleResources.map((resource) => ({
    id: resource.id,
    type: "relation-resource",
    position: { x: 0, y: 0 },
    data: { resource },
  })), [visibleResources]);
  const edges = useMemo<Edge[]>(() => (topology?.edges ?? []).filter(
    (edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to),
  ).map((edge, index) => ({
    id: `${edge.from}:${edge.type}:${edge.to}:${index}`,
    source: edge.from,
    target: edge.to,
    label: edge.type,
    markerEnd: { type: MarkerType.ArrowClosed },
    animated: false,
    style: { stroke: "var(--muted-foreground)" },
    labelStyle: { fill: "var(--muted-foreground)", fontSize: 10 },
  })), [topology, visibleIds]);
  const nodes = useRelationTopologyLayout(inputNodes, edges);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<RelationGraphNode, Edge>>();
  useGraphRefit({ instance: flowInstance, nodes, viewportRef });

  if (frame.phase === "loading" || frame.phase === "idle") {
    return <div className="h-full animate-pulse bg-muted/30 motion-reduce:animate-none" role="status" aria-label={t("resources.graph.relations.loading")} />;
  }
  if (frame.phase === "failed") {
    return <GraphMessage title={t("resources.graph.failed.title")} description={t("resources.graph.failed.description")} />;
  }
  if (topology === null) {
    return <GraphMessage title={t("resources.graph.empty.title")} description={t("resources.graph.empty.description")} />;
  }
  if (topology.nodes.length === 0) {
    return <GraphMessage title={t("resources.graph.empty.title")} description={t("resources.graph.empty.description")} />;
  }
  return (
    <div className="flex h-full flex-col" data-slot="relation-topology-canvas">
      <div className="flex shrink-0 flex-wrap gap-1.5 border-b bg-background/30 px-3 py-2" aria-label={t("resources.graph.kindFilters")} role="group">
        {kinds.map((kind) => {
          const visible = !hiddenKinds.has(kind);
          return (
            <Button
              aria-pressed={visible}
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
              {kind} {visible ? "✓" : ""}
            </Button>
          );
        })}
      </div>
      <div className="relative min-h-0 flex-1" ref={viewportRef}>
        {nodes.length > 0 && typeof ResizeObserver !== "undefined" ? (
          <ReactFlow
            colorMode={colorMode}
            edges={edges}
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
          <div className="flex h-full flex-wrap content-center gap-4 overflow-auto px-5 py-3">
            {nodes.map((node) => (
              <RelationTopologyNodeCard
                key={node.id}
                resource={node.data.resource}
              />
            ))}
          </div>
        ) : (
          <GraphMessage title={t("resources.graph.kindEmpty.title")} description={t("resources.graph.kindEmpty.description")} />
        )}
      </div>
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

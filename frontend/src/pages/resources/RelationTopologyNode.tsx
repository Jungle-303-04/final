import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, CircleDot, ServerCog, Waypoints } from "lucide-react";

import { Badge } from "../../shared/ui/primitives/badge";
import type { RelationTopologyNode as RelationNode } from "../../features/resources/relationTopologyContract";
import type { RelationGraphNode } from "./relationTopologyGraphTypes";

export function RelationTopologyNode({ data }: NodeProps<RelationGraphNode>) {
  return <RelationTopologyNodeCard resource={data.resource} withHandles />;
}

export function RelationTopologyNodeCard({
  resource,
  withHandles = false,
}: {
  resource: RelationNode;
  withHandles?: boolean;
}) {
  const pod = resource.kind.trim().toLocaleLowerCase() === "pod";
  const status = resource.status || "—";
  const Icon = pod
    ? Box
    : resource.kind.toLocaleLowerCase().includes("service")
      ? Waypoints
      : resource.kind.toLocaleLowerCase().includes("node")
        ? ServerCog
        : CircleDot;
  return (
    <article
      aria-label={`${resource.kind} ${resource.name}, ${status}`}
      className="motion-node-land grid min-w-44 gap-2 rounded-xl border bg-card/95 px-3 py-3 shadow-sm"
      data-morph-id={pod ? `pod:${resource.id}` : undefined}
      data-slot="relation-topology-node"
    >
      {withHandles ? (
        <Handle className="opacity-0" isConnectable={false} position={Position.Left} type="target" />
      ) : null}
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-3.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{resource.kind}</p>
          <h4 className="truncate text-sm font-medium" title={resource.name}>{resource.name}</h4>
        </div>
      </div>
      <Badge className="w-fit max-w-36 truncate" title={status} variant="outline">
        {status}
      </Badge>
      {withHandles ? (
        <Handle className="opacity-0" isConnectable={false} position={Position.Right} type="source" />
      ) : null}
    </article>
  );
}

import {
  Handle,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { Server, ShipWheel } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../shared/ui/primitives/tooltip";
import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import { TopologyPodHex } from "./ResourcesInfraMapTopologyPodHex";
import type { InfraMapPod } from "./resourcesInfraMapModel";
import {
  HANDLE_POSITIONS,
  handleId,
  type InfraTopologyNode,
} from "./resourcesInfraMapTopologyFlowGraph";
import type {
  InfraMapTopologyCluster,
  InfraMapTopologyNode,
  InfraMapTopologyPodGroup,
} from "./resourcesInfraMapTopologyModel";
import {
  InfraMapTopologyClusterDetails,
  InfraMapTopologyNodeDetails,
} from "./ResourcesInfraMapTopologyHoverCard";

export const infraMapTopologyNodeTypes: NodeTypes = {
  "infra-map-cluster": ClusterGraphNode,
  "infra-map-node": ServerGraphNode,
  "infra-map-pod": PodGraphNode,
};

export function ResourcesInfraMapTopologyStaticFallback({
  cluster,
  metricMode,
  onOpenPod,
}: {
  cluster: InfraMapTopologyCluster;
  metricMode: InfraMapMetricMode;
  onOpenPod: (pod: InfraMapPod) => void;
}) {
  return (
    <div className="grid h-full overflow-auto p-4" data-slot="infra-map-topology-static-fallback">
      <div className="grid min-w-[36rem] justify-items-center gap-6">
        <ClusterStaticCard cluster={cluster} />
        <div className="grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
          {cluster.nodes.map((node) => (
            <div className="grid justify-items-center gap-3" key={node.id}>
              <ServerStaticCard node={node} />
              {node.groups.map((group) => (
                <PodGroupStaticFallback
                  group={group}
                  key={group.key}
                  metricMode={metricMode}
                  onOpenPod={onOpenPod}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InvisibleHandles({
  source,
  target,
}: {
  source?: boolean;
  target?: boolean;
}) {
  return (
    <>
      {source
        ? HANDLE_POSITIONS.map((position) => (
            <Handle
              className="opacity-0"
              id={handleId("source", position)}
              isConnectable={false}
              key={`source-${position}`}
              position={position}
              type="source"
            />
          ))
        : null}
      {target
        ? HANDLE_POSITIONS.map((position) => (
            <Handle
              className="opacity-0"
              id={handleId("target", position)}
              isConnectable={false}
              key={`target-${position}`}
              position={position}
              type="target"
            />
          ))
        : null}
    </>
  );
}

function ClusterGraphNode({
  data,
}: NodeProps<Extract<InfraTopologyNode, { type: "infra-map-cluster" }>>) {
  return (
    <>
      <InvisibleHandles source />
      <ClusterStaticCard cluster={data.cluster} showTooltip={false} />
    </>
  );
}

function ClusterStaticCard({
  cluster,
  showTooltip = true,
}: {
  cluster: InfraMapTopologyCluster;
  showTooltip?: boolean;
}) {
  const trigger = (
    <article
      aria-label={cluster.name}
      className="grid size-[4.5rem] place-items-center rounded-full border border-blue-400/45 bg-blue-500/10 text-blue-500 shadow-sm shadow-blue-500/10 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-blue-400/70 hover:shadow-blue-500/20 dark:border-blue-300/35 dark:bg-blue-400/15 dark:text-blue-300 dark:shadow-blue-900/20 motion-reduce:transform-none motion-reduce:transition-none"
      data-slot="infra-map-topology-cluster-node"
    >
      <ShipWheel aria-hidden="true" className="size-10" />
    </article>
  );
  if (!showTooltip) return trigger;
  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent
        className="w-64 max-w-[calc(100vw-1rem)] p-0"
        role="tooltip"
        side="top"
      >
        <InfraMapTopologyClusterDetails cluster={cluster} />
      </TooltipContent>
    </Tooltip>
  );
}

function ServerGraphNode({
  data,
}: NodeProps<Extract<InfraTopologyNode, { type: "infra-map-node" }>>) {
  return (
    <>
      <InvisibleHandles source target />
      <ServerStaticCard node={data.node} showTooltip={false} />
    </>
  );
}

function ServerStaticCard({
  node,
  showTooltip = true,
}: {
  node: InfraMapTopologyNode;
  showTooltip?: boolean;
}) {
  const trigger = (
    <article
      aria-label={node.name}
      className="grid size-16 place-items-center rounded-2xl border border-foreground/30 bg-card/95 text-foreground shadow-md shadow-black/10 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-foreground/55 hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none"
      data-slot="infra-map-topology-server-node"
    >
      <Server aria-hidden="true" className="size-8" />
    </article>
  );
  if (!showTooltip) return trigger;
  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent
        className="w-64 max-w-[calc(100vw-1rem)] p-0"
        role="tooltip"
        side="top"
      >
        <InfraMapTopologyNodeDetails node={node} />
      </TooltipContent>
    </Tooltip>
  );
}

function PodGraphNode({
  data,
}: NodeProps<Extract<InfraTopologyNode, { type: "infra-map-pod" }>>) {
  return (
    <>
      <InvisibleHandles target />
      <div
        data-group-evidence={data.group.evidence}
        data-group-kind={data.group.kind ?? undefined}
        data-pod-group-key={data.group.key}
        data-slot="infra-map-topology-pod-node"
      >
        <TopologyPodHex
          metricMode={data.metricMode}
          onOpenPod={data.onOpenPod}
          pod={data.pod}
          showTooltip={false}
          size={data.size}
        />
      </div>
    </>
  );
}

function PodGroupStaticFallback({
  group,
  metricMode,
  onOpenPod,
}: {
  group: InfraMapTopologyPodGroup;
  metricMode: InfraMapMetricMode;
  onOpenPod: (pod: InfraMapPod) => void;
}) {
  return (
    <div
      aria-label={group.label}
      className="flex flex-wrap justify-center gap-0.5"
      data-group-evidence={group.evidence}
      data-group-kind={group.kind ?? undefined}
      data-pod-group-key={group.key}
      data-slot="infra-map-topology-pod-static-group"
    >
      {group.pods.map((pod) => (
        <TopologyPodHex
          key={pod.id}
          metricMode={metricMode}
          onOpenPod={onOpenPod}
          pod={pod}
        />
      ))}
    </div>
  );
}

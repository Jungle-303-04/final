import { useI18n } from "../../shared/i18n";
import {
  InfraMapHoverCard,
  InfraMapTooltipHeader,
  InfraMapTooltipRow,
  type InfraMapHoverFrame,
} from "./InfraMapHoverCard";
import { PodEvidenceTooltipPanel } from "./PodEvidenceTooltipContent";
import { ratioSplitText } from "./ResourcesInfraMapMetrics";
import { infraMapPodMetricRatio } from "./resourcesInfraMapPodOrdering";
import type { InfraTopologyNode } from "./resourcesInfraMapTopologyFlowGraph";
import type {
  InfraMapTopologyCluster,
  InfraMapTopologyNode,
} from "./resourcesInfraMapTopologyModel";

export type HoveredTopologyNode = InfraMapHoverFrame & {
  node: InfraTopologyNode;
};

export function ResourcesInfraMapTopologyHoverCard({
  hover,
}: {
  hover: HoveredTopologyNode;
}) {
  return (
    <InfraMapHoverCard
      dataSlot="infra-map-topology-hover-card"
      frame={hover}
    >
      {hover.node.type === "infra-map-cluster" ? (
        <ClusterHoverContent cluster={hover.node.data.cluster} />
      ) : hover.node.type === "infra-map-node" ? (
        <ServerHoverContent node={hover.node.data.node} />
      ) : (
        <PodHoverContent node={hover.node} />
      )}
    </InfraMapHoverCard>
  );
}

export function InfraMapTopologyClusterDetails({
  cluster,
}: {
  cluster: InfraMapTopologyCluster;
}) {
  const { formatNumber, t } = useI18n();
  return (
    <>
      <InfraMapTooltipHeader
        eyebrow={t("resources.infraMap.topology.cluster")}
        title={cluster.name}
      />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 py-2.5 text-[0.6875rem]">
        <InfraMapTooltipRow
          label={t("resources.infraMap.nodeKind")}
          value={formatNumber(cluster.nodeCount)}
        />
        <InfraMapTooltipRow
          label={t("resources.infraMap.metric.pods")}
          value={formatNumber(cluster.podCount)}
        />
        <InfraMapTooltipRow
          label={t("status.tone.warning")}
          value={formatNumber(cluster.warningCount)}
        />
        <InfraMapTooltipRow
          label={t("status.tone.critical")}
          value={formatNumber(cluster.criticalCount)}
        />
      </dl>
    </>
  );
}

export function InfraMapTopologyNodeDetails({
  node,
}: {
  node: InfraMapTopologyNode;
}) {
  const { formatNumber, t } = useI18n();
  const nodeName = node.unassigned ? t("resources.infraMap.nodeUnassigned") : node.name;
  const cpuText = node.cpuRatio === null
    ? t("common.value.unavailable")
    : ratioSplitText(node.cpuRatio, formatNumber);
  const memoryText = node.memoryRatio === null
    ? t("common.value.unavailable")
    : ratioSplitText(node.memoryRatio, formatNumber);
  const podText = node.podCapacity === null
    ? formatNumber(node.podCount)
    : t("resources.infraMap.podCapacityValue", {
        capacity: formatNumber(node.podCapacity),
        count: formatNumber(node.podCount),
      });
  return (
    <>
      <InfraMapTooltipHeader eyebrow={t("resources.infraMap.nodeKind")} title={nodeName} />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 py-2.5 text-[0.6875rem]">
        <InfraMapTooltipRow
          label={t("resources.table.status")}
          value={node.ready === null
            ? t("common.state.unknown")
            : node.ready
              ? t("resources.infraMap.nodeReady")
              : t("resources.infraMap.nodeNotReady")}
        />
        <InfraMapTooltipRow label={t("resources.infraMap.metric.pods")} value={podText} />
        <InfraMapTooltipRow label={t("resources.infraMap.metric.cpu")} value={cpuText} />
        <InfraMapTooltipRow label={t("resources.infraMap.metric.memory")} value={memoryText} />
      </dl>
    </>
  );
}

function ClusterHoverContent({ cluster }: { cluster: InfraMapTopologyCluster }) {
  return <InfraMapTopologyClusterDetails cluster={cluster} />;
}

function ServerHoverContent({ node }: { node: InfraMapTopologyNode }) {
  return <InfraMapTopologyNodeDetails node={node} />;
}

function PodHoverContent({
  node,
}: {
  node: Extract<InfraTopologyNode, { type: "infra-map-pod" }>;
}) {
  const { formatNumber } = useI18n();
  const ratio = infraMapPodMetricRatio(node.data.pod, node.data.metricMode);
  return (
    <PodEvidenceTooltipPanel
      pod={{
        cpuMillicores: node.data.pod.cpu.value,
        cpuRequestMillicores: node.data.pod.cpu.request,
        memoryMebibytes: node.data.pod.memory.value,
        memoryRequestMebibytes: node.data.pod.memory.request,
        name: node.data.pod.name,
        namespace: node.data.pod.namespace,
        phase: node.data.pod.phase,
        restartCount: node.data.pod.restartCount,
        usagePercent: node.data.pod.usagePercent,
      }}
      usageText={ratio === null
        ? null
        : formatNumber(ratio, { maximumFractionDigits: 1, style: "percent" })}
    />
  );
}

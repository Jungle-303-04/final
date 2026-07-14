import type {
  ResourceDetail,
  ResourceHealthTone,
  ResourceSummary,
} from "../../features/resources/resourcesContract";

const DEFAULT_MAX_PODS_PER_NODE = 5;

export interface InfraMapPodMetric {
  value: number | null;
  scale: number | null;
}

export interface InfraMapPod {
  id: string;
  name: string;
  namespace: string | null;
  status: string;
  health: ResourceHealthTone;
  cpu: InfraMapPodMetric;
  memory: InfraMapPodMetric;
  selected: boolean;
}

export interface InfraMapNode {
  id: string;
  name: string;
  observed: boolean;
  ready: boolean | null;
  health: ResourceHealthTone;
  cpuRatio: number | null;
  memoryRatio: number | null;
  cpuMillicores: number | null;
  memoryMebibytes: number | null;
  podCapacity: number | null;
  assignedPodCount: number;
  visiblePods: InfraMapPod[];
  hiddenPodCount: number;
}

export interface InfraMapModel {
  nodes: InfraMapNode[];
  selection: {
    active: boolean;
    label: string | null;
    matchedPodCount: number;
  };
}

export interface BuildInfraMapModelInput {
  detail: ResourceDetail | null;
  maxPodsPerNode?: number;
  nodes: ResourceSummary[];
  pods: ResourceSummary[];
}

interface OwnerTarget {
  kind: string;
  name: string;
  namespace: string | null;
}

export function buildInfraMapModel({
  detail,
  maxPodsPerNode = DEFAULT_MAX_PODS_PER_NODE,
  nodes,
  pods,
}: BuildInfraMapModelInput): InfraMapModel {
  const selectedResource = detail?.resource ?? null;
  const selectedPodKeys = detail === null ? new Set<string>() : podKeysFromDetail(detail);
  const ownerTargets = detail === null ? [] : ownerTargetsFromDetail(detail);
  const selectionActive = selectedResource !== null;
  const nodeRecords = new Map<string, ResourceSummary | null>();
  for (const node of nodes) nodeRecords.set(node.name, node);
  for (const pod of pods) {
    const nodeName = podNodeName(pod);
    if (nodeName !== null && !nodeRecords.has(nodeName)) nodeRecords.set(nodeName, null);
  }

  const podsByNode = new Map<string, InfraMapPod[]>();
  for (const pod of pods) {
    const nodeName = podNodeName(pod);
    if (nodeName === null) continue;
    const node = nodeRecords.get(nodeName) ?? null;
    const nodeFacts = node?.facts.type === "node" ? node.facts : null;
    const selected = selectionActive && (
      selectedPodKeys.has(resourceKey(pod)) ||
      selectedPodKeys.has(resourceIdentityKey(pod)) ||
      matchesSelectedNode(pod, selectedResource) ||
      matchesAnyOwnerTarget(pod, ownerTargets)
    );
    if (selectionActive && !selected) continue;
    const item: InfraMapPod = {
      id: pod.id,
      name: pod.name,
      namespace: pod.namespace,
      status: pod.status,
      health: pod.health,
      cpu: metricForPod(pod, "cpu", nodeFacts),
      memory: metricForPod(pod, "memory", nodeFacts),
      selected,
    };
    const group = podsByNode.get(nodeName) ?? [];
    group.push(item);
    podsByNode.set(nodeName, group);
  }

  const result = [...nodeRecords.entries()]
    .map(([name, node]) => {
      const groupedPods = podsByNode.get(name) ?? [];
      const sortedPods = groupedPods.sort(comparePodsByWeight);
      const nodeFacts = node?.facts.type === "node" ? node.facts : null;
      const assignedPodCount = pods.filter((pod) => podNodeName(pod) === name).length;
      return {
        id: node?.id ?? `unobserved-node:${name}`,
        name,
        observed: node !== null,
        ready: nodeFacts?.ready ?? null,
        health: node?.health ?? "unknown",
        cpuRatio: nodeFacts?.cpuRatio ?? null,
        memoryRatio: nodeFacts?.memoryRatio ?? null,
        cpuMillicores: nodeFacts?.cpuMillicores ?? null,
        memoryMebibytes: nodeFacts?.memoryMebibytes ?? null,
        podCapacity: nodeFacts?.podCapacity ?? null,
        assignedPodCount,
        visiblePods: sortedPods.slice(0, maxPodsPerNode),
        hiddenPodCount: Math.max(0, sortedPods.length - maxPodsPerNode),
      } satisfies InfraMapNode;
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    nodes: result,
    selection: {
      active: selectionActive,
      label: selectedResource ? selectedResource.name : null,
      matchedPodCount: [...podsByNode.values()].reduce((sum, group) => sum + group.length, 0),
    },
  };
}

function podKeysFromDetail(detail: ResourceDetail): Set<string> {
  const keys = new Set<string>();
  if (detail.resource.resourceType === "pod") {
    keys.add(resourceKey(detail.resource));
    keys.add(resourceIdentityKey(detail.resource));
  }
  for (const group of detail.related) {
    for (const item of group.items) {
      if (item.resourceType !== "pod") continue;
      keys.add(resourceKey(item));
      keys.add(resourceIdentityKey(item));
    }
  }
  return keys;
}

function ownerTargetsFromDetail(detail: ResourceDetail): OwnerTarget[] {
  return [
    ownerTarget(detail.resource),
    ...detail.related.flatMap((group) => group.items.map(ownerTarget)),
  ].filter((target): target is OwnerTarget => target !== null);
}

function ownerTarget(resource: ResourceSummary): OwnerTarget | null {
  if (resource.resourceType === "pod" || resource.resourceType === "event") return null;
  return {
    kind: resource.kind,
    name: resource.name,
    namespace: resource.namespace,
  };
}

function resourceKey(resource: ResourceSummary): string {
  return resource.uid ?? resourceIdentityKey(resource);
}

function resourceIdentityKey(resource: ResourceSummary): string {
  return [
    resource.clusterId,
    resource.resourceType,
    resource.kind,
    resource.namespace ?? "",
    resource.name,
  ].join(":");
}

function matchesSelectedNode(
  pod: ResourceSummary,
  selectedResource: ResourceSummary | null,
): boolean {
  return selectedResource?.resourceType === "node" &&
    pod.facts.type === "pod" &&
    pod.facts.nodeName !== null &&
    sameText(pod.facts.nodeName, selectedResource.name);
}

function matchesAnyOwnerTarget(
  pod: ResourceSummary,
  targets: OwnerTarget[],
): boolean {
  if (targets.length === 0 || pod.facts.type !== "pod" || pod.facts.owner === null) {
    return false;
  }
  const owner = pod.facts.owner;
  return targets.some((target) =>
    (target.namespace === null || target.namespace === pod.namespace) &&
    sameText(owner.kind, target.kind) &&
    sameText(owner.name, target.name));
}

function sameText(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}

function podNodeName(pod: ResourceSummary): string | null {
  return pod.facts.type === "pod" ? pod.facts.nodeName : null;
}

function metricForPod(
  pod: ResourceSummary,
  metric: "cpu" | "memory",
  nodeFacts: Extract<ResourceSummary["facts"], { type: "node" }> | null,
): InfraMapPodMetric {
  const value = metricValue(pod, metric);
  const nodeCapacity = nodeCapacityForMetric(nodeFacts, metric);
  return {
    value,
    scale: value === null || nodeCapacity === null || nodeCapacity <= 0
      ? null
      : value / nodeCapacity,
  };
}

function nodeCapacityForMetric(
  nodeFacts: Extract<ResourceSummary["facts"], { type: "node" }> | null,
  metric: "cpu" | "memory",
): number | null {
  if (nodeFacts === null) return null;
  const ratio = metric === "cpu" ? nodeFacts.cpuRatio : nodeFacts.memoryRatio;
  const used = metric === "cpu" ? nodeFacts.cpuMillicores : nodeFacts.memoryMebibytes;
  if (ratio === null || used === null || ratio <= 0 || used <= 0) return null;
  return used / ratio;
}

function metricValue(pod: ResourceSummary, metric: "cpu" | "memory"): number | null {
  if (pod.facts.type !== "pod") return null;
  return metric === "cpu" ? pod.facts.cpuMillicores : pod.facts.memoryMebibytes;
}

function comparePodsByWeight(left: InfraMapPod, right: InfraMapPod): number {
  return podWeight(right) - podWeight(left) || left.name.localeCompare(right.name);
}

function podWeight(pod: InfraMapPod): number {
  return Math.max(metricWeight(pod.cpu), metricWeight(pod.memory));
}

function metricWeight(metric: InfraMapPodMetric): number {
  return metric.scale ?? metric.value ?? 0;
}

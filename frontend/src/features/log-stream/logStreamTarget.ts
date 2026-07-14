import type {
  ResourceDetail,
  ResourceSummary,
} from "../resources/resourcesContract";
import type { LogStreamTarget } from "./logStreamContract";

const WORKLOAD_KINDS = {
  deployment: "deployments",
  statefulset: "statefulsets",
  daemonset: "daemonsets",
} as const;

export function logStreamTargetFromResource(
  resource: ResourceSummary,
): LogStreamTarget | null {
  if (!resource.namespace) return null;
  if (resource.facts.type === "pod" || resource.resourceType.toLowerCase() === "pod") {
    return {
      type: "pod",
      clusterId: resource.clusterId,
      namespace: resource.namespace,
      name: resource.name,
      container: null,
    };
  }
  if (
    resource.facts.type === "workload" &&
    resource.kind.toLowerCase() in WORKLOAD_KINDS
  ) {
    return {
      type: "workload",
      clusterId: resource.clusterId,
      kind: WORKLOAD_KINDS[resource.kind.toLowerCase() as keyof typeof WORKLOAD_KINDS],
      namespace: resource.namespace,
      name: resource.name,
    };
  }
  return null;
}

export function logStreamTargetFromDetail(detail: ResourceDetail): LogStreamTarget | null {
  return logStreamTargetFromResource(detail.resource);
}

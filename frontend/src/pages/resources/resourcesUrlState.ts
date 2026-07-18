import type { ResourceIdentity } from "../../features/resources/resourcesContract";

const RESOURCE_TYPE_MAX_LENGTH = 80;
const KIND_MAX_LENGTH = 120;
const RESOURCE_NAME_MAX_LENGTH = 253;
const CLUSTER_ID_MAX_LENGTH = 512;
const CANONICAL_TARGET_PREFIX = "v1";
const CLUSTER_SCOPED_NAMESPACE = "~";
const RESOURCE_TYPE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  deployment: "workload",
  daemonset: "workload",
  statefulset: "workload",
  replicaset: "workload",
  job: "workload",
  cronjob: "workload",
  ingress: "custom_resource",
  configmap: "custom_resource",
  secret: "custom_resource",
  hpa: "custom_resource",
  horizontalpodautoscaler: "custom_resource",
  pvc: "custom_resource",
  persistentvolumeclaim: "custom_resource",
  namespace: "custom_resource",
  serviceaccount: "custom_resource",
  role: "custom_resource",
  rolebinding: "custom_resource",
  clusterrole: "custom_resource",
  clusterrolebinding: "custom_resource",
  application: "custom_resource",
});

export interface ResourceDetailTarget {
  clusterId: string;
  identity: ResourceIdentity;
}

export type ResourceTypeResolution =
  | { kind: "none"; value: null }
  | { kind: "valid"; value: string }
  | { kind: "invalid"; value: string };

export function resolveResourceType(wildcard: string | undefined): ResourceTypeResolution {
  if (!wildcard) return { kind: "none", value: null };
  if (!isResourceType(wildcard)) {
    return { kind: "invalid", value: wildcard };
  }
  return { kind: "valid", value: canonicalResourceType(wildcard) };
}

export function canonicalResourceType(resourceType: string): string {
  const normalized = resourceType.trim().toLowerCase();
  return RESOURCE_TYPE_ALIASES[normalized] ?? resourceType;
}

export function resourceTypePath(resourceType: string): string {
  if (!isResourceType(resourceType)) throw new TypeError("invalid resource type");
  return `/resources/${encodeURIComponent(resourceType)}`;
}

export function encodeResourceSelection(identity: ResourceIdentity): {
  kind: string;
  resource: string;
} {
  assertDetailPart(identity.kind, KIND_MAX_LENGTH, "kind");
  assertCompositeDetailPart(identity.name, "name");
  if (identity.namespace !== null) {
    assertCompositeDetailPart(identity.namespace, "namespace");
  }
  return {
    kind: identity.kind,
    resource: `${identity.namespace ?? "_"}/${identity.name}`,
  };
}

export function encodeResourceDetail(identity: ResourceIdentity): string {
  assertDetailPart(identity.kind, KIND_MAX_LENGTH, "kind");
  assertCompositeDetailPart(identity.name, "name");
  if (identity.namespace !== null) {
    assertCompositeDetailPart(identity.namespace, "namespace");
  }
  return [
    identity.kind,
    identity.namespace ?? CLUSTER_SCOPED_NAMESPACE,
    identity.name,
  ].join("/");
}

export function decodeResourceDetail(
  resourceType: string | null,
  detail: string | null,
): ResourceIdentity | null {
  if (!resourceType || !detail || !isResourceType(resourceType)) return null;
  const parts = detail.split("/");
  if (parts.length !== 3) return null;
  const [kind = "", namespaceToken = "", name = ""] = parts;
  if (!isDetailPart(kind, KIND_MAX_LENGTH) || !isCompositeDetailPart(name)) return null;
  const namespace = namespaceToken === CLUSTER_SCOPED_NAMESPACE
    ? null
    : namespaceToken;
  if (namespace !== null && !isCompositeDetailPart(namespace)) return null;
  return { resourceType, kind, namespace, name };
}

export function encodeResourceTarget(
  clusterId: string,
  identity: ResourceIdentity,
): { kind: string; resource: string } {
  assertDetailPart(clusterId, CLUSTER_ID_MAX_LENGTH, "cluster");
  if (!isResourceType(identity.resourceType)) throw new TypeError("invalid resource type");
  const selection = encodeResourceSelection(identity);
  return {
    kind: selection.kind,
    resource: [
      CANONICAL_TARGET_PREFIX,
      encodeURIComponent(clusterId),
      encodeURIComponent(identity.resourceType),
      identity.namespace === null
        ? CLUSTER_SCOPED_NAMESPACE
        : encodeURIComponent(identity.namespace),
      encodeURIComponent(identity.name),
    ].join("/"),
  };
}

export function decodeResourceTarget(
  fallbackClusterId: string | null,
  fallbackResourceType: string | null,
  kind: string | null,
  resource: string | null,
): ResourceDetailTarget | null {
  if (kind === null || resource === null) return null;
  if (!isCanonicalResourceTarget(resource)) {
    if (fallbackClusterId === null) return null;
    const identity = decodeResourceSelection(fallbackResourceType, kind, resource);
    return identity ? { clusterId: fallbackClusterId, identity } : null;
  }
  const parts = resource.split("/");
  if (parts.length !== 5) return null;
  try {
    const clusterId = decodeURIComponent(parts[1] ?? "");
    const resourceType = decodeURIComponent(parts[2] ?? "");
    const namespaceToken = parts[3] ?? "";
    const namespace = namespaceToken === CLUSTER_SCOPED_NAMESPACE
      ? null
      : decodeURIComponent(namespaceToken);
    const name = decodeURIComponent(parts[4] ?? "");
    if (!isDetailPart(clusterId, CLUSTER_ID_MAX_LENGTH)) return null;
    const identity = decodeResourceSelection(
      resourceType,
      kind,
      `${namespace ?? "_"}/${name}`,
    );
    return identity ? { clusterId, identity } : null;
  } catch {
    return null;
  }
}

export function isCanonicalResourceTarget(resource: string | null): boolean {
  return resource?.startsWith(`${CANONICAL_TARGET_PREFIX}/`) ?? false;
}

export function decodeResourceSelection(
  resourceType: string | null,
  kind: string | null,
  resource: string | null,
): ResourceIdentity | null {
  if (!resourceType || !kind || !resource || !isResourceType(resourceType) ||
    !isDetailPart(kind, KIND_MAX_LENGTH)) {
    return null;
  }
  const slash = resource.indexOf("/");
  if (slash <= 0 || slash !== resource.lastIndexOf("/")) return null;
  const namespacePart = resource.slice(0, slash);
  const name = resource.slice(slash + 1);
  if (!isCompositeDetailPart(name)) return null;
  if (namespacePart !== "_" && !isCompositeDetailPart(namespacePart)) return null;
  return {
    resourceType,
    kind,
    namespace: namespacePart === "_" ? null : namespacePart,
    name,
  };
}

function assertDetailPart(value: string, maxLength: number, label: string) {
  if (!isDetailPart(value, maxLength)) throw new TypeError(`invalid resource ${label}`);
}

function assertCompositeDetailPart(value: string, label: string) {
  if (!isCompositeDetailPart(value)) throw new TypeError(`invalid resource ${label}`);
}

function isCompositeDetailPart(value: string): boolean {
  return isDetailPart(value, RESOURCE_NAME_MAX_LENGTH) && !value.includes("/");
}

function isDetailPart(value: string, maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength && value === value.trim();
}

function isResourceType(value: string): boolean {
  return isDetailPart(value, RESOURCE_TYPE_MAX_LENGTH) && !value.includes("/");
}

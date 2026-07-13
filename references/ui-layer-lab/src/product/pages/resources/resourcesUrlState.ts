import type { ResourceIdentity } from "../../features/resources/resourcesContract";

const RESOURCE_TYPE_MAX_LENGTH = 80;
const KIND_MAX_LENGTH = 120;
const RESOURCE_NAME_MAX_LENGTH = 253;
const CLUSTER_ID_MAX_LENGTH = 512;
const CANONICAL_TARGET_PREFIX = "v1";
const CLUSTER_SCOPED_NAMESPACE = "~";

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
  return { kind: "valid", value: wildcard };
}

export function resourceTypePath(resourceType: string): string {
  if (!isResourceType(resourceType)) throw new TypeError("invalid resource type");
  return `/product/resources/${encodeURIComponent(resourceType)}`;
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

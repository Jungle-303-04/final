import type { ResourceIdentity } from "../../features/resources/resourcesContract";

const RESOURCE_TYPE_MAX_LENGTH = 80;
const KIND_MAX_LENGTH = 120;
const RESOURCE_NAME_MAX_LENGTH = 253;

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

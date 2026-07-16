import type { CompareRequest, CompareTarget } from "../../features/compare/compareContract";
import { serializeRouteSearch } from "../../features/filters/routeSearchAdapter";
import { compareTargetParam, parseCompareTarget } from "../../features/compare/compareTarget";

export type CompareRouteIdentity = CompareRequest;

/**
 * Keeps the upstream-compatible comparison identity (`kind`, `apiGroup`, `a`,
 * and `b`) in the URL while adding the product's required cluster scope.
 * `apiVersion` is intentionally optional on input: the server descriptor
 * resolves an unambiguous source URL and the route canonicalizes it afterward.
 */
export function parseCompareRoute(search: URLSearchParams): CompareRouteIdentity | null {
  const clusterId = requiredText(search.get("cluster"));
  const kind = requiredText(search.get("kind"));
  const apiGroup = search.get("apiGroup") ?? "";
  const apiVersion = optionalApiVersion(search.get("apiVersion"));
  const a = parseCompareTarget(search.get("a"));
  const b = parseCompareTarget(search.get("b"));
  if (!clusterId || !kind || !validApiPart(apiGroup) || apiVersion === undefined || a === null || b === null) return null;
  return { clusterId, kind, apiGroup, apiVersion, a, b };
}

export function compareHref(identity: CompareRouteIdentity): string {
  const apiVersion = identity.apiVersion === null
    ? null
    : validApiPart(identity.apiVersion) && identity.apiVersion
      ? identity.apiVersion
      : invalidHref("apiVersion");
  return `/compare${serializeRouteSearch([
    ["cluster", requiredForHref(identity.clusterId, "cluster")],
    ["kind", requiredForHref(identity.kind, "kind")],
    ["apiGroup", validApiPart(identity.apiGroup) ? identity.apiGroup : invalidHref("apiGroup")],
    ["a", compareTargetParam(identity.a)],
    ["b", compareTargetParam(identity.b)],
    ["apiVersion", apiVersion],
  ])}`;
}

export function replaceCompareSide(
  identity: CompareRouteIdentity,
  side: "a" | "b",
  target: CompareTarget,
): CompareRouteIdentity {
  return { ...identity, [side]: target };
}

function requiredText(value: string | null): string | null {
  if (value === null || value !== value.trim() || !value || /\s/u.test(value) || value.includes("/")) return null;
  return value;
}

function optionalApiVersion(value: string | null): string | null | undefined {
  if (value === null || value === "") return null;
  return validApiPart(value) && value.length > 0 ? value : undefined;
}

function validApiPart(value: string): boolean {
  return value === value.trim() && !value.includes("/") && !/\s/u.test(value);
}

function requiredForHref(value: string, name: string): string {
  if (value === value.trim() && value && !/\s/u.test(value) && !value.includes("/")) return value;
  return invalidHref(name);
}

function invalidHref(name: string): never {
  throw new TypeError(`comparison ${name} is invalid`);
}

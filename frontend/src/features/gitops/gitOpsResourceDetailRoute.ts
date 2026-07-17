import type { GitOpsResourceLocator } from "./gitOpsContract";
import { serializeRouteSearch } from "../filters/routeSearchAdapter";

export function gitOpsResourceDetailLocator(query: URLSearchParams): GitOpsResourceLocator | null {
  const locator = {
    clusterId: query.get("cluster")?.trim() ?? "",
    apiVersion: query.get("apiVersion")?.trim() ?? "",
    kind: query.get("kind")?.trim() ?? "",
    namespace: query.get("namespace")?.trim() ?? "",
    name: query.get("name")?.trim() ?? "",
  };
  return Object.values(locator).every(Boolean) ? locator : null;
}

export function gitOpsResourceDetailPath(locator: GitOpsResourceLocator): string {
  if (Object.values(locator).some((value) => value.trim() === "")) {
    throw new RangeError("GitOps resource locator fields must not be empty");
  }
  return `/gitops/resource${serializeRouteSearch([
    ["cluster", locator.clusterId],
    ["apiVersion", locator.apiVersion],
    ["kind", locator.kind],
    ["namespace", locator.namespace],
    ["name", locator.name],
  ])}`;
}

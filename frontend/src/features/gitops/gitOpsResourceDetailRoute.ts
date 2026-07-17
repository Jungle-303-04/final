import type { GitOpsResourceLocator } from "./gitOpsContract";

export function gitOpsResourceDetailLocator(search: string): GitOpsResourceLocator | null {
  const query = new URLSearchParams(search);
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
  const query = new URLSearchParams({
    cluster: locator.clusterId,
    apiVersion: locator.apiVersion,
    kind: locator.kind,
    namespace: locator.namespace,
    name: locator.name,
  });
  return `/gitops/resource?${query.toString()}`;
}

import { gitOpsSyncCategory } from "../../features/gitops/gitOpsPresentation";
import type {
  GitOpsSyncTarget,
  ReleaseApplication,
} from "../../features/gitops/gitOpsContract";
import type { ResourcesFilterResourceItem } from "../../features/resources/resourcesFilterContract";

export function compareAttentionResourceHealth(
  left: ResourcesFilterResourceItem,
  right: ResourcesFilterResourceItem,
): number {
  const rank = (item: ResourcesFilterResourceItem) =>
    item.resource.health === "critical" ? 0 : item.resource.health === "warning" ? 1 : 2;
  return rank(left) - rank(right)
    || left.resource.inventoryKey.localeCompare(right.resource.inventoryKey);
}

export function summarizeRepositorySync(
  applications: readonly ReleaseApplication[],
  targets: readonly GitOpsSyncTarget[],
): { outOfSync: number; repositories: number; synced: number; unknown: number } {
  const repositoryByApplicationId = new Map(
    applications
      .map((application) => [application.id, application.repository.trim()] as const)
      .filter(([, repository]) => repository.length > 0),
  );
  const states = new Map<string, "out-of-sync" | "synced" | "unknown" | "unobserved">(
    [...new Set(repositoryByApplicationId.values())].map((repository) => [
      repository,
      "unobserved",
    ]),
  );
  for (const target of targets) {
    const category = gitOpsSyncCategory(target.syncStatus);
    const applicationIds = new Set(
      target.applicationIds && target.applicationIds.length > 0
        ? target.applicationIds
        : [target.applicationId],
    );
    for (const applicationId of applicationIds) {
      const repository = repositoryByApplicationId.get(applicationId);
      if (!repository) continue;
      const current = states.get(repository);
      if (category === "out-of-sync") {
        states.set(repository, "out-of-sync");
      } else if (category === "synced") {
        if (current === "unobserved") states.set(repository, "synced");
      } else if (current !== "out-of-sync") {
        states.set(repository, "unknown");
      }
    }
  }
  const values = [...states.values()];
  return {
    outOfSync: values.filter((state) => state === "out-of-sync").length,
    repositories: states.size,
    synced: values.filter((state) => state === "synced").length,
    unknown: values.filter((state) => state === "unknown" || state === "unobserved").length,
  };
}

export function latestObservedAt(targets: readonly GitOpsSyncTarget[]): string | null {
  let latest: string | null = null;
  let latestMs = -1;
  for (const target of targets) {
    if (!target.observedAt) continue;
    const value = Date.parse(target.observedAt);
    if (Number.isFinite(value) && value > latestMs) {
      latestMs = value;
      latest = target.observedAt;
    }
  }
  return latest;
}

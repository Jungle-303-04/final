import type { HomeClusterChoice } from "./homeContract";

/**
 * Chooses a useful initial scope without hiding or renaming authorized clusters.
 * Equal evidence preserves the server order. Explicit URL selections bypass this
 * helper in page state and therefore remain authoritative.
 */
export function selectInitialClusterChoice(
  clusters: readonly HomeClusterChoice[],
): HomeClusterChoice | undefined {
  let selected: HomeClusterChoice | undefined;
  let selectedScore = Number.NEGATIVE_INFINITY;

  for (const cluster of clusters) {
    const score = operationalEvidenceScore(cluster);
    if (score > selectedScore) {
      selected = cluster;
      selectedScore = score;
    }
  }

  return selected;
}

function operationalEvidenceScore(cluster: HomeClusterChoice): number {
  let score = 0;
  if (cluster.registrationState === "active") score += 8;
  if (cluster.connectionState === "online") score += 8;
  if (cluster.nodeCount > 0) score += 4;
  if (cluster.podCount > 0) score += 4;
  if (cluster.lastObservedAt !== null) score += 2;
  return score;
}

import type { TimelineCoverage } from "./timelineContract";

/** Stable identity for an immutable server-reported coverage interval. */
export function timelineCoverageKey(coverage: TimelineCoverage): string {
  return [
    coverage.scope.workspaceId,
    coverage.scope.clusterId,
    canonicalCoverageNamespaces(coverage.scope.namespaces).join("\0"),
    coverage.source,
    coverage.fromMs,
    coverage.toMs,
    coverage.reason,
  ].join("\0");
}

function canonicalCoverageNamespaces(namespaces: readonly string[] | undefined): readonly string[] {
  return [...new Set(namespaces ?? [])].sort();
}

import type { TimelineQuery } from "./timelineContract";

/**
 * The browser equivalent of the server's TimelineReplayIdentity. Presentation
 * preferences must never replace a durable stream session or opaque cursor.
 */
export function timelineEvidenceKey(query: TimelineQuery): string {
  return JSON.stringify({
    scopes: query.scopes
      .map((scope) => ({
        workspaceId: scope.workspaceId,
        clusterId: scope.clusterId,
        namespaces: [...new Set(scope.namespaces ?? [])].sort(),
      }))
      .sort((left, right) => (
        left.workspaceId.localeCompare(right.workspaceId)
        || left.clusterId.localeCompare(right.clusterId)
        || left.namespaces.join("\u0000").localeCompare(right.namespaces.join("\u0000"))
      )),
    mode: query.mode,
    filters: {
      activity: [...new Set(query.filters.activity)].sort(),
      kinds: [...new Set(query.filters.kinds.map((kind) => kind.trim()).filter(Boolean))].sort(),
      includeDeleted: query.filters.showDeleted,
      search: query.filters.search.trim(),
    },
  });
}

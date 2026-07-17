import { afterEach, describe, expect, it, vi } from "vitest";

import { createHomeAdapter } from "./createHomeAdapter";
import { endpoints } from "./createHomeAdapter.testSupport";
import type { HomeEndpointDashboardEvent } from "./homeEndpointContract";

afterEach(() => vi.useRealTimers());

describe("Home dashboard invalidation adapter", () => {
  it("reconnects only after the server-declared delay and resumes its opaque cursor", async () => {
    vi.useFakeTimers();
    const calls: Array<{ after?: string }> = [];
    const dependencies = endpoints({
      subscribeHomeDashboardEvents(clusterId, options) {
        calls.push({ after: options?.after });
        return calls.length === 1
          ? events([event("connected", "cursor-1")])
          : events([
              event("connected", "cursor-1"),
              event("deferred_ready", "cursor-2", "snapshot-2"),
            ]);
      },
    });
    const adapter = createHomeAdapter(dependencies);
    const iterator = adapter.subscribeDashboardInvalidations("cluster-1")[Symbol.asyncIterator]();
    const pending = iterator.next();

    await vi.advanceTimersByTimeAsync(1_499);
    expect(calls).toEqual([{ after: undefined }]);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({
      done: false,
      value: { snapshotId: "snapshot-2" },
    });
    expect(calls).toEqual([{ after: undefined }, { after: "cursor-1" }]);
    await iterator.return?.();
  });
});

function event(
  kind: HomeEndpointDashboardEvent["kind"],
  cursor: string,
  snapshotId?: string,
): HomeEndpointDashboardEvent {
  return {
    kind,
    cursor,
    scope: {
      workspace_id: "workspace-a",
      cluster_id: "cluster-1",
      namespaces: [],
      freshness: "live",
    },
    reconnect_after_ms: 1_500,
    ...(snapshotId === undefined ? {} : {
      snapshot_id: snapshotId,
      occurred_at: "2026-07-17T01:02:03Z",
    }),
  };
}

function events(items: readonly HomeEndpointDashboardEvent[]): AsyncIterable<HomeEndpointDashboardEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* items;
    },
  };
}

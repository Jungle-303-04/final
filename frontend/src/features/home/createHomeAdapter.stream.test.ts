import { afterEach, describe, expect, it, vi } from "vitest";

import { createHomeAdapter } from "./createHomeAdapter";
import { endpoints } from "./createHomeAdapter.testSupport";
import type { HomeEndpointDashboardEvent } from "./homeEndpointContract";
import type { ScopeTransitionOperationEvent } from "../../shared/parity/referenceParity";

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
    const iterator = adapter.subscribeDashboardInvalidations(scope())[Symbol.asyncIterator]();
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

  it("normalizes a scoped connection into progress and context-changed operation events", async () => {
    const operations: ScopeTransitionOperationEvent[] = [];
    const adapter = createHomeAdapter(endpoints({
      subscribeHomeDashboardEvents() {
        return events([
          event("connected", "cursor-1"),
          event("deferred_ready", "cursor-2", "snapshot-2"),
        ]);
      },
    }));

    const iterator = adapter.subscribeDashboardInvalidations(scope(), {
      onScopeOperation: (operation) => operations.push(operation),
    })[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { snapshotId: "snapshot-2" },
    });
    expect(operations).toEqual([
      {
        attempt: 0,
        kind: "progress",
        phase: "context_switch_progress",
        retryAfterMs: null,
        scope: scope(),
      },
      {
        attempt: 0,
        kind: "completed",
        phase: "context_changed",
        retryAfterMs: null,
        scope: scope(),
      },
    ]);
    await iterator.return?.();
  });

  it("reconnects an initially unavailable stream with bounded reference backoff", async () => {
    vi.useFakeTimers();
    const calls: Array<{ after?: string }> = [];
    const operations: ScopeTransitionOperationEvent[] = [];
    const adapter = createHomeAdapter(endpoints({
      subscribeHomeDashboardEvents(_clusterId, options) {
        calls.push({ after: options?.after });
        return calls.length === 1
          ? failedEvents({ kind: "network" })
          : events([
              event("connected", "cursor-1"),
              event("deferred_ready", "cursor-2", "snapshot-2"),
            ]);
      },
    }));
    const iterator = adapter.subscribeDashboardInvalidations(scope(), {
      onScopeOperation: (operation) => operations.push(operation),
    })[Symbol.asyncIterator]();
    const pending = iterator.next();

    await vi.advanceTimersByTimeAsync(2_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ value: { snapshotId: "snapshot-2" } });
    expect(operations).toContainEqual({
      attempt: 1,
      kind: "progress",
      phase: "context_switch_progress",
      retryAfterMs: 3_000,
      scope: { ...scope(), freshness: "disconnected" },
    });
    expect(Math.max(...operations.map((operation) => operation.retryAfterMs ?? 0)))
      .toBeLessThanOrEqual(30_000);
    await iterator.return?.();
  });

  it("caps repeated scope reconnect attempts at thirty seconds", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const operations: ScopeTransitionOperationEvent[] = [];
    const adapter = createHomeAdapter(endpoints({
      subscribeHomeDashboardEvents() {
        calls += 1;
        return calls <= 8
          ? failedEvents({ kind: "network" })
          : events([
              event("connected", "cursor-1"),
              event("deferred_ready", "cursor-2", "snapshot-2"),
            ]);
      },
    }));
    const iterator = adapter.subscribeDashboardInvalidations(scope(), {
      onScopeOperation: (operation) => operations.push(operation),
    })[Symbol.asyncIterator]();
    const pending = iterator.next();

    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ value: { snapshotId: "snapshot-2" } });
    expect(operations.flatMap((operation) => operation.retryAfterMs ?? []))
      .toEqual([3_000, 4_500, 6_750, 10_125, 15_188, 22_781, 30_000, 30_000]);
    await iterator.return?.();
  });

  it("fails closed when the authenticated stream returns another workspace authority", async () => {
    const connected = event("connected", "cursor-1");
    const adapter = createHomeAdapter(endpoints({
      subscribeHomeDashboardEvents() {
        return events([{ ...connected, scope: {
          ...connected.scope,
          workspace_id: "workspace-b",
        } }]);
      },
    }));
    const iterator = adapter.subscribeDashboardInvalidations(scope())[Symbol.asyncIterator]();

    await expect(iterator.next()).rejects.toMatchObject({ code: "invalid-response" });
  });
});

function scope() {
  return {
    workspaceId: "workspace-a",
    clusterId: "cluster-1",
    namespaces: [] as const,
    freshness: "live" as const,
  };
}

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

function failedEvents(error: unknown): AsyncIterable<HomeEndpointDashboardEvent> {
  return {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<HomeEndpointDashboardEvent>> {
          return Promise.reject(error);
        },
      };
    },
  };
}

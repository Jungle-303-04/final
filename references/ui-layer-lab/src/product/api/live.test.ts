import { describe, expect, it } from "vitest";

import {
  buildRealtimeUrl,
  createRealtimeSequenceState,
  reduceRealtimeSequence,
} from "./live";
import { parseRealtimeMessage, realtimeMessageSchema } from "./live-schemas";

const summaryMessage = {
  type: "live.summary" as const,
  seq: 1,
  cluster_id: "cluster-1",
  summary: {
    cluster_id: "cluster-1",
    window_ms: 1_000,
    pods_ready: 3,
    pods_total: 4,
    restart_delta: 1,
    rollout_phase: "progressing" as const,
    hot_pods: [
      {
        namespace: "sandbox",
        pod: "storefront-1",
        cpu_ratio: 0.75,
        restart_count: 2,
        ready: false,
      },
    ],
  },
};

describe("realtime.v1 schema", () => {
  it("validates every canonical message variant", () => {
    const messages = [
      { type: "hello", protocol: "realtime.v1" },
      { type: "snapshot", seq: 0, state: { clusters: {}, arbitrary: [1, 2] } },
      summaryMessage,
      {
        type: "resource.delta",
        seq: 2,
        op: "replace",
        key: "cluster-1/sandbox/Pod/storefront-1",
        value: { providerNeutral: { nested: true } },
      },
      { type: "resource.delta", seq: 3, op: "remove", key: "a/b/c/d", value: null },
      { type: "ping", ts: 1_720_000_000.25 },
    ];

    for (const message of messages) {
      expect(() => parseRealtimeMessage(message)).not.toThrow();
    }
  });

  it("rejects unknown fields outside the two open payload maps", () => {
    expect(
      realtimeMessageSchema.safeParse({
        type: "hello",
        protocol: "realtime.v1",
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      realtimeMessageSchema.safeParse({
        ...summaryMessage,
        summary: { ...summaryMessage.summary, unexpected: true },
      }).success,
    ).toBe(false);
    expect(
      realtimeMessageSchema.safeParse({
        ...summaryMessage,
        summary: {
          ...summaryMessage.summary,
          hot_pods: [{ ...summaryMessage.summary.hot_pods[0], unexpected: true }],
        },
      }).success,
    ).toBe(false);
  });

  it("enforces bounded live summaries", () => {
    expect(
      realtimeMessageSchema.safeParse({
        ...summaryMessage,
        summary: { ...summaryMessage.summary, window_ms: 60_001 },
      }).success,
    ).toBe(false);
    expect(
      realtimeMessageSchema.safeParse({
        ...summaryMessage,
        summary: {
          ...summaryMessage.summary,
          hot_pods: Array.from({ length: 21 }, (_, index) => ({
            namespace: "sandbox",
            pod: `pod-${index}`,
            cpu_ratio: null,
            restart_count: 0,
            ready: true,
          })),
        },
      }).success,
    ).toBe(false);
  });
});

describe("realtime sequence reducer", () => {
  it("becomes connected only after a valid hello and snapshot", () => {
    const initial = createRealtimeSequenceState();
    const hello = reduceRealtimeSequence(initial, {
      type: "hello",
      protocol: "realtime.v1",
    });

    expect(hello.accepted).toBe(true);
    expect(hello.state.connected).toBe(false);

    const snapshot = reduceRealtimeSequence(hello.state, {
      type: "snapshot",
      seq: 12,
      state: { clusters: { "cluster-1": {} } },
    });
    expect(snapshot.accepted).toBe(true);
    expect(snapshot.state).toMatchObject({
      connected: true,
      helloReceived: true,
      snapshotReceived: true,
      lastSequence: 12,
    });
  });

  it("accepts hub-global sequence gaps and discards only old or duplicate values", () => {
    const snapshot = reduceRealtimeSequence(
      {
        ...createRealtimeSequenceState(),
        helloReceived: true,
        snapshotReceived: true,
        connected: true,
        lastSequence: 10,
      },
      { ...summaryMessage, seq: 25 },
    );
    expect(snapshot.accepted).toBe(true);
    expect(snapshot.state.lastSequence).toBe(25);

    const duplicate = reduceRealtimeSequence(snapshot.state, {
      type: "resource.delta",
      seq: 25,
      op: "remove",
      key: "cluster-1/sandbox/Pod/storefront-1",
      value: null,
    });
    expect(duplicate).toMatchObject({
      accepted: false,
      reason: "stale-or-duplicate-sequence",
    });

    const old = reduceRealtimeSequence(snapshot.state, { ...summaryMessage, seq: 9 });
    expect(old.accepted).toBe(false);
    expect(old.state).toBe(snapshot.state);
  });

  it("accepts an authoritative snapshot as a sequence reset", () => {
    const current = {
      ...createRealtimeSequenceState(),
      helloReceived: true,
      snapshotReceived: true,
      connected: true,
      lastSequence: 400,
    };
    const reset = reduceRealtimeSequence(current, {
      type: "snapshot",
      seq: 40,
      state: { recovered: true },
    });

    expect(reset.accepted).toBe(true);
    expect(reset.state.lastSequence).toBe(40);
    expect(reset.state).not.toHaveProperty("snapshotState");
  });

  it("does not advance sequence for ping messages", () => {
    const current = {
      ...createRealtimeSequenceState(),
      lastSequence: 7,
    };
    const result = reduceRealtimeSequence(current, { type: "ping", ts: 123.45 });

    expect(result.accepted).toBe(true);
    expect(result.state).toBe(current);
  });
});

describe("same-origin realtime URL", () => {
  it("uses the current host, secure socket protocol, and canonical query names", () => {
    const url = new URL(
      buildRealtimeUrl(
        {
          workspaceId: "workspace-1",
          clusterId: "cluster-1",
          namespace: "sandbox",
          app: "store front",
        },
        { protocol: "https:", host: "k8s.example.test" },
      ),
    );

    expect(url.origin).toBe("wss://k8s.example.test");
    expect(url.pathname).toBe("/api/live/browser");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      workspace_id: "workspace-1",
      cluster_id: "cluster-1",
      namespace: "sandbox",
      app: "store front",
    });
  });
});

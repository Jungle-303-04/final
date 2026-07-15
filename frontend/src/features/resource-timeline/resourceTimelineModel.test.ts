import { describe, expect, it } from "vitest";

import type {
  PhysicalTopologyPod,
  PhysicalTopologyServer,
} from "../resources/physicalTopologyContract";
import type { ResourceSummary } from "../resources/resourcesContract";
import {
  RESOURCE_TIMELINE_ESTIMATED_POD_BYTES,
  RESOURCE_TIMELINE_ESTIMATED_SAMPLE_BYTES,
  RESOURCE_TIMELINE_MAX_SAMPLES_PER_POD,
  RESOURCE_TIMELINE_RETENTION_MS,
  ResourceTimelineModel,
  podTimelineIdentity,
} from "./resourceTimelineModel";

const CLUSTER = "cluster-1";
const NAMESPACE = "shop";
const POD = "checkout-api-0";
const IDENTITY = podTimelineIdentity({
  clusterId: CLUSTER,
  namespace: NAMESPACE,
  name: POD,
});

describe("resource timeline model", () => {
  it("accepts an authoritative snapshot and sequential deltas without changing raw numbers", () => {
    const timeline = new ResourceTimelineModel();

    expect(timeline.ingest(snapshot(10, podValue("2026-07-15T04:00:00.000Z", 35, 210))))
      .toMatchObject({ accepted: true, storedSamples: 1 });
    expect(timeline.ingest(delta(11, podValue("2026-07-15T04:00:01.000Z", 106.2, 531))))
      .toMatchObject({ accepted: true, storedSamples: 1 });

    expect(timeline.getPodSamples(IDENTITY)).toHaveLength(2);
    expect(timeline.selectPod(IDENTITY)).toMatchObject({
      sequence: 11,
      usagePercent: 106.2,
      cpuMillicores: 531,
      observedAt: "2026-07-15T04:00:01.000Z",
    });

    const graphPod = timeline.selectGraphPod(CLUSTER, graphPodFixture());
    const tableRow = timeline.selectTableRow(tableRowFixture());
    expect(graphPod.usagePercent).toBe(106.2);
    expect(graphPod.cpuMillicores).toBe(531);
    expect(tableRow.facts.type).toBe("pod");
    if (tableRow.facts.type !== "pod") throw new Error("expected pod facts");
    expect(tableRow.facts.cpuMillicores).toBe(graphPod.cpuMillicores);
    expect(tableRow.facts.memoryMebibytes).toBe(graphPod.memoryMebibytes);
    expect(tableRow.facts.restartCount).toBe(graphPod.restartCount);
  });

  it("pins replay selection while new live samples continue entering the buffer", () => {
    const timeline = new ResourceTimelineModel();
    timeline.ingest(snapshot(1, podValue("2026-07-15T04:00:00.000Z", 30, 150)));
    timeline.ingest(delta(2, podValue("2026-07-15T04:00:01.000Z", 70, 350)));
    timeline.setReplayCursor("2026-07-15T04:00:00.500Z");
    const pinnedCursor = timeline.getCursor();

    timeline.ingest(delta(3, podValue("2026-07-15T04:00:02.000Z", 90, 450)));

    expect(timeline.getCursor()).toEqual(pinnedCursor);
    expect(timeline.getPodSamples(IDENTITY)).toHaveLength(3);
    expect(timeline.selectPod(IDENTITY)?.usagePercent).toBe(30);

    timeline.setLiveCursor();
    expect(timeline.selectPod(IDENTITY)?.usagePercent).toBe(90);
  });

  it("accepts increasing hub-global sequence gaps without degrading the filtered stream", () => {
    const timeline = new ResourceTimelineModel();
    timeline.ingest(snapshot(5, podValue("2026-07-15T04:00:00.000Z", 20, 100)));

    expect(timeline.ingest(delta(7, podValue("2026-07-15T04:00:01.000Z", 40, 200))))
      .toMatchObject({
        accepted: true,
        anomaly: null,
        reason: null,
        resyncRequired: false,
      });

    expect(timeline.getSequenceQuality()).toEqual({
      phase: "tracking",
      lastSequence: 7,
      snapshotCount: 1,
      gapEventCount: 0,
      skippedSequenceCount: 0,
      duplicateCount: 0,
      outOfOrderCount: 0,
      lastAnomaly: null,
      resyncRequired: false,
    });
    expect(timeline.getPodSamples(IDENTITY)).toHaveLength(2);
    expect(timeline.getAvailableRange()).toMatchObject({
      from: "2026-07-15T04:00:00.000Z",
      to: "2026-07-15T04:00:01.000Z",
    });
    expect(timeline.getPresentationState()).toMatchObject({
      degraded: false,
      degradedReasons: [],
    });
  });

  it("ignores a sequenced live summary and accepts the following increasing pod delta", () => {
    const timeline = new ResourceTimelineModel();
    timeline.ingest(snapshot(10, podValue("2026-07-15T04:00:00.000Z", 20, 100)));

    expect(timeline.ingest({
      type: "live.summary",
      seq: 11,
      cluster_id: CLUSTER,
      summary: { pods_ready: 1, pods_total: 1 },
    })).toMatchObject({
      accepted: false,
      reason: "invalid-message",
      resyncRequired: false,
    });
    expect(timeline.ingest(delta(12, podValue("2026-07-15T04:00:01.000Z", 45, 225))))
      .toMatchObject({ accepted: true, anomaly: null, resyncRequired: false });
    expect(timeline.getSequenceQuality()).toMatchObject({
      phase: "tracking",
      lastSequence: 12,
      resyncRequired: false,
    });
    expect(timeline.selectPod(IDENTITY)?.usagePercent).toBe(45);
  });

  it("still clears contaminated history after a duplicate until a snapshot resets authority", () => {
    const timeline = new ResourceTimelineModel();
    timeline.ingest(snapshot(5, podValue("2026-07-15T04:00:00.000Z", 20, 100)));
    timeline.ingest(delta(5, podValue("2026-07-15T04:00:01.000Z", 40, 200)));

    timeline.ingest(snapshot(20, podValue("2026-07-15T04:00:10.000Z", 50, 250)));
    expect(timeline.getSequenceQuality()).toMatchObject({
      phase: "tracking",
      lastSequence: 20,
      resyncRequired: false,
    });
    expect(timeline.getPodSamples(IDENTITY)).toEqual([
      expect.objectContaining({ observedAt: "2026-07-15T04:00:10.000Z" }),
    ]);
  });

  it.each([
    ["duplicate", 5, "duplicate-sequence"],
    ["out-of-order", 4, "out-of-order-sequence"],
  ] as const)("requires a snapshot after a %s sequence", (_kind, sequence, reason) => {
    const timeline = new ResourceTimelineModel();
    timeline.ingest(snapshot(5, podValue("2026-07-15T04:00:00.000Z", 20, 100)));

    expect(timeline.ingest(delta(
      sequence,
      podValue("2026-07-15T04:00:01.000Z", 40, 200),
    ))).toMatchObject({ accepted: false, reason, resyncRequired: true });
    expect(timeline.getAvailableRange()).toBeNull();
  });

  it("keeps only one measured sample per one-second bucket and never invents a timestamp", () => {
    const timeline = new ResourceTimelineModel();
    timeline.ingest(snapshot(1, podValue("2026-07-15T04:00:00.100Z", 20, 100)));
    timeline.ingest(delta(2, podValue("2026-07-15T04:00:00.900Z", 40, 200)));
    const withoutTimestamp: Partial<ReturnType<typeof podValue>> =
      podValue("2026-07-15T04:00:01.000Z", 80, 400);
    delete withoutTimestamp.observed_at;

    expect(timeline.ingest(delta(3, withoutTimestamp)))
      .toMatchObject({ accepted: true, storedSamples: 0, reason: "measurement-without-time" });

    expect(timeline.getPodSamples(IDENTITY)).toEqual([
      expect.objectContaining({
        observedAt: "2026-07-15T04:00:00.900Z",
        usagePercent: 40,
        cpuMillicores: 200,
      }),
    ]);
  });

  it("keeps request-relative usage unknown when a request denominator is absent", () => {
    const timeline = new ResourceTimelineModel();
    const value = {
      ...podValue("2026-07-15T04:00:00.000Z", 88, 440),
      cpu_request_mcores: null,
      cpu_request_pct: null,
    };
    timeline.ingest(snapshot(1, value));

    const sample = timeline.selectPod(IDENTITY);
    expect(sample?.usagePercent).toBeNull();
    expect(sample?.cpuMillicores).toBe(440);
    expect(sample?.cpuRequestMillicores).toBeNull();
  });

  it("enforces the two-hour, per-pod, and estimated-memory bounds", () => {
    const maxEstimatedBytes = RESOURCE_TIMELINE_ESTIMATED_POD_BYTES +
      RESOURCE_TIMELINE_ESTIMATED_SAMPLE_BYTES * 2;
    const timeline = new ResourceTimelineModel({ maxEstimatedBytes, maxSamplesPerPod: 2 });
    const start = Date.parse("2026-07-15T00:00:00.000Z");
    timeline.ingest(snapshot(1, podValue(new Date(start).toISOString(), 10, 50)));
    timeline.ingest(delta(2, podValue(new Date(start + 1_000).toISOString(), 20, 100)));
    timeline.ingest(delta(3, podValue(new Date(start + 2_000).toISOString(), 30, 150)));

    expect(timeline.getPodSamples(IDENTITY)).toHaveLength(2);
    expect(timeline.getMemoryEstimate()).toMatchObject({
      maxEstimatedBytes,
      sampleCount: 2,
      podBufferCount: 1,
      estimatedBytes: maxEstimatedBytes,
      retentionTruncated: true,
    });

    timeline.ingest(delta(4, podValue(
      new Date(start + RESOURCE_TIMELINE_RETENTION_MS + 3_000).toISOString(),
      40,
      200,
    )));
    expect(timeline.getPodSamples(IDENTITY)).toEqual([
      expect.objectContaining({ usagePercent: 40 }),
    ]);
    expect(RESOURCE_TIMELINE_MAX_SAMPLES_PER_POD).toBe(7_200);
  });

  it("stores a measured removal tombstone and excludes the pod after that replay time", () => {
    const timeline = new ResourceTimelineModel();
    timeline.ingest(snapshot(1, podValue("2026-07-15T04:00:00.000Z", 55, 275)));
    timeline.ingest({
      type: "resource.delta",
      seq: 2,
      op: "remove",
      key: resourceKey(),
      value: null,
      observed_at: "2026-07-15T04:00:01.000Z",
    });

    expect(timeline.selectPod(IDENTITY)).toBeNull();
    expect(timeline.getPodSamples(IDENTITY)).toHaveLength(2);

    timeline.setReplayCursor("2026-07-15T04:00:00.500Z");
    expect(timeline.selectPod(IDENTITY)?.usagePercent).toBe(55);
    timeline.setReplayCursor("2026-07-15T04:00:01.000Z");
    expect(timeline.selectPod(IDENTITY)).toBeNull();
    expect(timeline.hasReplayCoverage()).toBe(true);
  });

  it("marks replay history unavailable when an old agent removes a pod without observed time", () => {
    const timeline = new ResourceTimelineModel();
    timeline.ingest(snapshot(1, podValue("2026-07-15T04:00:00.000Z", 55, 275)));

    expect(timeline.ingest({
      type: "resource.delta",
      seq: 2,
      op: "remove",
      key: resourceKey(),
      value: null,
    })).toMatchObject({
      accepted: true,
      reason: "removal-without-time",
      resyncRequired: false,
    });
    expect(timeline.getAvailableRange()).toBeNull();
    expect(() => timeline.setReplayCursor("2026-07-15T04:00:00.000Z"))
      .toThrow(/removal.*observed time/i);
    expect(timeline.getPresentationState()).toMatchObject({
      degraded: true,
      degradedReasons: ["resource-removal-time-unavailable"],
      gap: { visible: true },
    });
  });

  it("replays the actual historical graph and table membership while live membership changes", () => {
    const timeline = new ResourceTimelineModel();
    const podA = graphPodFixture("checkout-api-a");
    const rowA = tableRowFixture("checkout-api-a");
    const podB = graphPodFixture("checkout-api-b");
    const rowB = tableRowFixture("checkout-api-b");
    const keyA = `${CLUSTER}/${NAMESPACE}/pod/checkout-api-a`;
    const keyB = `${CLUSTER}/${NAMESPACE}/pod/checkout-api-b`;
    const valueA = { ...podValue("2026-07-15T04:00:00.000Z", 30, 150), name: podA.name };
    const valueB = { ...podValue("2026-07-15T04:00:02.000Z", 80, 400), name: podB.name };

    timeline.ingest({
      type: "snapshot",
      seq: 1,
      state: { resources: { [keyA]: valueA } },
    });
    expect(timeline.captureActualView(CLUSTER, [podA], [rowA])).toBe(1);
    expect(timeline.captureActualView(CLUSTER, [podA], [rowA])).toBe(0);
    timeline.setReplayCursor("2026-07-15T04:00:00.500Z");
    timeline.ingest({
      type: "resource.delta",
      seq: 2,
      op: "remove",
      key: keyA,
      value: null,
      observed_at: "2026-07-15T04:00:01.000Z",
    });
    timeline.ingest({ type: "resource.delta", seq: 3, op: "replace", key: keyB, value: valueB });
    timeline.captureActualView(CLUSTER, [podB], [rowB]);

    expect(timeline.selectGraphPods(CLUSTER, [podB]).map((pod) => pod.name))
      .toEqual(["checkout-api-a"]);
    expect(timeline.selectTableRows([rowB]).map((row) => row.name))
      .toEqual(["checkout-api-a"]);
    expect(timeline.selectGraphPods(CLUSTER, [podB])[0]?.cpuMillicores).toBe(150);
    expect(timeline.selectTableRows([rowB])[0]?.facts).toMatchObject({
      type: "pod",
      cpuMillicores: 150,
    });
  });

  it("replays measured server CPU and memory from the same selected time", () => {
    const timeline = new ResourceTimelineModel();
    const oldServer = serverFixture(24, 41);
    const newServer = serverFixture(83, 67);
    timeline.ingest(snapshot(1, podValue("2026-07-15T04:00:00.000Z", 30, 150)));
    timeline.captureActualView(
      CLUSTER,
      [graphPodFixture()],
      [tableRowFixture()],
      [oldServer],
      "2026-07-15T04:00:00.000Z",
    );
    timeline.ingest(delta(2, podValue("2026-07-15T04:00:02.000Z", 80, 400)));
    timeline.captureActualView(
      CLUSTER,
      [graphPodFixture()],
      [tableRowFixture()],
      [newServer],
      "2026-07-15T04:00:02.000Z",
    );

    timeline.setReplayCursor("2026-07-15T04:00:00.500Z");
    expect(timeline.selectServerTopology(CLUSTER, [newServer], null)).toEqual({
      observedAt: "2026-07-15T04:00:00.000Z",
      servers: [oldServer],
    });

    timeline.setLiveCursor();
    expect(timeline.selectServerTopology(CLUSTER, [newServer], "2026-07-15T04:00:02.000Z"))
      .toEqual({
        observedAt: "2026-07-15T04:00:02.000Z",
        servers: [newServer],
      });
  });

  it("requires a snapshot before accepting deltas and lets a later snapshot reset sequence authority", () => {
    const timeline = new ResourceTimelineModel();
    expect(timeline.ingest(delta(3, podValue("2026-07-15T04:00:00.000Z", 30, 150))))
      .toMatchObject({ accepted: false, reason: "snapshot-required" });

    expect(timeline.ingest(snapshot(40, podValue("2026-07-15T04:00:01.000Z", 40, 200))))
      .toMatchObject({ accepted: true });
    expect(timeline.ingest(snapshot(1, podValue("2026-07-15T04:00:02.000Z", 50, 250))))
      .toMatchObject({ accepted: true });
    expect(timeline.ingest(delta(2, podValue("2026-07-15T04:00:03.000Z", 60, 300))))
      .toMatchObject({ accepted: true });
    expect(timeline.getSequenceQuality().lastSequence).toBe(2);
  });

  it("keeps connection degradation separate from normal filtered sequence gaps", () => {
    const timeline = new ResourceTimelineModel();

    timeline.setConnectionState({
      status: "connected",
      actualIntervalSeconds: 1,
      source: "sse",
      degradedReason: null,
    });
    timeline.ingest(snapshot(1, podValue("2026-07-15T04:00:00.000Z", 35, 175)));
    timeline.ingest(delta(3, podValue("2026-07-15T04:00:01.000Z", 45, 225)));

    expect(timeline.getPresentationState()).toMatchObject({
      cursor: { mode: "live" },
      connection: {
        status: "connected",
        actualIntervalSeconds: 1,
        source: "sse",
        degradedReason: null,
        lastObservedAt: "2026-07-15T04:00:01.000Z",
      },
      latestLiveAt: "2026-07-15T04:00:01.000Z",
      selectedAt: "2026-07-15T04:00:01.000Z",
      gap: {
        visible: false,
        eventCount: 0,
        skippedSequenceCount: 0,
      },
      degraded: false,
      degradedReasons: [],
    });

    timeline.setConnectionState({
      status: "reconnecting",
      actualIntervalSeconds: 5,
      source: "polling",
      degradedReason: "stream-timeout",
    });
    expect(timeline.getPresentationState()).toMatchObject({
      connection: {
        status: "reconnecting",
        actualIntervalSeconds: 5,
        source: "polling",
        degradedReason: "stream-timeout",
      },
      degraded: true,
      degradedReasons: [
        "stream-timeout",
        "connection-reconnecting",
      ],
    });
  });

  it("advances replay only through measured time and does not reveal newer live deltas", () => {
    const timeline = new ResourceTimelineModel();
    timeline.ingest(snapshot(1, podValue("2026-07-15T04:00:00.000Z", 30, 150)));
    timeline.ingest(delta(2, podValue("2026-07-15T04:00:01.000Z", 70, 350)));

    timeline.setReplayCursor("2026-07-15T04:00:00.000Z");
    timeline.setReplayPlaying(true);
    timeline.advanceReplayCursor("2026-07-15T04:00:00.500Z");
    expect(timeline.getCursor()).toMatchObject({
      mode: "replay",
      playback: "playing",
      at: "2026-07-15T04:00:00.500Z",
      availableThrough: "2026-07-15T04:00:01.000Z",
    });
    expect(timeline.selectPod(IDENTITY)?.usagePercent).toBe(30);

    const pinnedAvailableThrough = timeline.getCursor();
    timeline.ingest(delta(3, podValue("2026-07-15T04:00:02.000Z", 90, 450)));
    expect(timeline.getCursor()).toEqual(pinnedAvailableThrough);

    timeline.advanceReplayCursor("2026-07-15T04:00:30.000Z");
    expect(timeline.getCursor()).toMatchObject({
      mode: "replay",
      at: "2026-07-15T04:00:01.000Z",
      availableThrough: "2026-07-15T04:00:01.000Z",
    });
    expect(timeline.selectPod(IDENTITY)?.usagePercent).toBe(70);
    expect(timeline.getPresentationState()).toMatchObject({
      latestLiveAt: "2026-07-15T04:00:02.000Z",
      selectedAt: "2026-07-15T04:00:01.000Z",
    });

    timeline.setLiveCursor();
    expect(timeline.selectPod(IDENTITY)?.usagePercent).toBe(90);
  });
});

function snapshot(seq: number, value: Record<string, unknown>) {
  return {
    type: "snapshot",
    seq,
    state: { resources: { [resourceKey()]: value } },
  };
}

function delta(seq: number, value: Record<string, unknown>) {
  return {
    type: "resource.delta",
    seq,
    op: "replace",
    key: resourceKey(),
    value,
  };
}

function resourceKey() {
  return `${CLUSTER}/${NAMESPACE}/pod/${POD}`;
}

function podValue(observedAt: string, usagePercent: number, cpuMillicores: number) {
  return {
    resource_type: "pod",
    kind: "Pod",
    name: POD,
    namespace: NAMESPACE,
    phase: "Running",
    health: "healthy",
    restarts: 2,
    cpu_mcores: cpuMillicores,
    cpu_request_mcores: 500,
    mem_mib: 128,
    mem_request_mib: 256,
    cpu_request_pct: usagePercent,
    mem_request_pct: usagePercent / 2,
    observed_at: observedAt,
  };
}

function graphPodFixture(name = POD): PhysicalTopologyPod {
  return {
    id: `pod:${NAMESPACE}/${name}`,
    name,
    namespace: NAMESPACE,
    serverId: "node-1",
    usagePercent: 0,
    cpuMillicores: 0,
    cpuRequestMillicores: 500,
    memoryMebibytes: 0,
    memoryRequestMebibytes: 256,
    phase: "Pending",
    health: "unknown",
    restartCount: 0,
    matchesFilter: true,
  };
}

function serverFixture(cpuPercent: number, memoryPercent: number): PhysicalTopologyServer {
  return {
    id: "node-1",
    name: "worker-1",
    cpuPercent,
    memoryPercent,
    status: "Ready",
    matchedPodCount: 1,
    totalPodCount: 1,
    matchedPodCountCompleteness: "exact",
    totalPodCountCompleteness: "exact",
  };
}

function tableRowFixture(name = POD): ResourceSummary {
  return {
    id: `pod:${NAMESPACE}/${name}`,
    identityStability: "uid",
    inventoryKey: `pod:${NAMESPACE}/${name}`,
    uid: `pod:${NAMESPACE}/${name}`,
    clusterId: CLUSTER,
    resourceType: "pod",
    apiVersion: "v1",
    kind: "Pod",
    namespace: NAMESPACE,
    name,
    status: "Pending",
    health: "unknown",
    healthStatus: "unknown",
    facts: {
      type: "pod",
      phase: "Pending",
      nodeName: "node-1",
      owner: null,
      readiness: null,
      restartCount: 0,
      cpuMillicores: 0,
      memoryMebibytes: 0,
      podIp: null,
      hostIp: null,
      waitingReasons: [],
      terminatedReasons: [],
    },
    observedAt: null,
    firstSeenAt: null,
    lastSeenAt: null,
    deletedAt: null,
  };
}

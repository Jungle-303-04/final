import { describe, expect, it, vi } from "vitest";

import { createRuntimeStatusAdapter } from "./createRuntimeStatusAdapter";

describe("createRuntimeStatusAdapter", () => {
  it("maps the authenticated bootstrap contracts into feature-owned records", async () => {
    const adapter = createRuntimeStatusAdapter({
      getRuntimeDiagnostics: vi.fn().mockResolvedValue(runtimeDiagnosticsEndpoint()),
      getVersionCheck: vi.fn().mockResolvedValue({
        availability: "available",
        current_version: "1.2.0",
        latest_version: "1.3.0",
        update_available: true,
        release_url: "https://example.test/releases/1.3.0",
        release_notes: "Safer streaming reconnects.",
        observed_at: "2026-07-17T07:00:00Z",
        reason_codes: [],
      }),
    });

    await expect(adapter.loadDiagnostics()).resolves.toMatchObject({
      completeness: "complete",
      runtime: { processId: 42, threadCount: 8, uptimeSeconds: 125.5 },
      eventPipeline: { openDeadLetters: 0, outboxPending: 2 },
      timeline: { eventCount: 21, highWaterSequence: 25 },
      agentCollection: {
        items: [{ clusterId: "cluster-a", connectionStatus: "online" }],
      },
    });
    await expect(adapter.checkVersion()).resolves.toMatchObject({
      currentVersion: "1.2.0",
      latestVersion: "1.3.0",
      updateAvailable: true,
    });
  });

  it("normalizes invalid API payload failures without swallowing aborts", async () => {
    const abort = new DOMException("cancelled", "AbortError");
    const adapter = createRuntimeStatusAdapter({
      getRuntimeDiagnostics: vi.fn().mockRejectedValue({ kind: "invalid-payload" }),
      getVersionCheck: vi.fn().mockRejectedValue(abort),
    });

    await expect(adapter.loadDiagnostics()).rejects.toMatchObject({ code: "invalid-response" });
    await expect(adapter.checkVersion()).rejects.toBe(abort);
  });
});

function runtimeDiagnosticsEndpoint() {
  return {
    observed_at: "2026-07-17T07:00:00Z",
    completeness: "complete" as const,
    runtime: {
      python_version: "3.13.5",
      python_implementation: "CPython",
      process_id: 42,
      cpu_count: 12,
      thread_count: 8,
      uptime_seconds: 125.5,
    },
    event_pipeline: {
      availability: "available" as const,
      open_dead_letters: 0,
      outbox_pending: 2,
      processing_statuses: [{ status: "processed", count: 20 }],
      consumer_lag: [{
        consumer: "timeline-projector",
        subject: "events.cluster-a",
        pending: 1,
        ack_pending: 0,
        redelivered: 0,
      }],
      reason_codes: [],
    },
    timeline: {
      availability: "available" as const,
      event_count: 21,
      oldest_occurred_at: "2026-07-17T06:00:00Z",
      newest_occurred_at: "2026-07-17T07:00:00Z",
      high_water_sequence: 25,
      retained_from_sequence: 5,
      reason_codes: [],
    },
    agent_collection: {
      availability: "available" as const,
      items: [{
        cluster_id: "cluster-a",
        name: "production-a",
        environment: "production",
        registration_status: "registered",
        connection_status: "online" as const,
        agent_id: "agent-a",
        agent_status: "ready",
        last_seen_at: "2026-07-17T06:59:59Z",
        capabilities: ["inventory"],
        latest_inventory: {
          status: "complete",
          source: "agent",
          collected_at: "2026-07-17T06:59:50Z",
          resource_count: 104,
        },
      }],
      reason_codes: [],
    },
    reason_codes: [],
  };
}

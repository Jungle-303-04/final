import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getRuntimeDiagnostics,
  getVersionCheck,
  RUNTIME_DIAGNOSTICS_PATH,
  VERSION_CHECK_PATH,
} from "./bootstrap-status";

describe("bootstrap status API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("uses the authenticated diagnostics path, preserves cancellation, and validates the bounded payload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(runtimeDiagnostics()));
    const controller = new AbortController();

    await expect(getRuntimeDiagnostics(controller.signal)).resolves.toMatchObject({
      completeness: "complete",
      runtime: { python_implementation: "CPython" },
      agent_collection: { items: [] },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      RUNTIME_DIAGNOSTICS_PATH,
      expect.objectContaining({
        credentials: "include",
        method: "GET",
        signal: controller.signal,
      }),
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ...runtimeDiagnostics(),
      unexpected_internal_state: "must-not-pass",
    }));
    await expect(getRuntimeDiagnostics()).rejects.toMatchObject({ kind: "invalid-payload" });
  });

  it("uses the version-check path and rejects unsafe unbounded response shapes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      availability: "available",
      current_version: "1.2.0",
      latest_version: "1.3.0",
      update_available: true,
      release_url: "https://example.test/releases/1.3.0",
      release_notes: "Bounded release notes.",
      observed_at: "2026-07-17T07:00:00Z",
      reason_codes: [],
    }));

    await expect(getVersionCheck()).resolves.toMatchObject({
      latest_version: "1.3.0",
      update_available: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      VERSION_CHECK_PATH,
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      availability: "available",
      current_version: "1.2.0",
      latest_version: "1.3.0",
      update_available: true,
      release_url: null,
      release_notes: "x".repeat(2_001),
      observed_at: "2026-07-17T07:00:00Z",
      reason_codes: [],
    }));
    await expect(getVersionCheck()).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

function runtimeDiagnostics() {
  return {
    observed_at: "2026-07-17T07:00:00Z",
    completeness: "complete",
    runtime: {
      python_version: "3.13.5",
      python_implementation: "CPython",
      process_id: 42,
      cpu_count: 12,
      thread_count: 8,
      uptime_seconds: 125.5,
    },
    event_pipeline: {
      availability: "available",
      open_dead_letters: 0,
      outbox_pending: 0,
      processing_statuses: [],
      consumer_lag: [],
      reason_codes: [],
    },
    timeline: {
      availability: "available",
      event_count: 21,
      oldest_occurred_at: "2026-07-17T06:00:00Z",
      newest_occurred_at: "2026-07-17T07:00:00Z",
      high_water_sequence: 25,
      retained_from_sequence: 5,
      reason_codes: [],
    },
    agent_collection: {
      availability: "available",
      items: [],
      reason_codes: [],
    },
    reason_codes: [],
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

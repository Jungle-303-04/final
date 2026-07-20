import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { getFleetSummary } from "./fleet";

const FLEET_SUMMARY = {
  clusters: [
    {
      cluster_id: "prod-seoul-01",
      name: "Production Seoul",
      health: "healthy",
      pods_running: 42,
      pods_total: 45,
      nodes_ready: 3,
      nodes_total: 3,
      open_incidents: 0,
      restarts_recent: 2,
      cpu_pct: 41.5,
      mem_pct: 68.2,
      last_seen_at: "2026-07-12T00:00:00Z",
      coverage: {
        inventory: {
          availability: "available",
          observed_at: "2026-07-12T00:00:00Z",
          reason_codes: [],
        },
        cpu: {
          availability: "available",
          observed_at: "2026-07-12T00:00:00Z",
          reason_codes: [],
        },
        memory: {
          availability: "available",
          observed_at: "2026-07-12T00:00:00Z",
          reason_codes: [],
        },
      },
    },
    {
      cluster_id: "dev-seoul-01",
      name: "Development Seoul",
      health: "stale",
      pods_running: 8,
      pods_total: 10,
      nodes_ready: 1,
      nodes_total: 2,
      open_incidents: 1,
      restarts_recent: 0,
      cpu_pct: null,
      mem_pct: null,
      last_seen_at: null,
    },
  ],
  totals: {
    clusters: 2,
    healthy: 1,
    warning: 0,
    critical: 0,
    stale: 1,
    unknown: 0,
    open_incidents: 1,
    pending_approvals: 2,
    running_workflows: 1,
    dead_letters: 0,
  },
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fleet summary API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the session-scoped Home fleet summary", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(FLEET_SUMMARY),
    );

    await expect(getFleetSummary()).resolves.toEqual(FLEET_SUMMARY);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/fleet/summary",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });

  it("preserves null telemetry when CPU or memory is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(FLEET_SUMMARY),
    );

    const summary = await getFleetSummary();

    expect(summary.clusters[1]).toMatchObject({
      health: "stale",
      cpu_pct: null,
      mem_pct: null,
      last_seen_at: null,
    });
  });

  it("rejects coverage that aliases an unavailable observation to no reason", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ...FLEET_SUMMARY,
      clusters: [{
        ...FLEET_SUMMARY.clusters[0],
        coverage: {
          ...FLEET_SUMMARY.clusters[0].coverage,
          cpu: { availability: "unavailable", observed_at: null, reason_codes: [] },
        },
      }],
    }));

    await expect(getFleetSummary()).rejects.toMatchObject({ kind: "invalid-payload" });
  });

  it("rejects an unknown health value", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        ...FLEET_SUMMARY,
        clusters: [{ ...FLEET_SUMMARY.clusters[0], health: "degraded" }],
      }),
    );

    await expect(getFleetSummary()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("rejects invalid aggregate counts instead of fabricating totals", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        ...FLEET_SUMMARY,
        totals: { ...FLEET_SUMMARY.totals, clusters: "two" },
      }),
    );

    await expect(getFleetSummary()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("preserves an unauthorized response as an API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "Not authenticated" }, 401),
    );

    await expect(getFleetSummary()).rejects.toMatchObject({
      kind: "unauthorized",
      status: 401,
      detail: "Not authenticated",
    } satisfies Partial<ApiError>);
  });
});

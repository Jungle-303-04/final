import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { getClusterConnectionStatus } from "./cluster-connection";

const CONNECTION_STATUS = {
  cluster_id: "cluster-1",
  connection_status: "online",
  refresh_after_seconds: 0.5,
  last_agent_id: "agent-cluster-1",
  last_seen_at: "2026-07-12T00:00:00Z",
  agents: [
    {
      workspace_id: "default",
      cluster_id: "cluster-1",
      agent_id: "agent-cluster-1",
      status: "connected",
      capabilities: ["command_receiver", "inventory_snapshot"],
      details: { heartbeat_source: "agent_api" },
      last_seen_at: "2026-07-12T00:00:00Z",
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-12T00:00:00Z",
    },
  ],
  connect_timeout_seconds: 300,
  connect_expires_at: null,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("cluster connection API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the current connection status and agent details", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(CONNECTION_STATUS),
    );

    await expect(
      getClusterConnectionStatus("cluster/one"),
    ).resolves.toEqual(CONNECTION_STATUS);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster%2Fone/connection-status",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });

  it("passes the caller AbortSignal to the request", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);
    controller.abort();

    await expect(
      getClusterConnectionStatus("cluster-1", controller.signal),
    ).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster-1/connection-status",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("accepts an explicitly contracted optional connection stage", async () => {
    const payload = { ...CONNECTION_STATUS, connection_stage: "ready" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getClusterConnectionStatus("cluster-1")).resolves.toEqual(payload);
  });

  it("rejects a connection stage outside the canonical lifecycle enum", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ...CONNECTION_STATUS, connection_stage: "connected-ish" }),
    );

    await expect(getClusterConnectionStatus("cluster-1")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("rejects an invalid connection status payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ...CONNECTION_STATUS, connect_timeout_seconds: "300" }),
    );

    await expect(getClusterConnectionStatus("cluster-1")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("rejects a browser-invented connection refresh interval", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ...CONNECTION_STATUS, refresh_after_seconds: 0 }),
    );

    await expect(getClusterConnectionStatus("cluster-1")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("preserves a forbidden response as a forbidden API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "Cluster access denied" }, 403),
    );

    await expect(getClusterConnectionStatus("cluster-1")).rejects.toMatchObject({
      kind: "forbidden",
      status: 403,
      detail: "Cluster access denied",
    } satisfies Partial<ApiError>);
  });
});

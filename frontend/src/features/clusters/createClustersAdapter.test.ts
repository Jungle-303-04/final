import { describe, expect, it, vi } from "vitest";
import { createClustersAdapter } from "./createClustersAdapter";

describe("Clusters adapter", () => {
  it("maps the server command and connection state without retaining the agent token separately", async () => {
    const endpoints = dependencies();
    const port = createClustersAdapter(endpoints);

    await expect(port.connect({ name: "Production", provider: "aws" })).resolves.toEqual({
      clusterId: "production-a1b2",
      installCommand: "curl one-line | kubectl apply -f -",
      expiresAt: "2026-07-14T06:00:00Z",
    });
    await expect(port.loadConnection("production-a1b2")).resolves.toEqual({
      status: "waiting",
      stage: "agent_connected",
      agentVersion: null,
      lastSeenAt: "2026-07-15T01:02:03Z",
    });
    await expect(port.disconnect("production-a1b2")).resolves.toBeUndefined();
    expect(endpoints.unregisterCluster).toHaveBeenCalledWith("production-a1b2", undefined);
  });

  it("rejects a multiline install command", async () => {
    const endpoints = dependencies();
    endpoints.connectCluster.mockResolvedValue({
      cluster_id: "production-a1b2",
      install_command: "curl one\nkubectl apply",
      expires_at: "2026-07-14T06:00:00Z",
    });

    await expect(createClustersAdapter(endpoints).connect({ name: "Production", provider: "aws" }))
      .rejects.toMatchObject({ code: "invalid-response" });
  });
});

function dependencies() {
  return {
    connectCluster: vi.fn(async () => ({
      cluster_id: "production-a1b2",
      install_command: "curl one-line | kubectl apply -f -",
      expires_at: "2026-07-14T06:00:00Z",
    })),
    getClusterConnectionStatus: vi.fn(async () => ({
      cluster_id: "production-a1b2",
      connection_status: "online",
      connection_stage: "agent_connected" as const,
      last_agent_id: "agent-1",
      last_seen_at: "2026-07-15T01:02:03Z",
      agents: [],
      connect_timeout_seconds: 60,
      connect_expires_at: "2026-07-15T01:03:03Z",
    })),
    unregisterCluster: vi.fn(async () => undefined),
  };
}

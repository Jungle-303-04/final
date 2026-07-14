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
      agentVersion: null,
      connectedAt: null,
    });
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
    getClusterConnectStatus: vi.fn(async () => ({
      status: "waiting" as const,
      agent_version: null,
      connected_at: null,
    })),
  };
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { connectCluster, getClusterConnectStatus } from "./cluster-connect";

afterEach(() => vi.restoreAllMocks());

describe("cluster connect API", () => {
  it("posts the typed provider request and keeps the one-time command in the response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      cluster_id: "production-a1b2",
      install_command: "curl -fsSL https://opsia.example/api/install/token | kubectl apply -f -",
      expires_at: "2026-07-14T06:00:00Z",
    }));

    await expect(connectCluster({ name: "Production", provider: "aws" })).resolves
      .toMatchObject({ cluster_id: "production-a1b2" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/connect",
      expect.objectContaining({
        body: JSON.stringify({ name: "Production", provider: "aws" }),
        credentials: "include",
        method: "POST",
      }),
    );
  });

  it("encodes the cluster identity for connection polling", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      status: "waiting",
      agent_version: null,
      connected_at: null,
    }));

    await getClusterConnectStatus("cluster / one");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster%20%2F%20one/connection",
      expect.objectContaining({ method: "GET" }),
    );
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  });
}

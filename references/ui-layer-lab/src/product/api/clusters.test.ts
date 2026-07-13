import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { listClusters } from "./clusters";

const CLUSTER = {
  workspace_id: "default",
  cluster_id: "cluster-1",
  name: "Development Cluster",
  environment: "development",
  status: "registered",
  settings: { role: "target", region: "ap-northeast-2" },
  connection_status: "online",
  last_agent_id: "agent-cluster-1",
  last_agent_seen_at: "2026-07-12T00:00:00Z",
  node_count: 2,
  pod_count: 20,
  incident_count: 1,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-12T00:00:00Z",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("clusters API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists session-visible clusters with the default limit of 100", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ clusters: [CLUSTER] }),
    );

    await expect(listClusters()).resolves.toEqual({ clusters: [CLUSTER] });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters?limit=100",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).not.toHaveProperty("body");
    expect(new Headers(init?.headers).get("accept")).toBe("application/json");
    expect(new Headers(init?.headers).has("x-service-csrf")).toBe(false);
  });

  it("uses an explicitly requested list limit without inventing pagination", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ clusters: [] }),
    );

    await expect(listClusters({ limit: 17 })).resolves.toEqual({ clusters: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters?limit=17",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("accepts an explicitly contracted optional provider without opening the strict row", async () => {
    const cluster = { ...CLUSTER, provider: "eks" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ clusters: [cluster] }),
    );

    await expect(listClusters()).resolves.toEqual({ clusters: [cluster] });
  });

  it("accepts the additive connection stage without opening the strict row", async () => {
    const cluster = { ...CLUSTER, connection_stage: "ready" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ clusters: [cluster] }),
    );

    await expect(listClusters()).resolves.toEqual({ clusters: [cluster] });
  });

  it("rejects a connection stage outside the canonical stage enum", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ clusters: [{ ...CLUSTER, connection_stage: "invented" }] }),
    );

    await expect(listClusters()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("rejects a provider outside the canonical provider enum", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ clusters: [{ ...CLUSTER, provider: "custom-cloud" }] }),
    );

    await expect(listClusters()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("passes the caller AbortSignal to the list request", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);
    controller.abort();

    await expect(listClusters({}, controller.signal)).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters?limit=100",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("preserves a 401 response as an unauthorized API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "Not authenticated" }, 401),
    );

    await expect(listClusters()).rejects.toMatchObject({
      kind: "unauthorized",
      status: 401,
      detail: "Not authenticated",
    } satisfies Partial<ApiError>);
  });

  it("preserves a structured 403 without turning it into an empty list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        detail: {
          code: "cluster_read_forbidden",
          detail: "Cluster access is restricted.",
        },
      }, 403),
    );

    await expect(listClusters()).rejects.toMatchObject({
      code: "cluster_read_forbidden",
      detail: "Cluster access is restricted.",
      kind: "forbidden",
      status: 403,
    } satisfies Partial<ApiError>);
  });

  it("preserves an unexpected server response as an HTTP failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "Service unavailable" }, 503),
    );

    await expect(listClusters()).rejects.toMatchObject({
      detail: "Service unavailable",
      kind: "http",
      status: 503,
    } satisfies Partial<ApiError>);
  });

  it("rejects invalid JSON before committing a cluster collection", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(listClusters()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("rejects cluster rows with an invalid known field type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ clusters: [{ ...CLUSTER, node_count: "two" }] }),
    );

    await expect(listClusters()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("rejects uncontracted top-level and cluster fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        clusters: [{ ...CLUSTER, invented_capability: true }],
        next_cursor: "not-in-the-backend-contract",
      }),
    );

    await expect(listClusters()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });
});

// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWorkloadDetail, workloadDetailSupported } from "./workloadDetailFeed";

// 실제 라이브 `GET /api/workloads/Deployment/target/cluster-agent` 200 응답 shape를
// 축약해 재현한다(관측 확인: replicas desired/ready/available, health, pods, coverage partial).
function workloadDetailResponse() {
  const resourceRef = (kind: string, name: string) => ({
    api_group: kind === "Pod" ? "" : "apps",
    version: "v1",
    kind,
    namespace: "target",
    name,
    uid: `${name}-uid`,
  });
  return {
    detail: {
      scope: { workspace_id: "default", cluster_id: "demo-server", namespaces: ["target"], freshness: "partial" },
      observation: {
        resource: resourceRef("Deployment", "cluster-agent"),
        health: "healthy",
        replicas: { desired: 1, ready: 1, available: 1, updated: 1, unavailable: 0 },
        labels: [{ key: "app", value: "cluster-agent" }],
        observed_at: "2026-07-21T06:58:18.470046+00:00",
      },
      coverage: {
        availability: "partial",
        observation_snapshot_id: "snap-1",
        latest_snapshot_id: "snap-1",
        observed_at: "2026-07-21T06:58:18.470046+00:00",
        reason_codes: ["source_resources_incomplete"],
      },
      pods: {
        availability: "partial",
        items: [{ resource: resourceRef("Pod", "cluster-agent-5446d9f768-t48mz"), health: "healthy", observed_at: "2026-07-21T06:58:18.470046+00:00" }],
        excluded_count: 0,
        reason_codes: [],
      },
      events: { availability: "available", items: [], excluded_count: 0, reason_codes: [] },
      log_stream: { availability: "available", stream_kind: "deployments", reason_codes: [] },
      capabilities: { scope: { workspace_id: "default", cluster_id: "demo-server", namespaces: ["target"], freshness: "partial" }, resource: resourceRef("Deployment", "cluster-agent"), revision: "rev-1", actions: ["restart"] },
      features: [{ name: "overview", availability: "available", reason_codes: [] }],
    },
  };
}

describe("useWorkloadDetail", () => {
  afterEach(() => vi.restoreAllMocks());

  it("issues the workload route with derived apiGroup/apiVersion and maps observed replicas/health/labels/pods", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(workloadDetailResponse()), { status: 200 }),
    );

    const rendered = renderHook(() => useWorkloadDetail("demo-server", "Deployment", "target", "cluster-agent"));
    await waitFor(() => expect(rendered.result.current.status).toBe("ready"));

    const view = rendered.result.current;
    expect(view.replicas).toEqual({ desired: 1, ready: 1, available: 1, updated: 1, unavailable: 0 });
    expect(view.health).toBe("healthy");
    expect(view.labels).toEqual([{ key: "app", value: "cluster-agent" }]);
    expect(view.pods.map((p) => p.name)).toEqual(["cluster-agent-5446d9f768-t48mz"]);
    expect(view.coverageAvailability).toBe("partial");
    expect(view.actions).toEqual(["restart"]);

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/api/workloads/Deployment/target/cluster-agent");
    expect(url).toContain("apiGroup=apps");
    expect(url).toContain("apiVersion=v1");
  });

  it("stays idle and issues no request for unsupported kinds", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const rendered = renderHook(() => useWorkloadDetail("demo-server", "ConfigMap", "target", "cfg"));
    expect(rendered.result.current.status).toBe("idle");
    expect(rendered.result.current.replicas).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(workloadDetailSupported("ConfigMap")).toBe(false);
    expect(workloadDetailSupported("Deployment")).toBe(true);
  });

  it("reports honest unavailable when the observation cannot be fetched", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 503 }));
    const rendered = renderHook(() => useWorkloadDetail("demo-server", "StatefulSet", "target", "db"));
    await waitFor(() => expect(rendered.result.current.status).toBe("unavailable"));
    expect(rendered.result.current.replicas).toBeNull();
  });
});

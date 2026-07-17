import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getPrometheusIntegration,
  PROMETHEUS_INTEGRATION_PATH,
  updatePrometheusIntegration,
} from "./prometheus-integration";

afterEach(() => vi.unstubAllGlobals());

const configuredResponse = {
  cluster_id: "cluster-a",
  revision: "revision-a",
  operation_id: "prometheus-integration-a",
  address: "https://prometheus.example.com",
  header_keys: ["Authorization", "X-Scope-OrgID"],
  state: "connected",
  error_code: null,
  receipt: null,
};

describe("Prometheus integration API", () => {
  it("loads one cluster configuration without accepting secret header values", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(configuredResponse)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPrometheusIntegration(" cluster-a ")).resolves.toEqual(configuredResponse);
    expect(PROMETHEUS_INTEGRATION_PATH).toBe("/api/integrations/prometheus");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/integrations/prometheus?cluster_id=cluster-a",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("updates the canonical URL and dynamic header record and validates the command receipt", async () => {
    const response = {
      ...configuredResponse,
      revision: "revision-b",
      operation_id: "prometheus-integration-b",
      state: "pending",
      receipt: {
        accepted: true,
        command_id: "prometheus-integration-b",
        event_id: "event-b",
        audit_event_id: "event-b",
        correlation_id: "correlation-b",
        status: "queued",
        audit_id: null,
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
      status: 202,
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updatePrometheusIntegration({
      clusterId: "cluster-a",
      prometheusUrl: "https://prometheus.example.com/",
      headers: {
        Authorization: "Bearer replacement",
        "X-Scope-OrgID": "tenant-a",
      },
    })).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      PROMETHEUS_INTEGRATION_PATH,
      expect.objectContaining({
        body: JSON.stringify({
          cluster_id: "cluster-a",
          prometheus_url: "https://prometheus.example.com/",
          headers: {
            Authorization: "Bearer replacement",
            "X-Scope-OrgID": "tenant-a",
          },
        }),
        credentials: "include",
        method: "PUT",
      }),
    );
  });

  it("rejects a response that leaks secret header values", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...configuredResponse,
      headers: { Authorization: "Bearer leaked" },
    }))));

    await expect(getPrometheusIntegration("cluster-a")).rejects.toMatchObject({
      kind: "invalid-payload",
    });
  });
});

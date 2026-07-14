import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  listMetricQueryPresets,
  runMetricQueryPreset,
} from "./metric-query-presets";
import { runMetricQueryPreset as publicRunMetricQueryPreset } from "./index";

const QUERY_PRESETS = {
  items: [
    {
      preset_id: "preset-pod-cpu",
      workspace_id: "default",
      cluster_id: "prod-seoul-01",
      name: "Pod CPU 사용량",
      description: "네임스페이스별 Pod CPU 사용량",
      source: "prometheus",
      query: "sum(rate(container_cpu_usage_seconds_total[5m])) by (namespace)",
      range_seconds: 900,
      step_seconds: 30,
      unit: "ratio",
      metadata: { owner: "platform" },
      created_by: "user-1",
      created_at: "2026-07-12T09:00:00Z",
      updated_at: "2026-07-12T09:30:00Z",
    },
  ],
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("saved metric query API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads saved queries for the selected cluster", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(QUERY_PRESETS));

    await expect(listMetricQueryPresets("prod-seoul-01")).resolves.toEqual(
      QUERY_PRESETS,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/prod-seoul-01/metric-query-presets",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("encodes the cluster id and forwards AbortSignal", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

    await expect(
      listMetricQueryPresets("prod/seoul", controller.signal),
    ).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/prod%2Fseoul/metric-query-presets",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("allows an empty saved-query list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ items: [] }),
    );

    await expect(listMetricQueryPresets("prod-seoul-01")).resolves.toEqual({
      items: [],
    });
  });

  it("rejects a malformed saved-query response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ items: [{ ...QUERY_PRESETS.items[0], query: 42 }] }),
    );

    await expect(listMetricQueryPresets("prod-seoul-01")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("preserves an unauthorized response as an API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "Not authenticated" }, 401),
    );

    await expect(listMetricQueryPresets("prod-seoul-01")).rejects.toMatchObject({
      kind: "unauthorized",
      status: 401,
      detail: "Not authenticated",
    } satisfies Partial<ApiError>);
  });

  it("runs one backend-owned preset without sending a request body", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        accepted: true,
        command_id: "cmd-preset-1",
        correlation_id: "corr-preset-1",
      }),
    );

    await expect(
      runMetricQueryPreset("prod/seoul", "preset cpu/5m"),
    ).resolves.toEqual({
      accepted: true,
      command_id: "cmd-preset-1",
      correlation_id: "corr-preset-1",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/prod%2Fseoul/metric-query-presets/preset%20cpu%2F5m/run",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("body");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toBeInstanceOf(Headers);
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Headers).get("x-service-csrf"))
      .toBe("same-origin");
  });

  it("exports the preset runner through the public API barrel", () => {
    expect(publicRunMetricQueryPreset).toBe(runMetricQueryPreset);
  });

  it("rejects contract drift in a preset run receipt", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        accepted: true,
        command_id: "cmd-preset-1",
        correlation_id: "corr-preset-1",
        status: "queued",
      }),
    );

    await expect(
      runMetricQueryPreset("cluster-1", "preset-1"),
    ).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });
});

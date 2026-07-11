import { describe, expect, it, vi } from "vitest";

import type { TopologyHierarchySnapshot } from "../contracts";
import { TopologyHttpError } from "../api";
import { HttpTopologyHierarchyGateway } from "./HttpTopologyHierarchyGateway";

const adapterId = "http-topology-hierarchy/v1";

function validSnapshot(): TopologyHierarchySnapshot {
  const metric = {
    state: "value",
    valueDecimal: "1.25",
    unitId: "core",
  } as const;

  return {
    schemaVersion: "topology-hierarchy/v1",
    workspaceId: "workspace/test team",
    snapshotRevision: "revision-0001",
    observedAt: "2026-07-11T01:02:03Z",
    dataOrigin: { kind: "live", adapterId },
    areaMetrics: [
      {
        metricId: "cpu.usage.cores",
        label: "CPU usage cores",
        unitId: "core",
        additive: true,
        order: 10,
      },
    ],
    defaultAreaMetricId: "cpu.usage.cores",
    completeness: { state: "complete" },
    freshness: {
      state: "fresh",
      receivedAt: "2026-07-11T01:02:04Z",
      staleAfterMs: 15000,
      observedAt: "2026-07-11T01:02:02.500Z",
      ageMs: 1500,
      reason: null,
    },
    clusters: [
      {
        kind: "cluster",
        entityKey: "cluster:test",
        clusterUid: "cluster-uid",
        displayName: "test-cluster",
        environmentLabel: "Test",
        health: "healthy",
        healthReason: "Ready",
        metrics: { "cpu.usage.cores": metric },
        nodes: [
          {
            kind: "node",
            entityKey: "node:test",
            resourceUid: "node-uid",
            displayName: "test-node",
            health: "healthy",
            healthReason: "Ready",
            metrics: { "cpu.usage.cores": metric },
            pods: [
              {
                kind: "pod",
                entityKey: "pod:test",
                resourceUid: "pod-uid",
                displayName: "test-pod",
                namespace: "default",
                phase: "Running",
                health: "healthy",
                healthReason: "Ready",
                metrics: { "cpu.usage.cores": metric },
              },
            ],
          },
        ],
      },
    ],
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function gateway(fetchImpl: typeof fetch) {
  return new HttpTopologyHierarchyGateway(
    {
      baseUrl: "https://control.example.test/",
      workspaceId: "workspace/test team",
      adapterId,
      credentials: "include",
    },
    {
      fetchImpl,
      authHeaders: () => ({ Authorization: "Bearer test-session-token" }),
      createRequestId: () => "request-001",
    },
  );
}

describe("HttpTopologyHierarchyGateway", () => {
  it("requests and validates one atomic live hierarchy snapshot", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ data: validSnapshot() }),
    );
    const subject = gateway(fetchImpl);
    const controller = new AbortController();

    const result = await subject.getSnapshot(controller.signal);

    expect(result.snapshotRevision).toBe("revision-0001");
    expect(subject.dataOrigin).toEqual({ kind: "live", adapterId });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://control.example.test/api/v1/workspaces/workspace%2Ftest%20team/topology/hierarchy-snapshots/current",
    );
    expect(init).toMatchObject({
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
    const headers = new Headers(init?.headers);
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer test-session-token");
    expect(headers.get("X-Request-ID")).toBe("request-001");
  });

  it("rejects structurally valid JSON that violates topology semantics", async () => {
    const invalid = validSnapshot();
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        data: {
          ...invalid,
          defaultAreaMetricId: "metric-that-does-not-exist",
        },
      }),
    );

    const failure = await gateway(fetchImpl)
      .getSnapshot(new AbortController().signal)
      .catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(TopologyHttpError);
    expect(failure).toMatchObject({
      code: "invalid_payload",
      category: "invalid_response",
      backendCode: "schema_incompatible",
      httpStatus: 200,
    });
    expect((failure as TopologyHttpError).validationIssues).toContainEqual({
      path: "data.defaultAreaMetricId",
      message: "must reference one areaMetrics entry",
    });
  });

  it("accepts stale freshness with a canonical reason", async () => {
    const source = validSnapshot();
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        data: {
          ...source,
          freshness: {
            state: "stale",
            receivedAt: "2026-07-11T01:02:20Z",
            staleAfterMs: 15000,
            observedAt: "2026-07-11T10:02:00+09:00",
            ageMs: 20000,
            reason: {
              code: "source_observation_stale",
              messageKey: "topology.freshness.source_stale",
              detail: null,
            },
          },
        },
      }),
    );

    await expect(
      gateway(fetchImpl).getSnapshot(new AbortController().signal),
    ).resolves.toMatchObject({ freshness: { state: "stale", ageMs: 20000 } });
  });

  it("accepts unknown freshness only with null observation fields and a reason", async () => {
    const source = validSnapshot();
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        data: {
          ...source,
          freshness: {
            state: "unknown",
            receivedAt: "2026-07-11T01:02:04Z",
            staleAfterMs: 15000,
            observedAt: null,
            ageMs: null,
            reason: {
              code: "source_observation_time_unknown",
              messageKey: "topology.freshness.source_time_unknown",
              detail: "No trustworthy source timestamp was available",
            },
          },
        },
      }),
    );

    await expect(
      gateway(fetchImpl).getSnapshot(new AbortController().signal),
    ).resolves.toMatchObject({ freshness: { state: "unknown", ageMs: null } });
  });

  it("rejects unknown freshness when response assembly predates the snapshot cut", async () => {
    const source = validSnapshot();
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        data: {
          ...source,
          freshness: {
            state: "unknown",
            receivedAt: "2026-07-11T01:02:02Z",
            staleAfterMs: 15000,
            observedAt: null,
            ageMs: null,
            reason: {
              code: "source_observation_time_unknown",
              messageKey: "topology.freshness.source_time_unknown",
              detail: null,
            },
          },
        },
      }),
    );

    const failure = await gateway(fetchImpl)
      .getSnapshot(new AbortController().signal)
      .catch((reason: unknown) => reason);

    expect((failure as TopologyHttpError).validationIssues).toContainEqual({
      path: "data.freshness.receivedAt",
      message:
        "must be greater than or equal to the snapshot projection observedAt",
    });
  });

  it("treats ageMs equal to staleAfterMs as fresh boundary", async () => {
    const source = validSnapshot();
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        data: {
          ...source,
          freshness: {
            state: "fresh",
            receivedAt: "2026-07-11T01:02:04Z",
            staleAfterMs: 15000,
            observedAt: "2026-07-11T01:01:49Z",
            ageMs: 15000,
            reason: null,
          },
        },
      }),
    );

    await expect(
      gateway(fetchImpl).getSnapshot(new AbortController().signal),
    ).resolves.toMatchObject({ freshness: { state: "fresh", ageMs: 15000 } });
  });

  it("rejects freshness age that does not equal the timestamp difference", async () => {
    const source = validSnapshot();
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        data: {
          ...source,
          freshness: { ...source.freshness, ageMs: 1499 },
        },
      }),
    );

    const failure = await gateway(fetchImpl)
      .getSnapshot(new AbortController().signal)
      .catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(TopologyHttpError);
    expect((failure as TopologyHttpError).validationIssues).toContainEqual({
      path: "data.freshness.ageMs",
      message:
        "must equal receivedAt minus freshness.observedAt in integer milliseconds",
    });
  });

  it("rejects stale at the inclusive fresh threshold", async () => {
    const source = validSnapshot();
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        data: {
          ...source,
          freshness: {
            state: "stale",
            receivedAt: "2026-07-11T01:02:04Z",
            staleAfterMs: 15000,
            observedAt: "2026-07-11T01:01:49Z",
            ageMs: 15000,
            reason: {
              code: "source_observation_stale",
              messageKey: "topology.freshness.source_stale",
              detail: null,
            },
          },
        },
      }),
    );

    const failure = await gateway(fetchImpl)
      .getSnapshot(new AbortController().signal)
      .catch((reason: unknown) => reason);

    expect((failure as TopologyHttpError).validationIssues).toContainEqual({
      path: "data.freshness.state",
      message: "stale requires ageMs greater than staleAfterMs",
    });
  });

  it("rejects freshness timestamps outside the source-cut-response order", async () => {
    const source = validSnapshot();
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        data: {
          ...source,
          freshness: {
            state: "fresh",
            receivedAt: "2026-07-11T01:02:04Z",
            staleAfterMs: 15000,
            observedAt: "2026-07-11T01:02:03.500Z",
            ageMs: 500,
            reason: null,
          },
        },
      }),
    );

    const failure = await gateway(fetchImpl)
      .getSnapshot(new AbortController().signal)
      .catch((reason: unknown) => reason);

    expect((failure as TopologyHttpError).validationIssues).toContainEqual({
      path: "data.freshness",
      message:
        "timestamps must satisfy freshness.observedAt <= snapshot observedAt <= receivedAt",
    });
  });

  it("rejects freshness millisecond fields outside the safe integer range", async () => {
    const source = validSnapshot();
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        data: {
          ...source,
          freshness: {
            ...source.freshness,
            staleAfterMs: Number.MAX_SAFE_INTEGER + 1,
          },
        },
      }),
    );

    await expect(
      gateway(fetchImpl).getSnapshot(new AbortController().signal),
    ).rejects.toMatchObject({
      category: "invalid_response",
      backendCode: "schema_incompatible",
    });
  });

  it("requires freshness receivedAt to use canonical UTC RFC 3339", async () => {
    const source = validSnapshot();
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        data: {
          ...source,
          freshness: {
            ...source.freshness,
            receivedAt: "2026-07-11T10:02:04+09:00",
          },
        },
      }),
    );

    await expect(
      gateway(fetchImpl).getSnapshot(new AbortController().signal),
    ).rejects.toMatchObject({
      category: "invalid_response",
      backendCode: "schema_incompatible",
    });
  });

  it("rejects area metric order outside the JavaScript safe integer range", async () => {
    const source = validSnapshot();
    const descriptor = source.areaMetrics[0];
    if (descriptor === undefined) throw new Error("Expected one area metric");
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        data: {
          ...source,
          areaMetrics: [
            { ...descriptor, order: Number.MAX_SAFE_INTEGER + 1 },
          ],
        },
      }),
    );

    await expect(
      gateway(fetchImpl).getSnapshot(new AbortController().signal),
    ).rejects.toMatchObject({
      category: "invalid_response",
      backendCode: "schema_incompatible",
    });
  });

  it("rejects duplicate metric order values before the UI can render an ambiguous catalog", async () => {
    const invalid = validSnapshot();
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        data: {
          ...invalid,
          areaMetrics: [
            ...invalid.areaMetrics,
            {
              metricId: "memory.usage.bytes",
              label: "Memory usage bytes",
              unitId: "By",
              additive: true,
              order: 10,
            },
          ],
        },
      }),
    );

    const failure = await gateway(fetchImpl)
      .getSnapshot(new AbortController().signal)
      .catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(TopologyHttpError);
    expect((failure as TopologyHttpError).validationIssues).toContainEqual({
      path: "data.areaMetrics",
      message:
        "order values must be unique so every client renders the same catalog order",
    });
  });

  it("maps HTTP permission failures without exposing backend text as UI copy", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(
        {
          error: {
            code: "permission_denied",
            message: "internal source-specific message",
            correlationId: "correlation-403",
          },
        },
        { status: 403 },
      ),
    );

    const failure = await gateway(fetchImpl)
      .getSnapshot(new AbortController().signal)
      .catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(TopologyHttpError);
    expect(failure).toMatchObject({
      code: "forbidden",
      category: "permission_denied",
      backendCode: "permission_denied",
      correlationId: "correlation-403",
      requestId: "request-001",
      httpStatus: 403,
    });
    expect((failure as Error).message).not.toContain("internal source-specific");
  });

  it("preserves Retry-After for rate-limit recovery", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(
        { error: { code: "rate_limited", message: "wait" } },
        { status: 429, headers: { "Retry-After": "3" } },
      ),
    );

    await expect(
      gateway(fetchImpl).getSnapshot(new AbortController().signal),
    ).rejects.toMatchObject({
      category: "rate_limited",
      retryAfterMs: 3000,
    });
  });

  it("passes cancellation through as AbortError instead of a live data error", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    const controller = new AbortController();
    const pending = gateway(fetchImpl).getSnapshot(controller.signal);

    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("maps fetch rejection to a retryable network category", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError("connection failed");
    });

    await expect(
      gateway(fetchImpl).getSnapshot(new AbortController().signal),
    ).rejects.toMatchObject({
      code: "network",
      category: "network",
      httpStatus: null,
    });
  });
});

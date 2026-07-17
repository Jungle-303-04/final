import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  connectTrafficSource,
  getTrafficSources,
  setTrafficSource,
  TRAFFIC_CONNECT_PATH,
  TRAFFIC_SOURCES_PATH,
  TRAFFIC_SOURCE_PATH,
  type TrafficSourceCommandPayload,
} from "./traffic-control";

describe("Traffic source control API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("serializes a canonical cluster scope and validates observed source descriptors", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(sources()));

    await expect(getTrafficSources({
      clusterIds: ["cluster-b", "cluster-a", "cluster-a"],
    })).resolves.toMatchObject({
      availability: "available",
      clusters: [{ active_source: "hubble" }],
    });

    expect(TRAFFIC_SOURCES_PATH).toBe("/api/traffic/sources");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/traffic/sources?clusters=cluster-a%2Ccluster-b",
    );
  });

  it("queues source selection with the exact confirmed scope and idempotency key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(receipt()));

    await expect(setTrafficSource(command(), "traffic-select-0001"))
      .resolves.toMatchObject({ command_id: "command-traffic-1", status: "queued" });

    expect(TRAFFIC_SOURCE_PATH).toBe("/api/traffic/source");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/traffic/source");
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.method).toBe("POST");
    expect(new Headers(request?.headers).get("Idempotency-Key")).toBe("traffic-select-0001");
    expect(JSON.parse(String(request?.body))).toEqual(command());
  });

  it("queues source connection through the dedicated audited command endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(receipt()));

    await expect(connectTrafficSource(command(), "traffic-connect-0001"))
      .resolves.toMatchObject({ audit_event_id: "event-traffic-1" });

    expect(TRAFFIC_CONNECT_PATH).toBe("/api/traffic/connect");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/traffic/connect");
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Idempotency-Key"))
      .toBe("traffic-connect-0001");
  });

  it("fails closed when the server fabricates an invalid source status", async () => {
    const fixture = sources();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ...fixture,
      clusters: [{
        ...fixture.clusters[0],
        sources: [{ ...fixture.clusters[0]?.sources[0], status: "connected" }],
      }],
    }));

    await expect(getTrafficSources()).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

function command(): TrafficSourceCommandPayload {
  return {
    scope: {
      workspace_id: "workspace-a",
      cluster_id: "cluster-a",
      namespaces: [],
      freshness: "live",
    },
    source_key: "hubble",
    capability_revision: "a".repeat(64),
    confirmation: true,
    reason: "Connect observed Hubble relay",
  };
}

function sources() {
  const scope = {
    workspace_id: "workspace-a",
    cluster_id: "cluster-a",
    namespaces: [],
    freshness: "live",
  } as const;
  return {
    availability: "available",
    coverage: {
      availability: "available",
      scopes: [scope],
      observed_at: "2026-07-17T08:00:00Z",
      reason_codes: [],
    },
    clusters: [{
      scope,
      freshness: "live",
      observed_at: "2026-07-17T08:00:00Z",
      active_source: "hubble",
      capability_revision: "a".repeat(64),
      cluster: {
        platform: "eks",
        cni: "cilium",
        dataplane_v2: false,
        kubernetes_version: "v1.33.1",
      },
      sources: [{
        key: "hubble",
        label: "Hubble",
        status: "available",
        version: "1.17.2",
        native: true,
        message: "relay endpoints are ready",
        actions: [{
          id: "connect",
          kind: "connect",
          label: "Connect Hubble",
          enabled: true,
          confirmation_required: true,
          reason_code: null,
        }],
      }],
      reason_codes: [],
    }],
    reason_codes: [],
  };
}

function receipt() {
  return {
    accepted: true,
    event_id: "event-traffic-1",
    audit_event_id: "event-traffic-1",
    command_id: "command-traffic-1",
    correlation_id: "correlation-traffic-1",
    status: "queued",
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

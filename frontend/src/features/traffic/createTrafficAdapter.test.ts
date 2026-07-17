import { describe, expect, it, vi } from "vitest";

import { createTrafficAdapter } from "./createTrafficAdapter";

describe("createTrafficAdapter", () => {
  it("maps unavailable observation evidence without substituting an empty graph", async () => {
    const port = createTrafficAdapter(endpoints());

    const overview = await port.getOverview({ clusterIds: ["cluster-a"], namespaces: [] });

    expect(overview).toMatchObject({
      observation: { availability: "unavailable", observedAt: null },
      summary: { totalFlowCount: null, deniedFlowCount: null },
      relationships: { edges: null },
    });
    expect(overview.scopeCoverage.scopes[0]).toMatchObject({
      clusterId: "cluster-a",
      freshness: "live",
    });
  });

  it("maps server-owned source descriptors and command receipts", async () => {
    const dependencies = endpoints();
    const port = createTrafficAdapter(dependencies);

    const sources = await port.getSources({ clusterIds: ["cluster-a"] });
    const receipt = await port.connectSource({
      scope: sources.clusters[0].scope,
      sourceKey: "hubble",
      capabilityRevision: "a".repeat(64),
      confirmation: true,
      idempotencyKey: "traffic-idempotency-1",
      reason: "Connect observed relay",
    });

    expect(sources.clusters[0]).toMatchObject({
      activeSource: "hubble",
      cluster: { cni: "cilium", dataplaneV2: false },
      sources: [{
        key: "hubble",
        actions: [{ kind: "connect", label: "Connect Hubble" }],
      }],
    });
    expect(dependencies.connectTrafficSource).toHaveBeenCalledWith(
      expect.objectContaining({
        source_key: "hubble",
        capability_revision: "a".repeat(64),
      }),
      "traffic-idempotency-1",
      undefined,
    );
    expect(receipt).toMatchObject({
      commandId: "cmd-traffic-1",
      auditEventId: "evt-traffic-1",
      correlationId: "corr-traffic-1",
    });
  });
});

function endpoints() {
  return {
    getTrafficOverview: vi.fn().mockResolvedValue(endpoint()),
    getTrafficSources: vi.fn().mockResolvedValue({
      availability: "available" as const,
      coverage: {
        availability: "available" as const,
        scopes: [endpoint().scope_coverage.scopes[0]],
        observed_at: "2026-07-17T01:00:00Z",
        reason_codes: [],
      },
      clusters: [{
        scope: endpoint().scope_coverage.scopes[0],
        freshness: "live" as const,
        observed_at: "2026-07-17T01:00:00Z",
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
          status: "available" as const,
          version: "1.17.2",
          native: true,
          message: "relay endpoints are ready",
          actions: [{
            id: "connect",
            kind: "connect" as const,
            label: "Connect Hubble",
            enabled: true,
            confirmation_required: true,
            reason_code: null,
          }],
        }],
        reason_codes: [],
      }],
      reason_codes: [],
    }),
    setTrafficSource: vi.fn(),
    connectTrafficSource: vi.fn().mockResolvedValue({
      accepted: true as const,
      command_id: "cmd-traffic-1",
      event_id: "evt-traffic-1",
      audit_event_id: "evt-traffic-1",
      correlation_id: "corr-traffic-1",
      status: "queued" as const,
    }),
  };
}

function endpoint() {
  return {
    scope_coverage: {
      availability: "available" as const,
      scopes: [{
        workspace_id: "workspace-a",
        cluster_id: "cluster-a",
        namespaces: [],
        freshness: "live" as const,
      }],
      observed_at: "2026-07-16T09:00:00Z",
      reason_codes: [],
    },
    observation: unavailable(),
    summary: { ...unavailable(), total_flow_count: null, denied_flow_count: null, external_flow_count: null },
    relationships: { ...unavailable(), edges: null },
  };
}

function unavailable() {
  return {
    availability: "unavailable" as const,
    observed_at: null,
    reason_codes: ["traffic_observation_not_integrated"],
  };
}

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getNamespaceScope,
  getUiPreferences,
  searchResourceIdentities,
  updateNamespaceScope,
  updateUiPreferences,
} from "./shell-state";

describe("shell state API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("serializes authorized namespace replacement and optimistic revision", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(namespaceScope()))
      .mockResolvedValueOnce(jsonResponse({
        ...namespaceScope(),
        actives: ["shop"],
        mode: "selected",
        can_clear_namespace: true,
        revision: 1,
        invalidation_generation: 1,
        event_id: "evt-1",
        audit_event_id: "evt-1",
      }));

    await getNamespaceScope("cluster-a");
    await updateNamespaceScope({
      clusterId: "cluster-a",
      namespaces: ["shop"],
      expectedRevision: 0,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/cluster/namespace-scope?cluster_id=cluster-a",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({
        cluster_id: "cluster-a",
        namespaces: ["shop"],
        expected_revision: 0,
      }),
      method: "POST",
    }));
  });

  it("validates exact resource identities and user preference persistence", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(resourceSearch()))
      .mockResolvedValueOnce(jsonResponse(preferences()))
      .mockResolvedValueOnce(jsonResponse({
        ...preferences(),
        preferences: { theme: "dark", locale: "ko" },
        revision: 1,
        event_id: "evt-2",
        audit_event_id: "evt-2",
      }));

    await searchResourceIdentities({
      q: " checkout ",
      clusters: ["cluster-a"],
      namespaces: ["cluster-a/shop"],
      resourceTypes: ["workload"],
    });
    await getUiPreferences();
    await updateUiPreferences({
      preferences: { theme: "dark", locale: "ko" },
      expectedRevision: 0,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/search?q=checkout&clusters=cluster-a&namespaces=cluster-a%2Fshop&resources.types=workload&include=none&globalNs=true&limit=12",
    );
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({
        preferences: { theme: "dark", locale: "ko" },
        expected_revision: 0,
      }),
      method: "PUT",
    }));
  });
});

function namespaceScope() {
  return {
    workspace_id: "workspace-a",
    cluster_id: "cluster-a",
    actives: [],
    mode: "all",
    accessible_namespaces: ["default", "shop"],
    accessible_namespace_count: 2,
    authoritative: true,
    can_clear_namespace: false,
    cache_scoped: false,
    namespace_rescope: "view_filter_and_stream_invalidation",
    revision: 0,
    invalidation_generation: 0,
    freshness: {
      observed_at: "2026-07-16T09:00:00Z",
      refresh_after_seconds: 30,
      completeness: "exact",
      reason_codes: [],
    },
  };
}

function preferences() {
  return {
    workspace_id: "workspace-a",
    user_id: "user-a",
    preferences: { theme: "system", locale: "en" },
    revision: 0,
    updated_at: null,
  };
}

function resourceSearch() {
  return {
    scopes: [{
      workspace_id: "workspace-a",
      cluster_id: "cluster-a",
      namespaces: ["shop"],
      freshness: "live",
    }],
    hits: [{
      id: "resource-a",
      cluster_id: "cluster-a",
      resource_type: "workload",
      resource: {
        api_group: "apps",
        version: "v1",
        kind: "Deployment",
        namespace: "shop",
        name: "checkout",
        uid: "uid-checkout",
      },
      matched_fields: ["name"],
      observed_at: "2026-07-16T09:00:00Z",
    }],
    total: 1,
    total_completeness: "exact",
    snapshot: {
      snapshot_revision: 42,
      authorization_revision: "auth-1",
      filter_fingerprint: "filter-1",
      observed_at: "2026-07-16T09:00:00Z",
      stale: false,
      partial_reason_codes: [],
    },
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

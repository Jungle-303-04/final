import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getHelmRelease,
  HELM_RELEASE_PATH,
  HELM_RELEASES_PATH,
  listHelmReleases,
} from "./helm-releases";

describe("Helm release API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("serializes only canonical scope filters for the release list", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(list()));

    await expect(listHelmReleases({
      clusterIds: ["cluster-b", "cluster-a", "cluster-a"],
      namespaces: ["storefront"],
    })).resolves.toMatchObject({ releases: [{ name: "storefront" }] });

    expect(HELM_RELEASES_PATH).toBe("/api/helm/releases");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/helm/releases?clusters=cluster-a%2Ccluster-b&namespaces=storefront",
    );
  });

  it("encodes the exact detail identity and rejects fabricated provider fields", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(detail()));

    await expect(getHelmRelease({
      clusterId: "cluster-a",
      namespace: "team/a",
      releaseName: "shop/front",
    })).resolves.toMatchObject({ detail: { commands: { availability: "unavailable" } } });

    expect(HELM_RELEASE_PATH).toBe("/api/helm/releases/{namespace}/{release_name}");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/helm/releases/team%2Fa/shop%2Ffront?cluster_id=cluster-a",
    );
  });

  it("fails closed when a list claims unavailable coverage without a reason", async () => {
    const fixture = list();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ...fixture,
      coverage: { ...fixture.coverage, availability: "unavailable", reason_codes: [] },
    }));

    await expect(listHelmReleases()).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

function list() {
  return {
    releases: [release()],
    coverage: {
      availability: "available",
      observed_at: "2026-07-16T09:00:00Z",
      reason_codes: [],
    },
    refresh_after_seconds: 30,
    post_mutation_refresh_after_seconds: 1.2,
  };
}

function detail() {
  return {
    detail: {
      release: release(),
      history: [],
      manifest: unavailable("helm_manifest_provider_not_integrated"),
      values: unavailable("helm_values_provider_not_integrated"),
      owned_resources: unavailable("owned_resources_not_correlated"),
      commands: unavailable("agent_helm_executor_not_integrated"),
    },
    refresh_after_seconds: 30,
    post_mutation_refresh_after_seconds: 1.2,
  };
}

function release() {
  return {
    scope: {
      workspace_id: "workspace-a",
      cluster_id: "cluster-a",
      namespaces: ["storefront"],
      freshness: "live",
    },
    name: "storefront",
    storage_namespace: "storefront",
    storage: {
      api_group: "",
      version: "v1",
      kind: "Secret",
      namespace: "storefront",
      name: "sh.helm.release.v1.storefront.v3",
      uid: "storage-3",
    },
    storage_resource_version: null,
    chart: null,
    chart_version: null,
    chart_reason_codes: [],
    app_version: null,
    status: "deployed",
    revision: 3,
    observed_at: "2026-07-16T09:00:00Z",
    resource_health: { ...unavailable("owned_resources_not_correlated"), health: null },
  };
}

function unavailable(reason_code: string) {
  return { availability: "unavailable", reason_code };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

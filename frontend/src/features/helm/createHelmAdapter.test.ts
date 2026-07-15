import { describe, expect, it, vi } from "vitest";

import { createHelmAdapter } from "./createHelmAdapter";

describe("createHelmAdapter", () => {
  it("keeps unavailable integrations explicit instead of casting provider data", async () => {
    const port = createHelmAdapter({
      listHelmReleases: vi.fn().mockResolvedValue(listEndpoint()),
      getHelmRelease: vi.fn().mockResolvedValue(detailEndpoint()),
    });

    const list = await port.listReleases({ clusterIds: ["cluster-a"] });
    const detail = await port.getRelease({
      clusterId: "cluster-a",
      namespace: "storefront",
      releaseName: "storefront",
    });

    expect(list.releases[0]).toMatchObject({
      chart: null,
      appVersion: null,
      resourceHealth: { availability: "unavailable" },
    });
    expect(detail).toMatchObject({
      manifest: { reasonCode: "helm_manifest_provider_not_integrated" },
      commands: { reasonCode: "agent_helm_executor_not_integrated" },
    });
  });
});

function listEndpoint() {
  return {
    releases: [releaseEndpoint()],
    coverage: { availability: "available" as const, observed_at: null, reason_codes: [] },
  };
}

function detailEndpoint() {
  return {
    detail: {
      release: releaseEndpoint(),
      history: [],
      manifest: unavailable("helm_manifest_provider_not_integrated"),
      values: unavailable("helm_values_provider_not_integrated"),
      owned_resources: unavailable("owned_resources_not_correlated"),
      commands: unavailable("agent_helm_executor_not_integrated"),
    },
  };
}

function releaseEndpoint() {
  return {
    scope: {
      workspace_id: "workspace-a",
      cluster_id: "cluster-a",
      namespaces: ["storefront"],
      freshness: "live" as const,
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
    chart: null,
    app_version: null,
    status: "deployed",
    revision: 3,
    observed_at: "2026-07-16T09:00:00Z",
    resource_health: { ...unavailable("owned_resources_not_correlated"), health: null },
  };
}

function unavailable(reason_code: string) {
  return { availability: "unavailable" as const, reason_code };
}

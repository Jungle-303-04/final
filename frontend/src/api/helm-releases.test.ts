import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkHelmReleaseUpgrades,
  getHelmRelease,
  getHelmReleaseUpgradeInfo,
  HELM_RELEASE_ARTIFACT_PATH,
  HELM_RELEASE_UPGRADE_PATH,
  HELM_RELEASE_UPGRADE_INFO_PATH,
  HELM_RELEASE_VERSIONS_PATH,
  HELM_RELEASE_PATH,
  HELM_RELEASES_PATH,
  listHelmReleases,
  listHelmReleaseVersions,
  startHelmArtifactRead,
  startHelmReleaseUpgrade,
  HELM_UPGRADE_CHECK_PATH,
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

  it("fails closed when a truncated owned-resource result omits its reason", async () => {
    const fixture = detail();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ...fixture,
      detail: {
        ...fixture.detail,
        owned_resources: {
          ...fixture.detail.owned_resources,
          availability: "partial",
          truncated: true,
          reason_codes: [],
        },
      },
    }));

    await expect(getHelmRelease({
      clusterId: "cluster-a",
      namespace: "storefront",
      releaseName: "storefront",
    })).rejects.toMatchObject({ kind: "invalid-payload" });
  });

  it("queues one revision-bound artifact read without browser-side Helm data", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(receipt()));

    await expect(startHelmArtifactRead({
      clusterId: "cluster-a",
      namespace: "team/a",
      releaseName: "shop/front",
      artifact: "manifest_diff",
      revision: 2,
      comparisonRevision: 3,
    })).resolves.toMatchObject({ command_id: "cmd-helm-1" });

    expect(HELM_RELEASE_ARTIFACT_PATH).toBe(
      "/api/helm/releases/{namespace}/{release_name}/artifacts",
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/helm/releases/team%2Fa/shop%2Ffront/artifacts",
    );
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.method).toBe("POST");
    expect(JSON.parse(String(request?.body))).toEqual({
      cluster_id: "cluster-a",
      artifact: "manifest_diff",
      revision: 2,
      comparison_revision: 3,
      all_values: false,
    });
  });

  it("queues a typed resource comparison through the same audited artifact route", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(receipt()));

    await expect(startHelmArtifactRead({
      clusterId: "cluster-a",
      namespace: "storefront",
      releaseName: "storefront",
      artifact: "resources_diff",
      revision: 2,
      comparisonRevision: 3,
    })).resolves.toMatchObject({ audit_event_id: "evt-helm-1" });

    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual({
      cluster_id: "cluster-a",
      artifact: "resources_diff",
      revision: 2,
      comparison_revision: 3,
      all_values: false,
    });
  });

  it("queues one confirmed revision-bound upgrade through the dedicated audited route", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(receipt()));

    await expect(startHelmReleaseUpgrade({
      clusterId: "cluster-a",
      namespace: "team/a",
      releaseName: "shop/front",
      expectedRevision: 3,
      catalogItemId: "catalog-redis",
      catalogVersion: "1.0.0",
      values: { "master.persistence.storageClass": "gp3" },
      confirmation: true,
      reason: "upgrade to selected chart",
    })).resolves.toMatchObject({ command_id: "cmd-helm-1" });

    expect(HELM_RELEASE_UPGRADE_PATH).toBe(
      "/api/helm/releases/{namespace}/{release_name}/upgrade",
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/helm/releases/team%2Fa/shop%2Ffront/upgrade",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      cluster_id: "cluster-a",
      expected_revision: 3,
      catalog_item_id: "catalog-redis",
      catalog_version: "1.0.0",
      values: { "master.persistence.storageClass": "gp3" },
      confirmation: true,
      reason: "upgrade to selected chart",
    });
  });

  it("reads server-resolved upgrade info, versions, and bounded batch decoration", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(upgradeInfo()))
      .mockResolvedValueOnce(jsonResponse(releaseVersions()))
      .mockResolvedValueOnce(jsonResponse(upgradeBatch()));

    await expect(getHelmReleaseUpgradeInfo({
      clusterId: "cluster-a",
      namespace: "team/a",
      releaseName: "shop/front",
    })).resolves.toMatchObject({ latest_version: "2.0.0", update_available: true });
    await expect(listHelmReleaseVersions({
      clusterId: "cluster-a",
      namespace: "team/a",
      releaseName: "shop/front",
    })).resolves.toMatchObject({
      versions: [{ version: "2.0.0" }, { version: "1.2.3" }],
    });
    await expect(checkHelmReleaseUpgrades({
      clusterIds: ["cluster-b", "cluster-a"],
      namespaces: ["team/a"],
    })).resolves.toMatchObject({ truncated: false });

    expect(HELM_RELEASE_UPGRADE_INFO_PATH).toBe(
      "/api/helm/releases/{namespace}/{release_name}/upgrade-info",
    );
    expect(HELM_RELEASE_VERSIONS_PATH).toBe(
      "/api/helm/releases/{namespace}/{release_name}/versions",
    );
    expect(HELM_UPGRADE_CHECK_PATH).toBe("/api/helm/upgrade-check");
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/helm/releases/team%2Fa/shop%2Ffront/upgrade-info?cluster_id=cluster-a",
      "/api/helm/releases/team%2Fa/shop%2Ffront/versions?cluster_id=cluster-a",
      "/api/helm/upgrade-check?clusters=cluster-a%2Ccluster-b&namespaces=team%2Fa",
    ]);
  });
});

function list() {
  return {
    releases: [release()],
    refresh_after_seconds: 30,
    post_mutation_refresh_after_seconds: 1.2,
    coverage: {
      availability: "available",
      observed_at: "2026-07-16T09:00:00Z",
      reason_codes: [],
    },
  };
}

function detail() {
  return {
    refresh_after_seconds: 10,
    post_mutation_refresh_after_seconds: 1.2,
    detail: {
      release: release(),
      history: [],
      manifest: unavailable("helm_manifest_provider_not_integrated"),
      values: unavailable("helm_values_provider_not_integrated"),
      owned_resources: ownedResources(),
      commands: unavailable("agent_helm_executor_not_integrated"),
    },
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
    chart: null,
    chart_version: null,
    chart_reason_codes: ["helm_chart_identity_unavailable"],
    app_version: null,
    status: "deployed",
    revision: 3,
    observed_at: "2026-07-16T09:00:00Z",
    resource_health: {
      availability: "available",
      health: "healthy",
      resource_count: 1,
      observed_at: "2026-07-16T09:01:00Z",
      reason_codes: [],
    },
  };
}

function upgradeInfo() {
  return {
    availability: "available",
    chart_name: "storefront",
    current_version: "1.2.3",
    latest_version: "2.0.0",
    update_available: true,
    source: chartSource(),
    observed_at: "2026-07-17T00:01:00Z",
    reason_codes: [],
    refresh_after_seconds: 10,
  };
}

function releaseVersions() {
  return {
    availability: "available",
    chart_name: "storefront",
    current_version: "1.2.3",
    source: chartSource(),
    versions: [
      { version: "2.0.0", app_version: "4.0.0", deprecated: false },
      { version: "1.2.3", app_version: "3.0.0", deprecated: false },
    ],
    observed_at: "2026-07-17T00:01:00Z",
    truncated: false,
    reason_codes: [],
    refresh_after_seconds: 10,
  };
}

function upgradeBatch() {
  return {
    releases: { "cluster-a/team/a/shop/front": upgradeInfo() },
    coverage: {
      availability: "available",
      observed_at: "2026-07-17T00:00:00Z",
      reason_codes: [],
    },
    truncated: false,
    reason_codes: [],
    refresh_after_seconds: 30,
  };
}

function chartSource() {
  return {
    source_id: "source-a",
    provider: "repository",
    name: "Stable",
    reference: "https://charts.example.test/stable",
    status: "active",
    actions: [],
    credentials_configured: false,
    observed_at: "2026-07-17T00:00:00Z",
  };
}

function ownedResources() {
  return {
    availability: "available",
    items: [{
      resource: {
        api_group: "apps",
        version: "v1",
        kind: "Deployment",
        namespace: "storefront",
        name: "storefront",
        uid: "deployment-storefront",
      },
      status: "Available",
      health: "healthy",
      observed_at: "2026-07-16T09:01:00Z",
    }],
    observed_at: "2026-07-16T09:01:00Z",
    truncated: false,
    reason_codes: [],
  };
}

function unavailable(reason_code: string) {
  return { availability: "unavailable", reason_code };
}

function receipt() {
  return {
    accepted: true,
    event_id: "evt-helm-1",
    audit_event_id: "evt-helm-1",
    correlation_id: "corr-helm-1",
    command_id: "cmd-helm-1",
    status: "queued",
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

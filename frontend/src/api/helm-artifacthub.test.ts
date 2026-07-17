import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getArtifactHubChart,
  HELM_ARTIFACTHUB_CHART_PATH,
  HELM_ARTIFACTHUB_SEARCH_PATH,
  searchArtifactHubCharts,
} from "./helm-artifacthub";

describe("ArtifactHub API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("preserves bounded discovery filters and typed trust metadata", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(searchPage()));

    await expect(searchArtifactHubCharts({
      query: "redis",
      offset: 20,
      limit: 20,
      sort: "stars",
      official: true,
      verified: true,
    })).resolves.toMatchObject({ items: [{ package_id: "pkg-redis" }], has_more: false });

    expect(HELM_ARTIFACTHUB_SEARCH_PATH).toBe("/api/helm/artifacthub/search");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/helm/artifacthub/search?q=redis&offset=20&limit=20&sort=stars&official=true&verified=true",
    );
  });

  it("loads one exact escaped chart version without accepting executable metadata", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(detail()));

    await expect(getArtifactHubChart({
      repository: "team/charts",
      chart: "redis/cache",
      version: "22.0.0+build",
    })).resolves.toMatchObject({ chart: { name: "redis" }, available_versions: [{ version: "22.0.0" }] });

    expect(HELM_ARTIFACTHUB_CHART_PATH).toBe(
      "/api/helm/artifacthub/charts/{repository}/{chart}/{version}",
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/helm/artifacthub/charts/team%2Fcharts/redis%2Fcache/22.0.0%2Bbuild",
    );
  });
});

function chart() {
  return {
    package_id: "pkg-redis",
    name: "redis",
    version: "22.0.0",
    app_version: "8.0",
    description: "Redis chart",
    stars: 12,
    deprecated: false,
    signed: true,
    repository: {
      name: "bitnami",
      url: "https://charts.bitnami.com/bitnami",
      official: true,
      verified_publisher: true,
    },
  };
}

function searchPage() {
  return {
    items: [chart()],
    total: 1,
    offset: 20,
    limit: 20,
    has_more: false,
    observed_at: "2026-07-17T08:00:00Z",
  };
}

function detail() {
  return {
    chart: chart(),
    readme: "# Redis",
    available_versions: [{ version: "22.0.0", app_version: "8.0" }],
    versions_truncated: false,
    observed_at: "2026-07-17T08:00:00Z",
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

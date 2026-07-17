import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteHelmChartSource,
  getHelmChartDetail,
  HELM_CHARTS_PATH,
  HELM_CHART_SOURCES_PATH,
  listHelmChartSources,
  registerHelmChartSource,
  refreshHelmRepository,
  HELM_REPOSITORY_UPDATE_PATH,
  searchHelmCharts,
} from "./helm-chart-sources";

describe("Helm chart source API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("lists one bounded workspace-authorized page with an opaque cursor", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(page()));

    await expect(listHelmChartSources({ limit: 100, cursor: "opaque/next==" }))
      .resolves.toMatchObject({ items: [{ source_id: "source-repository" }] });

    expect(HELM_CHART_SOURCES_PATH).toBe("/api/helm/chart-sources");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/helm/chart-sources?limit=100&cursor=opaque%2Fnext%3D%3D",
    );
  });

  it("registers an OCI source with a write-only basic credential", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(source({
      source_id: "source-oci",
      provider: "oci",
      reference: "registry.example.test/team/charts",
      credentials_configured: true,
    }), 201));

    await expect(registerHelmChartSource({
      provider: "oci",
      name: "Team charts",
      reference: "registry.example.test/team/charts",
      credential: { kind: "basic", username: "robot", password: "private-password" },
    })).resolves.toMatchObject({ source_id: "source-oci", credentials_configured: true });

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.method).toBe("POST");
    expect(new Headers(request?.headers).get("x-service-csrf")).toBe("same-origin");
    expect(JSON.parse(String(request?.body))).toEqual({
      provider: "oci",
      name: "Team charts",
      reference: "registry.example.test/team/charts",
      credential: { kind: "basic", username: "robot", password: "private-password" },
    });
  });

  it("omits credentials entirely for a public repository source", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(source(), 201));

    await registerHelmChartSource({
      provider: "repository",
      name: "Stable",
      reference: "https://charts.example.test/index.yaml",
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      provider: "repository",
      name: "Stable",
      reference: "https://charts.example.test/index.yaml",
    });
  });

  it("deletes one exact source identity and validates the durable mutation receipt", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      accepted: true,
      event_id: "event-delete-source",
      correlation_id: "correlation-delete-source",
      command_id: null,
    }));

    await expect(deleteHelmChartSource("source-repository", {
      provider: "repository",
      name: "Stable",
      reference: "https://charts.example.test/index.yaml",
    })).resolves.toEqual({
      accepted: true,
      event_id: "event-delete-source",
      correlation_id: "correlation-delete-source",
      command_id: null,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/helm/chart-sources/source-repository");
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.method).toBe("DELETE");
    expect(new Headers(request?.headers).get("x-service-csrf")).toBe("same-origin");
    expect(JSON.parse(String(request?.body))).toEqual({
      provider: "repository",
      name: "Stable",
      reference: "https://charts.example.test/index.yaml",
    });
  });

  it("refreshes one authorized repository and projects its audited observation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      source_id: "source-repository",
      chart_count: 42,
      observed_at: "2026-07-17T08:10:00Z",
      event_id: "event-refresh-source",
      correlation_id: "correlation-refresh-source",
    }));

    await expect(refreshHelmRepository("Team charts"))
      .resolves.toMatchObject({ source_id: "source-repository", chart_count: 42 });

    expect(HELM_REPOSITORY_UPDATE_PATH).toBe("/api/helm/repositories/{name}/update");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/helm/repositories/Team%20charts/update");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("rejects unsafe delete identities and invalid mutation receipts before projection", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      accepted: true,
      event_id: "event-delete-source",
      correlation_id: "",
      command_id: null,
    }));

    expect(() => deleteHelmChartSource("../other-source", {
      provider: "repository",
      name: "Stable",
      reference: "https://charts.example.test/index.yaml",
    })).toThrow(TypeError);
    await expect(deleteHelmChartSource("source-repository", {
      provider: "repository",
      name: "Stable",
      reference: "https://charts.example.test/index.yaml",
    })).rejects.toMatchObject({ kind: "invalid-payload" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when pagination is inconsistent or a response leaks credential identity", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ ...page(), has_more: true, next_cursor: null }))
      .mockResolvedValueOnce(jsonResponse({ ...source(), credential_ref: "must-not-leak" }, 201));

    await expect(listHelmChartSources()).rejects.toMatchObject({ kind: "invalid-payload" });
    await expect(registerHelmChartSource({
      provider: "repository",
      name: "Stable",
      reference: "https://charts.example.test/index.yaml",
    })).rejects.toMatchObject({ kind: "invalid-payload" });
  });

  it("rejects an invalid browser pagination request before fetch", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(() => listHelmChartSources({ limit: 101 })).toThrow(RangeError);
    expect(() => listHelmChartSources({ cursor: " " })).toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("searches the authorized dynamic chart catalog with exact source and version filters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(chartPage()));

    await expect(searchHelmCharts({
      query: "redis cache",
      sourceId: "source-repository",
      provider: "repository",
      allVersions: true,
      limit: 40,
    })).resolves.toMatchObject({ items: [{ name: "redis", version: "2.0.0" }] });

    expect(HELM_CHARTS_PATH).toBe("/api/helm/charts");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/helm/charts?query=redis+cache&source_id=source-repository&provider=repository&allVersions=true&limit=40",
    );
  });

  it("loads one exact source/chart/version detail and rejects untyped provider fields", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(chartDetail()))
      .mockResolvedValueOnce(jsonResponse({ ...chartDetail(), raw_values: "must-not-leak" }));

    await expect(getHelmChartDetail({
      sourceId: "source-repository",
      chart: "redis",
      version: "2.0.0+build.1",
    })).resolves.toMatchObject({ chart: { name: "redis" } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/helm/charts/source-repository/redis/2.0.0%2Bbuild.1",
    );

    await expect(getHelmChartDetail({
      sourceId: "source-repository",
      chart: "redis",
    })).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

function page() {
  return {
    items: [source()],
    limit: 50,
    has_more: false,
    next_cursor: null,
  };
}

function source(overrides: Record<string, unknown> = {}) {
  return {
    source_id: "source-repository",
    provider: "repository",
    name: "Stable",
    reference: "https://charts.example.test/index.yaml",
    status: "active",
    actions: ["delete"],
    credentials_configured: false,
    observed_at: "2026-07-17T08:00:00Z",
    ...overrides,
  };
}

function chartSummary() {
  return {
    source: source(),
    name: "redis",
    version: "2.0.0",
    app_version: "8.0",
    description: "Redis chart",
    deprecated: false,
  };
}

function chartPage() {
  return {
    availability: "available",
    items: [chartSummary()],
    total: 1,
    limit: 40,
    query: "redis cache",
    source_id: "source-repository",
    provider: "repository",
    all_versions: true,
    observed_at: "2026-07-17T08:00:00Z",
    truncated: false,
    reason_codes: [],
  };
}

function chartDetail() {
  return {
    availability: "available",
    chart: chartSummary(),
    versions: [{ version: "2.0.0", app_version: "8.0", deprecated: false }],
    values_schema: {
      availability: "unavailable",
      schema: null,
      reason_code: "helm_chart_values_schema_unavailable",
    },
    install: {
      availability: "unavailable",
      target: null,
      reason_code: "helm_chart_install_recipe_unavailable",
    },
    observed_at: "2026-07-17T08:00:00Z",
    truncated: false,
    reason_codes: [],
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

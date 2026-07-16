import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  HELM_CHART_SOURCES_PATH,
  listHelmChartSources,
  registerHelmChartSource,
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
    credentials_configured: false,
    observed_at: "2026-07-17T08:00:00Z",
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

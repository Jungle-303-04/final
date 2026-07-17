import { describe, expect, it, vi } from "vitest";

import { createHelmAdapter } from "./createHelmAdapter";
import { HelmPortFailure } from "./helmContract";

describe("createHelmAdapter chart sources", () => {
  it("maps repository and OCI sources without exposing workspace or credential identities", async () => {
    const endpoints = endpointDependencies();
    const port = createHelmAdapter(endpoints);

    const result = await port.listChartSources({ cursor: "next-page" });

    expect(endpoints.listHelmChartSources).toHaveBeenCalledWith(
      { cursor: "next-page" },
      undefined,
    );
    expect(result).toEqual({
      items: [
        {
          id: "source-repository",
          provider: "repository",
          name: "Stable",
          reference: "https://charts.example.test/index.yaml",
          status: "active",
          actions: ["delete"],
          credentialsConfigured: false,
          observedAt: "2026-07-17T08:00:00Z",
        },
        {
          id: "source-oci",
          provider: "oci",
          name: "Private OCI",
          reference: "registry.example.test/team/charts",
          status: "active",
          actions: [],
          credentialsConfigured: true,
          observedAt: null,
        },
      ],
      limit: 50,
      hasMore: false,
      nextCursor: null,
    });
    expect(JSON.stringify(result)).not.toContain("workspace");
    expect(JSON.stringify(result)).not.toContain("credential_ref");
  });

  it("forwards one write-only credential and returns only the safe source projection", async () => {
    const endpoints = endpointDependencies();
    const port = createHelmAdapter(endpoints);

    const result = await port.registerChartSource({
      provider: "oci",
      name: "Private OCI",
      reference: "registry.example.test/team/charts",
      credential: { kind: "bearer", token: "private-token" },
    });

    expect(endpoints.registerHelmChartSource).toHaveBeenCalledWith({
      provider: "oci",
      name: "Private OCI",
      reference: "registry.example.test/team/charts",
      credential: { kind: "bearer", token: "private-token" },
    }, undefined);
    expect(result).toMatchObject({ id: "source-oci", credentialsConfigured: true });
    expect(JSON.stringify(result)).not.toContain("private-token");
  });

  it("forwards the listed optimistic identity and maps the shared mutation receipt", async () => {
    const endpoints = endpointDependencies();
    const port = createHelmAdapter(endpoints);

    await expect(port.deleteChartSource({
      id: "source-repository",
      provider: "repository",
      name: "Stable",
      reference: "https://charts.example.test/index.yaml",
    })).resolves.toEqual({
      accepted: true,
      eventId: "event-delete-source",
      correlationId: "correlation-delete-source",
    });

    expect(endpoints.deleteHelmChartSource).toHaveBeenCalledWith(
      "source-repository",
      {
        provider: "repository",
        name: "Stable",
        reference: "https://charts.example.test/index.yaml",
      },
      undefined,
    );
  });

  it("maps an optimistic identity conflict to a safe refreshable port failure", async () => {
    const endpoints = endpointDependencies();
    endpoints.deleteHelmChartSource.mockRejectedValue({ kind: "http", status: 409 });
    const port = createHelmAdapter(endpoints);

    await expect(port.deleteChartSource({
      id: "source-repository",
      provider: "repository",
      name: "Stable",
      reference: "https://charts.example.test/index.yaml",
    })).rejects.toEqual(new HelmPortFailure("invalid-request"));
  });

  it("maps catalog search and detail through the existing chart-source port without inventing install authority", async () => {
    const endpoints = endpointDependencies();
    const port = createHelmAdapter(endpoints);

    const page = await port.searchCharts({
      query: "redis",
      sourceId: "source-repository",
      provider: "repository",
      allVersions: false,
      limit: 20,
    });
    const detail = await port.getChartDetail({
      sourceId: "source-repository",
      chart: "redis",
      version: "2.0.0",
    });

    expect(endpoints.searchHelmCharts).toHaveBeenCalledWith({
      query: "redis",
      sourceId: "source-repository",
      provider: "repository",
      allVersions: false,
      limit: 20,
    }, undefined);
    expect(page).toMatchObject({
      availability: "available",
      items: [{ source: { id: "source-repository" }, name: "redis", version: "2.0.0" }],
      total: 1,
    });
    expect(detail).toMatchObject({
      chart: { source: { id: "source-repository" }, name: "redis" },
      valuesSchema: { availability: "unavailable" },
      install: { availability: "unavailable" },
    });
    expect(JSON.stringify(detail)).not.toContain("raw_values");
  });
});

function endpointDependencies() {
  return {
    listHelmInstallTargets: vi.fn(),
    startHelmReleaseInstall: vi.fn(),
    searchHelmCharts: vi.fn().mockResolvedValue({
      availability: "available" as const,
      items: [{
        source: sourceEndpoint(),
        name: "redis",
        version: "2.0.0",
        app_version: "8.0",
        description: "Redis chart",
        deprecated: false,
      }],
      total: 1,
      limit: 20,
      query: "redis",
      source_id: "source-repository",
      provider: "repository" as const,
      all_versions: false,
      observed_at: "2026-07-17T08:00:00Z",
      truncated: false,
      reason_codes: [],
    }),
    getHelmChartDetail: vi.fn().mockResolvedValue({
      availability: "available" as const,
      chart: {
        source: sourceEndpoint(),
        name: "redis",
        version: "2.0.0",
        app_version: "8.0",
        description: "Redis chart",
        deprecated: false,
      },
      versions: [{ version: "2.0.0", app_version: "8.0", deprecated: false }],
      values_schema: {
        availability: "unavailable" as const,
        schema: null,
        reason_code: "helm_chart_values_schema_unavailable",
      },
      install: {
        availability: "unavailable" as const,
        target: null,
        reason_code: "helm_chart_install_recipe_unavailable",
      },
      observed_at: "2026-07-17T08:00:00Z",
      truncated: false,
      reason_codes: [],
    }),
    searchArtifactHubCharts: vi.fn(),
    getArtifactHubChart: vi.fn(),
    checkHelmReleaseUpgrades: vi.fn(),
    listHelmReleases: vi.fn(),
    getHelmRelease: vi.fn(),
    getHelmReleaseUpgradeInfo: vi.fn(),
    listHelmReleaseVersions: vi.fn(),
    startHelmArtifactRead: vi.fn(),
    startHelmReleaseUpgrade: vi.fn(),
    startHelmReleaseValuesPreview: vi.fn(),
    startHelmReleaseRollback: vi.fn(),
    startHelmReleaseUninstall: vi.fn(),
    refreshHelmRepository: vi.fn(),
    deleteHelmChartSource: vi.fn().mockResolvedValue({
      accepted: true as const,
      event_id: "event-delete-source",
      correlation_id: "correlation-delete-source",
      command_id: null,
    }),
    listHelmChartSources: vi.fn().mockResolvedValue({
      items: [
        sourceEndpoint(),
        sourceEndpoint({
          source_id: "source-oci",
          provider: "oci",
          name: "Private OCI",
          reference: "registry.example.test/team/charts",
          credentials_configured: true,
          actions: [],
          observed_at: null,
        }),
      ],
      limit: 50,
      has_more: false,
      next_cursor: null,
    }),
    registerHelmChartSource: vi.fn().mockResolvedValue(sourceEndpoint({
      source_id: "source-oci",
      provider: "oci",
      name: "Private OCI",
      reference: "registry.example.test/team/charts",
      credentials_configured: true,
      observed_at: null,
    })),
  };
}

function sourceEndpoint(overrides: Record<string, unknown> = {}) {
  return {
    source_id: "source-repository",
    provider: "repository" as const,
    name: "Stable",
    reference: "https://charts.example.test/index.yaml",
    status: "active" as const,
    credentials_configured: false,
    actions: ["delete"],
    observed_at: "2026-07-17T08:00:00Z",
    ...overrides,
  };
}

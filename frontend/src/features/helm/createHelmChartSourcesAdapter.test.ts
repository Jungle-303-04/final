import { describe, expect, it, vi } from "vitest";

import { createHelmAdapter } from "./createHelmAdapter";

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
          credentialsConfigured: false,
          observedAt: "2026-07-17T08:00:00Z",
        },
        {
          id: "source-oci",
          provider: "oci",
          name: "Private OCI",
          reference: "registry.example.test/team/charts",
          status: "active",
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
});

function endpointDependencies() {
  return {
    listHelmReleases: vi.fn(),
    getHelmRelease: vi.fn(),
    startHelmArtifactRead: vi.fn(),
    listHelmChartSources: vi.fn().mockResolvedValue({
      items: [
        sourceEndpoint(),
        sourceEndpoint({
          source_id: "source-oci",
          provider: "oci",
          name: "Private OCI",
          reference: "registry.example.test/team/charts",
          credentials_configured: true,
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
    observed_at: "2026-07-17T08:00:00Z",
    ...overrides,
  };
}

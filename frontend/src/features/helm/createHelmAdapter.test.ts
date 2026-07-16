import { describe, expect, it, vi } from "vitest";

import { createHelmAdapter, toHelmArtifactOperationResult } from "./createHelmAdapter";

describe("createHelmAdapter", () => {
  it("keeps unavailable integrations explicit instead of casting provider data", async () => {
    const port = createHelmAdapter({
      listHelmReleases: vi.fn().mockResolvedValue(listEndpoint()),
      getHelmRelease: vi.fn().mockResolvedValue(detailEndpoint()),
      startHelmArtifactRead: vi.fn().mockResolvedValue(receipt()),
    });

    const list = await port.listReleases({ clusterIds: ["cluster-a"] });
    const detail = await port.getRelease({
      clusterId: "cluster-a",
      namespace: "storefront",
      releaseName: "storefront",
    });
    const artifactReceipt = await port.readArtifact({
      clusterId: "cluster-a",
      namespace: "storefront",
      releaseName: "storefront",
      artifact: "manifest",
      revision: 3,
    });

    expect(list.releases[0]).toMatchObject({
      chart: null,
      appVersion: null,
      resourceHealth: {
        availability: "available",
        health: "healthy",
        resourceCount: 1,
      },
    });
    expect(list.refreshAfterSeconds).toBe(30);
    expect(list.postMutationRefreshAfterSeconds).toBe(1.2);
    expect(detail).toMatchObject({
      manifest: { reasonCode: "helm_manifest_provider_not_integrated" },
      ownedResources: {
        availability: "available",
        items: [{
          resource: { kind: "Deployment", name: "storefront" },
          health: "healthy",
        }],
      },
      commands: { reasonCode: "agent_helm_executor_not_integrated" },
      refreshAfterSeconds: 10,
      postMutationRefreshAfterSeconds: 1.2,
    });
    expect(artifactReceipt).toMatchObject({
      commandId: "cmd-helm-1",
      auditEventId: "evt-helm-1",
    });
  });

  it("preserves server-derived stale freshness without frontend inference", async () => {
    const port = createHelmAdapter({
      listHelmReleases: vi.fn().mockResolvedValue(listEndpoint("stale")),
      getHelmRelease: vi.fn().mockResolvedValue(detailEndpoint()),
      startHelmArtifactRead: vi.fn().mockResolvedValue(receipt()),
    });

    const list = await port.listReleases({ clusterIds: ["cluster-a"] });

    expect(list.releases[0]?.scope.freshness).toBe("stale");
  });

  it("accepts only a typed redacted artifact from a terminal operation event", () => {
    const result = toHelmArtifactOperationResult({
      result: {
        artifact: artifactResult(),
      },
    });
    const unsafe = toHelmArtifactOperationResult({
      result: {
        artifact: {
          ...artifactResult(),
          redaction_applied: false,
          content: "password=must-not-leak",
        },
      },
    });

    expect(result).toMatchObject({
      artifact: "manifest_diff",
      format: "unified-diff",
      revision: 2,
      comparisonRevision: 3,
      redactionApplied: true,
    });
    expect(unsafe).toBeNull();
  });

  it("accepts typed hook metadata while rejecting any raw hook manifest field", () => {
    const hooksDiff = {
      revision1: 2,
      revision2: 3,
      added: [],
      removed: [],
      modified: [{
        api_version: "batch/v1",
        kind: "Job",
        name: "migrate",
        namespace: "storefront",
        events: ["pre-upgrade"],
        weight: 2,
        delete_policies: ["hook-succeeded"],
        output_log_policies: ["hook-failed"],
        manifest_changed: true,
      }],
      unchanged: [],
      parse_error_count: 0,
    };
    const hookResult = structuredArtifactResult({
      artifact: "hooks_diff",
      hooks_diff: hooksDiff,
    });
    const parsed = toHelmArtifactOperationResult({
      result: { artifact: hookResult },
    });
    const unsafe = toHelmArtifactOperationResult({
      result: {
        artifact: {
          ...hookResult,
          hooks_diff: {
            ...hooksDiff,
            modified: [{
              ...hooksDiff.modified[0],
              manifest: "token=must-not-leak",
            }],
          },
        },
      },
    });

    expect(parsed).toMatchObject({
      artifact: "hooks_diff",
      format: "structured",
      hooksDiff: {
        modified: [{
          name: "migrate",
          events: ["pre-upgrade"],
          manifestChanged: true,
        }],
      },
    });
    expect(unsafe).toBeNull();
  });

  it("accepts a bounded typed resource diff with parse evidence", () => {
    const parsed = toHelmArtifactOperationResult({
      result: {
        artifact: structuredArtifactResult({
          artifact: "resources_diff",
          resources_diff: {
            revision1: 2,
            revision2: 3,
            added: [{
              api_version: "v1",
              kind: "Service",
              name: "storefront",
              namespace: "storefront",
            }],
            removed: [],
            modified: [{
              api_version: "apps/v1",
              kind: "Deployment",
              name: "storefront",
              namespace: "storefront",
              summary: "2 fields changed",
              field_count: 2,
              fields: [{
                path: "spec.replicas",
                old_value: 1,
                new_value: 3,
              }],
            }],
            unchanged: [],
            parse_error_count: 1,
          },
        }),
      },
    });

    expect(parsed).toMatchObject({
      artifact: "resources_diff",
      resourcesDiff: {
        added: [{ kind: "Service", name: "storefront" }],
        modified: [{
          fieldCount: 2,
          fields: [{ path: "spec.replicas", oldValue: 1, newValue: 3 }],
        }],
        parseErrorCount: 1,
      },
    });
  });
});

function listEndpoint(freshness: "live" | "stale" | "partial" | "disconnected" = "live") {
  return {
    releases: [releaseEndpoint(freshness)],
    refresh_after_seconds: 30,
    post_mutation_refresh_after_seconds: 1.2,
    coverage: { availability: "available" as const, observed_at: null, reason_codes: [] },
  };
}

function detailEndpoint() {
  return {
    refresh_after_seconds: 10,
    post_mutation_refresh_after_seconds: 1.2,
    detail: {
      release: releaseEndpoint(),
      history: [],
      manifest: unavailable("helm_manifest_provider_not_integrated"),
      values: unavailable("helm_values_provider_not_integrated"),
      owned_resources: {
        availability: "available" as const,
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
      },
      commands: unavailable("agent_helm_executor_not_integrated"),
    },
  };
}

function releaseEndpoint(freshness: "live" | "stale" | "partial" | "disconnected" = "live") {
  return {
    scope: {
      workspace_id: "workspace-a",
      cluster_id: "cluster-a",
      namespaces: ["storefront"],
      freshness,
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
    resource_health: {
      availability: "available" as const,
      health: "healthy",
      resource_count: 1,
      observed_at: "2026-07-16T09:01:00Z",
      reason_codes: [],
    },
  };
}

function unavailable(reason_code: string) {
  return { availability: "unavailable" as const, reason_code };
}

function receipt() {
  return {
    accepted: true as const,
    event_id: "evt-helm-1",
    audit_event_id: "evt-helm-1",
    correlation_id: "corr-helm-1",
    command_id: "cmd-helm-1",
    status: "queued" as const,
  };
}

function artifactResult() {
  const content = "--- revision-2.yaml\n+++ revision-3.yaml\n";
  return {
    artifact: "manifest_diff" as const,
    format: "unified_diff" as const,
    namespace: "storefront",
    release_name: "storefront",
    revision: 2,
    comparison_revision: 3,
    all_values: false,
    content,
    content_sha256: "0".repeat(64),
    content_bytes: new TextEncoder().encode(content).byteLength,
    source_bytes: 120,
    redaction_applied: true as const,
    truncated: false,
  };
}

function structuredArtifactResult(diff:
  | { artifact: "hooks_diff"; hooks_diff: Record<string, unknown> }
  | { artifact: "resources_diff"; resources_diff: Record<string, unknown> }) {
  const projection = diff.artifact === "hooks_diff" ? diff.hooks_diff : diff.resources_diff;
  return {
    artifact: diff.artifact,
    format: "structured",
    namespace: "storefront",
    release_name: "storefront",
    revision: 2,
    comparison_revision: 3,
    all_values: false,
    source_bytes: 240,
    redaction_applied: true,
    truncated: false,
    projection_sha256: "0".repeat(64),
    projection_bytes: new TextEncoder().encode(JSON.stringify(projection)).byteLength,
    ...(diff.artifact === "hooks_diff"
      ? { hooks_diff: diff.hooks_diff }
      : { resources_diff: diff.resources_diff }),
  };
}

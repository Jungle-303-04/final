import { describe, expect, it, vi } from "vitest";

import { createSettingsAdapter } from "./createSettingsAdapter";

describe("createSettingsAdapter", () => {
  it("maps server-owned permission decisions and unavailable evidence", async () => {
    const adapter = createSettingsAdapter({
      getSettingsAccessProfile: vi.fn().mockResolvedValue({
        workspace_id: "workspace-a",
        user_id: "user-a",
        cluster_id: "cluster-a",
        roles: ["user"],
        authority: "opsia_rbac",
        permissions: [{ permission: "cluster.read", category: "cluster", allowed: true }],
        kubernetes_rules: {
          status: "unavailable",
          reason_code: "subject_identity_not_delegated",
          detail: "No delegated Kubernetes subject.",
        },
        restricted_resource_types: {
          status: "unavailable",
          reason_code: "visibility_cause_not_observed",
          detail: "No denial-cause observation.",
        },
        revision: "a".repeat(64),
      }),
    });

    await expect(adapter.getAccessProfile("cluster-a")).resolves.toEqual({
      workspaceId: "workspace-a",
      userId: "user-a",
      clusterId: "cluster-a",
      roles: ["user"],
      authority: "opsia_rbac",
      permissions: [{ permission: "cluster.read", category: "cluster", allowed: true }],
      kubernetesRules: {
        status: "unavailable",
        reasonCode: "subject_identity_not_delegated",
        detail: "No delegated Kubernetes subject.",
      },
      restrictedResourceTypes: {
        status: "unavailable",
        reasonCode: "visibility_cause_not_observed",
        detail: "No denial-cause observation.",
      },
      revision: "a".repeat(64),
    });
  });

  it("maps an authenticated authorization failure to the feature boundary", async () => {
    const adapter = createSettingsAdapter({
      getSettingsAccessProfile: vi.fn().mockRejectedValue({ kind: "forbidden" }),
    });

    await expect(adapter.getAccessProfile("cluster-a")).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

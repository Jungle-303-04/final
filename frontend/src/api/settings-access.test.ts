import { afterEach, describe, expect, it, vi } from "vitest";

import { getSettingsAccessProfile, SETTINGS_ACCESS_PATH } from "./settings-access";

afterEach(() => vi.unstubAllGlobals());

describe("getSettingsAccessProfile", () => {
  it("requests one exact cluster and validates the effective-access contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      workspace_id: "workspace-a",
      user_id: "user-a",
      cluster_id: "cluster-a",
      roles: ["user"],
      authority: "opsia_rbac",
      permissions: [
        { permission: "cluster.read", category: "cluster", allowed: true },
        { permission: "pod.exec", category: "pod", allowed: false },
      ],
      kubernetes_rules: {
        status: "unavailable",
        reason_code: "subject_identity_not_delegated",
        detail: "The signed-in product identity is not delegated to Kubernetes.",
      },
      restricted_resource_types: {
        status: "unavailable",
        reason_code: "visibility_cause_not_observed",
        detail: "The missing-resource cause is not observed.",
      },
      revision: "a".repeat(64),
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSettingsAccessProfile(" cluster-a ")).resolves.toMatchObject({
      cluster_id: "cluster-a",
      authority: "opsia_rbac",
    });
    expect(SETTINGS_ACCESS_PATH).toBe("/api/settings/access");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/access?cluster_id=cluster-a",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});

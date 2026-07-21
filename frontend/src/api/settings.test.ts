import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getBrowserRefreshPolicies,
  getSettingsAccessProfile,
  getUiPreferences,
  updateUiPreferences,
  REFRESH_POLICIES_PATH,
  SETTINGS_ACCESS_PATH,
  SETTINGS_PATH,
} from "./settings";

const REVISION_HASH = "a".repeat(64);

describe("Settings API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("reads UI preferences from the settings endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(preferences()));

    await expect(getUiPreferences()).resolves.toMatchObject({
      preferences: { theme: "system", locale: "ko" },
      revision: 3,
      updated_at: null,
    });
    expect(SETTINGS_PATH).toBe("/api/settings");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/settings");
  });

  it("PUTs a preferences update with the CSRF header and expected revision", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ...preferences(),
      preferences: { theme: "dark", locale: "en" },
      revision: 4,
      event_id: "evt-1",
      audit_event_id: "aud-1",
    }));

    await expect(updateUiPreferences({
      preferences: { theme: "dark", locale: "en" },
      expectedRevision: 3,
    })).resolves.toMatchObject({ revision: 4, event_id: "evt-1", audit_event_id: "aud-1" });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(new Headers(init.headers).get("x-service-csrf")).toBe("same-origin");
    expect(JSON.parse(String(init.body))).toEqual({
      preferences: { theme: "dark", locale: "en" },
      expected_revision: 3,
    });
  });

  it("serializes cluster_id and namespace for the access profile query", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(accessProfile()));

    await expect(getSettingsAccessProfile({ clusterId: "cluster-a", namespace: "default" })).resolves.toMatchObject({
      cluster_id: "cluster-a",
      kubernetes_rules: { status: "observed" },
      restricted_resource_types: { status: "unavailable" },
    });
    expect(SETTINGS_ACCESS_PATH).toBe("/api/settings/access");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/settings/access?cluster_id=cluster-a&namespace=default");
  });

  it("reads the browser refresh policies", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(refreshPolicies()));

    await expect(getBrowserRefreshPolicies()).resolves.toMatchObject({ revision: REVISION_HASH });
    expect(REFRESH_POLICIES_PATH).toBe("/api/refresh-policies");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/refresh-policies");
  });

  it("fails closed when a settings response carries an unexpected field", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ...preferences(), unexpected: true }));
    await expect(getUiPreferences()).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

function preferences() {
  return {
    workspace_id: "workspace-a",
    user_id: "user-a",
    preferences: { theme: "system", locale: "ko" },
    revision: 3,
    updated_at: null,
  };
}

function accessProfile() {
  return {
    workspace_id: "workspace-a",
    user_id: "user-a",
    cluster_id: "cluster-a",
    roles: ["viewer"],
    authority: "opsia_rbac",
    permissions: [{ permission: "settings.view", category: "settings", allowed: true }],
    kubernetes_rules: {
      status: "observed",
      authority: "cluster_agent_service_account",
      namespace: "default",
      observed_at: "2026-07-16T09:00:00Z",
      subject: { kind: "ServiceAccount", namespace: "default", name: "opsia-agent" },
      resource_rules: [],
      non_resource_rules: [],
      truncated: false,
    },
    restricted_resource_types: {
      status: "unavailable",
      reason_code: "list_permission_not_observed",
      detail: "agent has not reported restricted resource types",
    },
    revision: REVISION_HASH,
  };
}

const REFRESH_POLICY_KEYS = [
  "dashboard", "issues_audit", "applications", "resource_list", "resource_list_slow",
  "changes", "metrics_kubernetes", "metrics_prometheus", "metrics_pvc", "metrics_rightsizing",
  "gitops_rows", "gitops_counts", "helm_list", "helm_detail", "cost_summary",
  "cost_trend", "cost_nodes", "port_sessions",
] as const;

function refreshPolicies() {
  const policy = {
    stale_after_seconds: 20,
    refresh_after_seconds: 30,
    keep_last_success: true,
    pause_when_hidden: true,
    event_invalidation: false,
    retry_after_seconds: null,
    retry_limit: null,
    post_mutation_refresh_after_seconds: null,
  };
  // The contract (`all_policy_keys_are_present`) guarantees every key; the strict
  // schema enforces the same, so the fixture must supply the full set.
  const policies = Object.fromEntries(REFRESH_POLICY_KEYS.map((key) => [key, policy]));
  return { revision: REVISION_HASH, policies };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

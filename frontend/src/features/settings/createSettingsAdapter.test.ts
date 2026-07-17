import { describe, expect, it, vi } from "vitest";

import { createSettingsAdapter } from "./createSettingsAdapter";

describe("createSettingsAdapter", () => {
  it("maps product decisions and observed cluster-agent execution access", async () => {
    const adapter = createSettingsAdapter({
      getSettingsAccessProfile: vi.fn().mockResolvedValue({
        workspace_id: "workspace-a",
        user_id: "user-a",
        cluster_id: "cluster-a",
        roles: ["user"],
        authority: "opsia_rbac",
        permissions: [{ permission: "cluster.read", category: "cluster", allowed: true }],
        kubernetes_rules: {
          status: "observed",
          authority: "cluster_agent_service_account",
          namespace: "shop",
          observed_at: "2026-07-17T00:00:00Z",
          subject: { kind: "ServiceAccount", namespace: "agent-system", name: "cluster-agent" },
          resource_rules: [{
            verbs: ["get", "list"],
            api_groups: [""],
            resources: ["pods"],
            resource_names: [],
            non_resource_urls: [],
          }],
          non_resource_rules: [],
          truncated: false,
        },
        restricted_resource_types: {
          status: "observed",
          authority: "cluster_agent_service_account",
          namespace: "shop",
          observed_at: "2026-07-17T00:00:00Z",
          completeness: "exact",
          reason_codes: [],
          items: [{
            api_group: "apps",
            version: "v1",
            resource: "deployments",
            kind: "Deployment",
            namespaced: true,
            reason_code: "list_permission_not_observed",
          }],
        },
        revision: "a".repeat(64),
      }),
      getPrometheusIntegration: vi.fn(),
      updatePrometheusIntegration: vi.fn(),
    });

    await expect(adapter.getAccessProfile("cluster-a")).resolves.toEqual({
      workspaceId: "workspace-a",
      userId: "user-a",
      clusterId: "cluster-a",
      roles: ["user"],
      authority: "opsia_rbac",
      permissions: [{ permission: "cluster.read", category: "cluster", allowed: true }],
      kubernetesRules: {
        status: "observed",
        authority: "cluster_agent_service_account",
        namespace: "shop",
        observedAt: "2026-07-17T00:00:00Z",
        subject: { kind: "ServiceAccount", namespace: "agent-system", name: "cluster-agent" },
        resourceRules: [{
          verbs: ["get", "list"],
          apiGroups: [""],
          resources: ["pods"],
          resourceNames: [],
          nonResourceUrls: [],
        }],
        nonResourceRules: [],
        truncated: false,
      },
      restrictedResourceTypes: {
        status: "observed",
        authority: "cluster_agent_service_account",
        namespace: "shop",
        observedAt: "2026-07-17T00:00:00Z",
        completeness: "exact",
        reasonCodes: [],
        items: [{
          apiGroup: "apps",
          version: "v1",
          resource: "deployments",
          kind: "Deployment",
          namespaced: true,
          reasonCode: "list_permission_not_observed",
        }],
      },
      revision: "a".repeat(64),
    });
  });

  it("maps an authenticated authorization failure to the feature boundary", async () => {
    const adapter = createSettingsAdapter({
      getSettingsAccessProfile: vi.fn().mockRejectedValue({ kind: "forbidden" }),
      getPrometheusIntegration: vi.fn(),
      updatePrometheusIntegration: vi.fn(),
    });

    await expect(adapter.getAccessProfile("cluster-a")).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("maps only Prometheus header names and the shared operation receipt", async () => {
    const getPrometheusIntegration = vi.fn().mockResolvedValue({
      cluster_id: "cluster-a",
      revision: "revision-a",
      operation_id: "operation-a",
      address: "https://prometheus.example.com",
      header_keys: ["Authorization"],
      state: "connected",
      error_code: null,
      receipt: null,
    });
    const updatePrometheusIntegration = vi.fn().mockResolvedValue({
      cluster_id: "cluster-a",
      revision: "revision-b",
      operation_id: "operation-b",
      address: "https://prometheus.example.com",
      header_keys: ["Authorization", "X-Scope-OrgID"],
      state: "pending",
      error_code: null,
      receipt: {
        accepted: true,
        command_id: "operation-b",
        event_id: "event-b",
        audit_event_id: "event-b",
        correlation_id: "correlation-b",
        status: "queued",
        audit_id: null,
      },
    });
    const adapter = createSettingsAdapter({
      getSettingsAccessProfile: vi.fn(),
      getPrometheusIntegration,
      updatePrometheusIntegration,
    });

    await expect(adapter.getPrometheusIntegration("cluster-a")).resolves.toEqual({
      clusterId: "cluster-a",
      configurationRevision: "revision-a",
      operationId: "operation-a",
      url: "https://prometheus.example.com",
      headerNames: ["Authorization"],
      state: "connected",
      errorCode: null,
      receipt: null,
    });
    await expect(adapter.updatePrometheusIntegration({
      clusterId: "cluster-a",
      url: "https://prometheus.example.com",
      headers: [
        { name: "Authorization", value: "Bearer replacement" },
        { name: "X-Scope-OrgID", value: "tenant-a" },
      ],
    })).resolves.toMatchObject({
      configurationRevision: "revision-b",
      receipt: {
        commandId: "operation-b",
        correlationId: "correlation-b",
      },
    });
    expect(updatePrometheusIntegration).toHaveBeenCalledWith({
      clusterId: "cluster-a",
      prometheusUrl: "https://prometheus.example.com",
      headers: {
        Authorization: "Bearer replacement",
        "X-Scope-OrgID": "tenant-a",
      },
    }, undefined);
  });

  it("rejects duplicate dynamic header names before a secret can be overwritten", async () => {
    const updatePrometheusIntegration = vi.fn();
    const adapter = createSettingsAdapter({
      getSettingsAccessProfile: vi.fn(),
      getPrometheusIntegration: vi.fn(),
      updatePrometheusIntegration,
    });

    await expect(adapter.updatePrometheusIntegration({
      clusterId: "cluster-a",
      url: "https://prometheus.example.com",
      headers: [
        { name: "Authorization", value: "first" },
        { name: "Authorization", value: "second" },
      ],
    })).rejects.toMatchObject({ code: "invalid-request" });
    expect(updatePrometheusIntegration).not.toHaveBeenCalled();
  });

  it("distinguishes preserving stored secrets from explicitly removing every header", async () => {
    const updatePrometheusIntegration = vi.fn().mockResolvedValue({
      cluster_id: "cluster-a",
      revision: "revision-b",
      operation_id: "operation-b",
      address: "https://prometheus.example.com",
      header_keys: [],
      state: "pending",
      error_code: null,
      receipt: null,
    });
    const adapter = createSettingsAdapter({
      getSettingsAccessProfile: vi.fn(),
      getPrometheusIntegration: vi.fn(),
      updatePrometheusIntegration,
    });

    await adapter.updatePrometheusIntegration({
      clusterId: "cluster-a",
      url: "https://prometheus.example.com",
    });
    expect(updatePrometheusIntegration).toHaveBeenNthCalledWith(1, {
      clusterId: "cluster-a",
      prometheusUrl: "https://prometheus.example.com",
      headers: undefined,
    }, undefined);

    await adapter.updatePrometheusIntegration({
      clusterId: "cluster-a",
      url: "https://prometheus.example.com",
      headers: [],
    });
    expect(updatePrometheusIntegration).toHaveBeenNthCalledWith(2, {
      clusterId: "cluster-a",
      prometheusUrl: "https://prometheus.example.com",
      headers: {},
    }, undefined);
  });
});

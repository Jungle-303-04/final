import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { providerResourceDetailSchema } from "./provider-resource-schemas";
import {
  getInventoryResourceDetail,
  listInventoryResources,
  listInventoryServices,
  listInventoryWorkloads,
} from "./inventory";

const RESOURCE = {
  inventory_key: "pod/default/api-abc",
  snapshot_id: "snapshot-123",
  workspace_id: "default",
  cluster_id: "cluster-1",
  resource_type: "pod",
  api_version: "v1",
  kind: "Pod",
  namespace: "default",
  name: "api-abc",
  uid: "uid-api-abc",
  resource_version: "42",
  status: "Running",
  health: "healthy",
  labels: { app: "api" },
  annotations: {},
  summary: { phase: "Running" },
  observed_at: "2026-07-12T10:30:00Z",
  first_seen_at: "2026-07-12T09:00:00Z",
  last_seen_at: "2026-07-12T10:30:00Z",
  deleted_at: null,
  created_at: "2026-07-12T09:00:00Z",
  updated_at: "2026-07-12T10:30:00Z",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("inventory resource API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists filtered resources with the bounded default limit", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ cluster_id: "cluster-1", resource_type: "pod", resources: [RESOURCE] }),
    );

    await expect(
      listInventoryResources("cluster/one", {
        resourceType: "pod",
        namespace: "default",
      }),
    ).resolves.toEqual({ cluster_id: "cluster-1", resource_type: "pod", resources: [RESOURCE] });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster%2Fone/inventory/resources?resource_type=pod&namespace=default&include_deleted=false&limit=1000",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("lists services and workloads through their dedicated collections", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ cluster_id: "cluster-1", resource_type: null, resources: [] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ cluster_id: "cluster-1", resource_type: null, resources: [] }),
      );

    await listInventoryServices("cluster-1");
    await listInventoryWorkloads("cluster-1", { namespace: "backend" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/clusters/cluster-1/inventory/services?limit=200",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/clusters/cluster-1/inventory/workloads?namespace=backend&limit=200",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("loads a resource detail with related resources and events", async () => {
    const payload = {
      cluster_id: "cluster-1",
      identity: { resource_type: "pod", kind: "Pod", name: "api-abc", namespace: "default" },
      resource: RESOURCE,
      provider_detail: null,
      access: {
        type: "subject",
        observed_at: "2026-07-17T00:00:00Z",
        subject: { kind: "ServiceAccount", namespace: "default", name: "api" },
        direct: [],
        inherited_from_groups: [],
        flat: [],
        truncated: false,
        used_by_pods: [{ namespace: "default", name: "api-abc" }],
      },
      related: { owner: [] },
      events: [],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(
      getInventoryResourceDetail("cluster-1", {
        resourceType: "pod",
        kind: "Pod",
        name: "api-abc",
        namespace: "default",
      }),
    ).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster-1/inventory/resource-detail?resource_type=pod&kind=Pod&name=api-abc&namespace=default&related_limit=100&event_limit=50",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("validates a redacted provider detail without accepting raw Kubernetes data", async () => {
    const providerDetail = {
      type: "aws-machine" as const,
      instance_type: "m6i.large",
      instance_id: "i-123",
      instance_state: "running",
      provider_id: "aws:///zone/i-123",
      iam_instance_profile: null,
      ssh_key_name: null,
      subnet_id: "subnet-a",
      secrets_backend: null,
      addresses: [{ type: "InternalIP", address: "10.0.0.2" }],
      conditions: [{
        type: "Ready",
        status: "True" as const,
        reason: null,
        message: null,
        last_transition_time: null,
      }],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      cluster_id: "cluster-1",
      identity: { resource_type: "awsmachine", kind: "AWSMachine", name: "node-a", namespace: "default" },
      resource: { ...RESOURCE, resource_type: "awsmachine", kind: "AWSMachine", name: "node-a" },
      provider_detail: providerDetail,
      related: {},
      events: [],
    }));

    const response = await getInventoryResourceDetail("cluster-1", {
      resourceType: "awsmachine",
      kind: "AWSMachine",
      name: "node-a",
      namespace: "default",
    });

    expect(response.provider_detail).toEqual(providerDetail);
    expect(JSON.stringify(response.provider_detail)).not.toContain("raw");
  });

  it("validates the bounded external-secret transport contract", async () => {
    const providerDetail = {
      type: "external-secret" as const,
      ready: true,
      last_sync_time: "2026-07-16T00:00:00Z",
      refresh_interval: "1h",
      target_name: "api",
      synced_resource_version: "42",
      binding_name: null,
      store_name: "vault",
      store_kind: "ClusterSecretStore",
      mappings: [{
        secret_key: "TOKEN",
        remote_key: "prod/api",
        remote_property: "token",
        remote_version: null,
      }],
      data_sources: [{ type: "extract" as const, detail: "prod/common" }],
      target_creation_policy: "Owner",
      target_deletion_policy: "Retain",
      template_type: null,
      template_engine_version: null,
      template_labels: [],
      template_annotations: [],
      conditions: [],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      cluster_id: "cluster-1",
      identity: { resource_type: "externalsecret", kind: "ExternalSecret", name: "api", namespace: "default" },
      resource: { ...RESOURCE, resource_type: "externalsecret", kind: "ExternalSecret", name: "api" },
      provider_detail: providerDetail,
      related: {},
      events: [],
    }));

    const response = await getInventoryResourceDetail("cluster-1", {
      resourceType: "externalsecret",
      kind: "ExternalSecret",
      name: "api",
      namespace: "default",
    });

    expect(response.provider_detail).toEqual(providerDetail);
    expect(JSON.stringify(response.provider_detail)).not.toContain("secretValue");
  });

  it("validates the bounded Gateway API route transport contract", async () => {
    const providerDetail = {
      type: "http-route" as const,
      hostnames: ["api.example.test"],
      parent_refs: [{
        api_version: null,
        kind: null,
        namespace: "default",
        name: "public",
      }],
      rules: [{
        matches: [{
          method: "GET",
          path_type: "PathPrefix",
          path_value: "/inventory",
          grpc_type: null,
          grpc_service: null,
          grpc_method: null,
          headers: [],
          query_params: [],
        }],
        backends: [{
          reference: {
            api_version: null,
            kind: null,
            namespace: "default",
            name: "inventory-api",
          },
          port: 8080,
          weight: 100,
        }],
        filters: [{ type: "RequestHeaderModifier", summary: "set: x-platform" }],
      }],
      parent_statuses: [],
      conditions: [],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      cluster_id: "cluster-1",
      identity: { resource_type: "httproute", kind: "HTTPRoute", name: "inventory", namespace: "default" },
      resource: { ...RESOURCE, resource_type: "httproute", kind: "HTTPRoute", name: "inventory" },
      provider_detail: providerDetail,
      related: {},
      events: [],
    }));

    const response = await getInventoryResourceDetail("cluster-1", {
      resourceType: "httproute",
      kind: "HTTPRoute",
      name: "inventory",
      namespace: "default",
    });

    expect(response.provider_detail).toEqual(providerDetail);
    expect(JSON.stringify(response.provider_detail)).not.toContain("authorization");
  });

  it("validates KEDA trigger metadata names without accepting trigger values", async () => {
    const providerDetail = {
      type: "keda-scaled-object" as const,
      state: "active" as const,
      target_ref: {
        api_version: null,
        kind: "Deployment",
        namespace: "default",
        name: "api",
      },
      scaling: { minimum: 1, maximum: 20, current: null },
      idle_replicas: null,
      polling_interval_seconds: 15,
      cooldown_period_seconds: 60,
      hpa_name: "keda-hpa-api",
      last_active_time: null,
      fallback_failure_threshold: null,
      fallback_replicas: null,
      restore_original_replicas: null,
      scale_up_stabilization_seconds: null,
      scale_down_stabilization_seconds: null,
      scaling_policies: [],
      triggers: [{
        type: "rabbitmq",
        name: "orders",
        authentication_ref: {
          api_version: null,
          kind: "TriggerAuthentication",
          namespace: "default",
          name: "rabbitmq",
        },
        metadata_keys: ["queueName"],
        redacted_metadata_count: 2,
      }],
      conditions: [],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      cluster_id: "cluster-1",
      identity: { resource_type: "scaledobject", kind: "ScaledObject", name: "api", namespace: "default" },
      resource: { ...RESOURCE, resource_type: "scaledobject", kind: "ScaledObject", name: "api" },
      provider_detail: providerDetail,
      related: {},
      events: [],
    }));

    const response = await getInventoryResourceDetail("cluster-1", {
      resourceType: "scaledobject",
      kind: "ScaledObject",
      name: "api",
      namespace: "default",
    });

    expect(response.provider_detail).toEqual(providerDetail);
    expect(JSON.stringify(response.provider_detail)).not.toContain("connectionString");
  });

  it.each([
    {
      type: "karpenter-ec2-node-class",
      ready: null,
      role: null,
      instance_profile: null,
      ami_family: null,
      ami_selector_terms: [],
      block_devices: [],
      subnet_selector_terms: [],
      security_group_selector_terms: [],
      metadata_options: null,
      resolved_amis: [],
      resolved_subnets: [],
      resolved_security_groups: [],
      tags: [],
      conditions: [],
    },
    {
      type: "karpenter-node-claim",
      state: "pending",
      instance_type: null,
      capacity_type: null,
      node_name: null,
      zone: null,
      architecture: null,
      node_pool: null,
      node_class_ref: null,
      image_id: null,
      expire_after: null,
      capacity: { cpu: null, memory: null, pods: null, ephemeral_storage: null },
      requirements: [],
      conditions: [],
    },
    {
      type: "karpenter-node-pool",
      ready: null,
      node_class_ref: null,
      limit_cpu: null,
      limit_memory: null,
      weight: null,
      current_cpu: null,
      current_memory: null,
      consolidation_policy: null,
      consolidate_after: null,
      expire_after: null,
      disruption_budgets: [],
      template_labels: [],
      template_taints: [],
      startup_taints: [],
      requirements: [],
      conditions: [],
    },
    {
      type: "keda-scaled-object",
      state: "unknown",
      target_ref: null,
      scaling: { minimum: null, maximum: null, current: null },
      idle_replicas: null,
      polling_interval_seconds: null,
      cooldown_period_seconds: null,
      hpa_name: null,
      last_active_time: null,
      fallback_failure_threshold: null,
      fallback_replicas: null,
      restore_original_replicas: null,
      scale_up_stabilization_seconds: null,
      scale_down_stabilization_seconds: null,
      scaling_policies: [],
      triggers: [],
      conditions: [],
    },
    {
      type: "keda-scaled-job",
      state: "unknown",
      job_target_name: null,
      strategy: null,
      polling_interval_seconds: null,
      successful_history_limit: null,
      failed_history_limit: null,
      minimum_replicas: null,
      maximum_replicas: null,
      triggers: [],
      conditions: [],
    },
    {
      type: "sbom-report",
      container_name: null,
      image: null,
      bom_format: null,
      spec_version: null,
      component_count: 0,
      dependency_count: 0,
      observed_component_count: 0,
      projected_component_count: 0,
      truncated: false,
      scanner_name: null,
      scanner_version: null,
      scanned_at: null,
      components: [],
      conditions: [],
    },
    {
      type: "vulnerability-report",
      container_name: null,
      image: null,
      os_family: null,
      os_name: null,
      os_end_of_service_life: null,
      scanner_name: null,
      scanner_version: null,
      scanned_at: null,
      severity: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
      observed_vulnerability_count: 0,
      projected_vulnerability_count: 0,
      truncated: false,
      vulnerabilities: [],
      conditions: [],
    },
    {
      type: "prometheus-rule",
      group_count: 0,
      total_rules: 0,
      total_alerts: 0,
      total_recordings: 0,
      projected_rules: 0,
      truncated: false,
      groups: [],
      conditions: [],
    },
    {
      type: "secret",
      secret_type: "Opaque",
      immutable: true,
      key_names: ["password"],
      conditions: [],
    },
    {
      type: "workflow",
      phase: "Succeeded",
      started_at: null,
      finished_at: null,
      progress: "1/1",
      estimated_duration_seconds: null,
      workflow_template_ref: null,
      argument_names: [],
      resource_durations: [],
      execution_nodes: [],
      observed_node_count: 0,
      projected_node_count: 0,
      truncated: false,
      problem_summaries: [],
      conditions: [],
    },
    {
      type: "tcp-route",
      hostnames: [],
      parent_refs: [],
      rules: [],
      parent_statuses: [],
      conditions: [],
    },
    {
      type: "tls-route",
      hostnames: [],
      parent_refs: [],
      rules: [],
      parent_statuses: [],
      conditions: [],
    },
  ])("accepts the strict $type resource-detail discriminator", (detail) => {
    expect(providerResourceDetailSchema.parse(detail)).toEqual(detail);
  });

  it("rejects unsafe vulnerability links and undeclared security fields", () => {
    const base = {
      type: "vulnerability-report" as const,
      container_name: "api",
      image: "registry.example.test/platform/api:1.2.3",
      os_family: "debian",
      os_name: "12",
      os_end_of_service_life: false,
      scanner_name: "Trivy",
      scanner_version: "0.64.1",
      scanned_at: "2026-07-16T00:00:00Z",
      severity: { critical: 1, high: 0, medium: 0, low: 0, unknown: 0 },
      observed_vulnerability_count: 1,
      projected_vulnerability_count: 1,
      truncated: false,
      conditions: [],
    };

    expect(() => providerResourceDetailSchema.parse({
      ...base,
      vulnerabilities: [{
        vulnerability_id: "CVE-2026-0001",
        severity: "CRITICAL",
        score: 9.8,
        package: "openssl",
        installed_version: "3.0.1",
        fixed_version: "3.0.2",
        primary_link: "https://user:password@example.test/CVE-2026-0001",
      }],
    })).toThrow();
    expect(() => providerResourceDetailSchema.parse({
      ...base,
      vulnerabilities: [],
      raw: { description: "must-not-enter" },
    })).toThrow();
  });

  it("rejects raw fields appended to an extension detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      cluster_id: "cluster-1",
      identity: { resource_type: "gatewayclass", kind: "GatewayClass", name: "prod", namespace: null },
      resource: { ...RESOURCE, resource_type: "gatewayclass", kind: "GatewayClass", name: "prod", namespace: null },
      provider_detail: {
        type: "gateway-class",
        controller_name: "example.test/controller",
        description: null,
        accepted: true,
        parameters_ref: null,
        conditions: [],
        raw: { credential: "must-not-enter" },
      },
      related: {},
      events: [],
    }));

    await expect(getInventoryResourceDetail("cluster-1", {
      resourceType: "gatewayclass",
      kind: "GatewayClass",
      name: "prod",
      namespace: null,
    })).rejects.toMatchObject({ kind: "invalid-payload", status: 200 });
  });

  it("rejects an unknown provider detail discriminator", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      cluster_id: "cluster-1",
      identity: { resource_type: "pod", kind: "Pod", name: "api-abc", namespace: "default" },
      resource: RESOURCE,
      provider_detail: { type: "forged-provider", conditions: [] },
      related: {},
      events: [],
    }));

    await expect(getInventoryResourceDetail("cluster-1", {
      resourceType: "pod",
      kind: "Pod",
      name: "api-abc",
      namespace: "default",
    })).rejects.toMatchObject({ kind: "invalid-payload", status: 200 });
  });

  it("rejects malformed resource rows instead of fabricating details", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        cluster_id: "cluster-1",
        resource_type: "pod",
        resources: [{ ...RESOURCE, name: 123 }],
      }),
    );

    await expect(
      listInventoryResources("cluster-1", { resourceType: "pod" }),
    ).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("preserves a missing resource response as a not-found API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "resource not found" }, 404),
    );

    await expect(
      getInventoryResourceDetail("cluster-1", {
        resourceType: "pod",
        kind: "Pod",
        name: "missing",
      }),
    ).rejects.toMatchObject({
      kind: "not-found",
      status: 404,
      detail: "resource not found",
    } satisfies Partial<ApiError>);
  });
});

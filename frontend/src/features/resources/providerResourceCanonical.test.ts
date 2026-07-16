import { describe, expect, it } from "vitest";

import { toProviderResourceDetail } from "./providerResourceCanonical";

describe("resource detail canonical mapping", () => {
  it("maps the strict CAPI cluster projection without deriving browser fields", () => {
    expect(toProviderResourceDetail({
      type: "capi-cluster",
      phase: "Provisioned",
      version: "v1.33.1",
      cluster_class: "prod",
      endpoint: "api.example.test:6443",
      provider: "AWS",
      paused: false,
      control_plane: { desired: 3, ready: 2, available: 2, up_to_date: 3 },
      workers: { desired: 5, ready: 4, available: 4, up_to_date: 5 },
      control_plane_ref: null,
      infrastructure_ref: {
        api_version: "infrastructure.cluster.x-k8s.io/v1beta2",
        kind: "AWSCluster",
        namespace: "prod",
        name: "prod",
      },
      conditions: [],
    })).toMatchObject({
      type: "capi-cluster",
      clusterClass: "prod",
      controlPlane: { desired: 3, ready: 2 },
      infrastructureRef: { kind: "AWSCluster", name: "prod" },
    });
  });

  it("rejects an unrecognized discriminator", () => {
    expect(() => toProviderResourceDetail({ type: "invented", conditions: [] } as never)).toThrow();
  });

  it("maps compliance controls without parsing their source payload in the browser", () => {
    expect(toProviderResourceDetail({
      type: "cluster-compliance-report",
      framework_id: "cis",
      framework_title: "CIS Kubernetes",
      framework_description: null,
      framework_version: "1.8",
      platform: "k8s",
      updated_at: "2026-07-16T00:00:00Z",
      pass_count: 4,
      fail_count: 1,
      controls: [{
        id: "1.1",
        name: "API server",
        description: "Protect API server",
        severity: "HIGH",
        total_pass: 4,
        total_fail: 1,
        check_ids: ["AVD-KCV-0001"],
      }],
      conditions: [],
    })).toMatchObject({
      type: "cluster-compliance-report",
      frameworkTitle: "CIS Kubernetes",
      controls: [{ id: "1.1", totalFail: 1 }],
    });
  });

  it("maps only the redacted external-secret projection", () => {
    expect(toProviderResourceDetail({
      type: "external-secret",
      ready: true,
      last_sync_time: "2026-07-16T00:00:00Z",
      refresh_interval: "1h",
      target_name: "api",
      synced_resource_version: "42",
      binding_name: null,
      store_name: "vault",
      store_kind: "ClusterSecretStore",
      mappings: [{ secret_key: "TOKEN", remote_key: "prod/api", remote_property: "token", remote_version: null }],
      data_sources: [{ type: "extract", detail: "prod/common" }],
      target_creation_policy: "Owner",
      target_deletion_policy: "Retain",
      template_type: null,
      template_engine_version: null,
      template_labels: [],
      template_annotations: [],
      conditions: [],
    })).toMatchObject({
      type: "external-secret",
      targetName: "api",
      mappings: [{ remoteKey: "prod/api" }],
    });
  });

  it("maps GCP machine-pool observations without applying browser defaults", () => {
    expect(toProviderResourceDetail({
      type: "gcp-managed-machine-pool",
      ready: false,
      node_pool_name: "workers",
      machine_type: "n2-standard-8",
      disk_type: "pd-balanced",
      disk_size_gb: 150,
      image_type: "COS_CONTAINERD",
      max_pods_per_node: 64,
      autoscaling_enabled: true,
      scaling: { minimum: 3, maximum: 20, current: 5 },
      auto_repair: true,
      auto_upgrade: false,
      node_locations: ["asia-northeast3-a"],
      labels: [{ key: "pool", value: "workers" }],
      taints: [{ key: "dedicated", value: "batch", effect: "NoSchedule" }],
      conditions: [],
    })).toMatchObject({
      type: "gcp-managed-machine-pool",
      nodePoolName: "workers",
      scaling: { minimum: 3, maximum: 20, current: 5 },
      autoscalingEnabled: true,
    });
  });

  it("maps Gateway API rules and parent status from the strict projection", () => {
    expect(toProviderResourceDetail({
      type: "http-route",
      hostnames: ["api.example.test"],
      parent_refs: [{ api_version: null, kind: null, namespace: "shop", name: "public" }],
      rules: [{
        matches: [{
          method: "GET",
          path_type: "PathPrefix",
          path_value: "/inventory",
          grpc_type: null,
          grpc_service: null,
          grpc_method: null,
          headers: [],
          query_params: [{ key: "region", value: "kr" }],
        }],
        backends: [{
          reference: { api_version: null, kind: null, namespace: "shop", name: "inventory" },
          port: 8080,
          weight: 100,
        }],
        filters: [{ type: "RequestHeaderModifier", summary: "set: x-platform" }],
      }],
      parent_statuses: [{
        reference: { api_version: null, kind: null, namespace: "shop", name: "public" },
        section_name: null,
        accepted: true,
        resolved_refs: true,
        conditions: [],
      }],
      conditions: [],
    })).toMatchObject({
      type: "http-route",
      rules: [{
        matches: [{ pathValue: "/inventory" }],
        backends: [{ port: 8080 }],
      }],
      parentStatuses: [{ accepted: true, resolvedRefs: true }],
    });
  });

  it("maps the server-owned Job state and nullable execution fields", () => {
    expect(toProviderResourceDetail({
      type: "job",
      state: "completed",
      succeeded: 4,
      failed: 1,
      active: 0,
      completions: 4,
      parallelism: 2,
      backoff_limit: 5,
      active_deadline_seconds: 600,
      ttl_seconds_after_finished: 3600,
      suspended: false,
      start_time: "2026-07-16T00:00:00Z",
      completion_time: "2026-07-16T00:03:00Z",
      terminal_reason: "CompletionsReached",
      terminal_message: null,
      conditions: [],
    })).toMatchObject({
      type: "job",
      state: "completed",
      backoffLimit: 5,
      activeDeadlineSeconds: 600,
    });
  });
});

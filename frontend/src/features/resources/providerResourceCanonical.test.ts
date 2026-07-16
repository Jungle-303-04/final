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

  it("maps Karpenter and KEDA observations without browser defaults or raw metadata", () => {
    expect(toProviderResourceDetail({
      type: "karpenter-node-claim",
      state: "registered",
      instance_type: "m7g.large",
      capacity_type: "spot",
      node_name: "ip-10-0-0-1",
      zone: "ap-northeast-2a",
      architecture: "arm64",
      node_pool: "general",
      node_class_ref: {
        api_version: "karpenter.k8s.aws",
        kind: "EC2NodeClass",
        namespace: null,
        name: "default",
      },
      image_id: "ami-123",
      expire_after: "720h",
      capacity: { cpu: "2", memory: "8Gi", pods: "29", ephemeral_storage: null },
      requirements: [{
        key: "kubernetes.io/arch",
        operator: "In",
        values: ["arm64"],
        min_values: null,
      }],
      conditions: [],
    })).toMatchObject({
      type: "karpenter-node-claim",
      state: "registered",
      nodeClassRef: { kind: "EC2NodeClass", name: "default" },
      capacity: { memory: "8Gi" },
    });

    expect(toProviderResourceDetail({
      type: "keda-scaled-object",
      state: "active",
      target_ref: { api_version: null, kind: "Deployment", namespace: "shop", name: "api" },
      scaling: { minimum: 1, maximum: 20, current: null },
      idle_replicas: null,
      polling_interval_seconds: 15,
      cooldown_period_seconds: 60,
      hpa_name: "keda-hpa-api",
      last_active_time: "2026-07-16T00:00:00Z",
      fallback_failure_threshold: null,
      fallback_replicas: null,
      restore_original_replicas: false,
      scale_up_stabilization_seconds: 30,
      scale_down_stabilization_seconds: 300,
      scaling_policies: [{ direction: "up", type: "Percent", value: 100, period_seconds: 15 }],
      triggers: [{
        type: "rabbitmq",
        name: "orders",
        authentication_ref: {
          api_version: null,
          kind: "TriggerAuthentication",
          namespace: "shop",
          name: "rabbitmq",
        },
        metadata_keys: ["queueName"],
        redacted_metadata_count: 2,
      }],
      conditions: [],
    })).toMatchObject({
      type: "keda-scaled-object",
      state: "active",
      scaling: { minimum: 1, maximum: 20 },
      triggers: [{ metadataKeys: ["queueName"], redactedMetadataCount: 2 }],
    });
  });

  it("maps bounded SBOM and vulnerability observations without reparsing raw reports", () => {
    expect(toProviderResourceDetail({
      type: "sbom-report",
      container_name: "api",
      image: "registry.example.test/platform/api:1.2.3",
      bom_format: "CycloneDX",
      spec_version: "1.6",
      component_count: 2,
      dependency_count: 1,
      observed_component_count: 2,
      projected_component_count: 2,
      truncated: false,
      scanner_name: "Trivy",
      scanner_version: "0.64.1",
      scanned_at: "2026-07-16T00:00:00Z",
      components: [{
        name: "fastapi",
        version: "0.116.0",
        type: "library",
        package_url: "pkg:pypi/fastapi@0.116.0",
        package_url_qualifiers_redacted: true,
        license: "MIT",
      }],
      conditions: [],
    })).toMatchObject({
      type: "sbom-report",
      componentCount: 2,
      components: [{
        packageUrl: "pkg:pypi/fastapi@0.116.0",
        packageUrlQualifiersRedacted: true,
      }],
    });

    expect(toProviderResourceDetail({
      type: "vulnerability-report",
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
      vulnerabilities: [{
        vulnerability_id: "CVE-2026-0001",
        severity: "CRITICAL",
        score: 9.8,
        package: "openssl",
        installed_version: "3.0.1",
        fixed_version: "3.0.2",
        primary_link: "https://security.example.test/CVE-2026-0001",
      }],
      conditions: [],
    })).toMatchObject({
      type: "vulnerability-report",
      severity: { critical: 1 },
      vulnerabilities: [{
        vulnerabilityId: "CVE-2026-0001",
        fixedVersion: "3.0.2",
      }],
    });
  });

  it("maps Prometheus rule groups and shared TCP/TLS route contracts", () => {
    expect(toProviderResourceDetail({
      type: "prometheus-rule",
      group_count: 1,
      total_rules: 2,
      total_alerts: 1,
      total_recordings: 1,
      projected_rules: 1,
      truncated: true,
      groups: [{
        name: "api",
        interval: "30s",
        rule_count: 2,
        alert_count: 1,
        recording_count: 1,
        rules: [{
          type: "alert",
          name: "HighErrorRate",
          expression: "rate(http_errors_total[5m]) > 0.05",
          duration: "10m",
          severity: "critical",
          summary: "API error rate is high",
          description: null,
          labels: [{ key: "severity", value: "critical" }],
        }],
      }],
      conditions: [],
    })).toMatchObject({
      type: "prometheus-rule",
      totalRules: 2,
      projectedRules: 1,
      truncated: true,
      groups: [{ rules: [{ name: "HighErrorRate" }] }],
    });

    expect(toProviderResourceDetail({
      type: "tls-route",
      hostnames: ["tls.example.test"],
      parent_refs: [],
      rules: [{
        matches: [],
        backends: [{
          reference: {
            api_version: null,
            kind: null,
            namespace: "network",
            name: "tls-api",
          },
          port: 9443,
          weight: null,
        }],
        filters: [],
      }],
      parent_statuses: [],
      conditions: [],
    })).toMatchObject({
      type: "tls-route",
      hostnames: ["tls.example.test"],
      rules: [{ backends: [{ port: 9443 }] }],
    });
  });
});

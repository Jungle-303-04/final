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
});

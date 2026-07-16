import { describe, expect, it } from "vitest";

import { toProviderResourceDetail } from "./providerResourceCanonical";

describe("CAPI provider resource canonical mapping", () => {
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
});

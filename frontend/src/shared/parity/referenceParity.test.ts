import { describe, expect, it } from "vitest";
import {
  buildScopeKey,
  canDispatchDirectCommand,
  type ClusterScope,
  type DirectCommandRequest,
} from "./referenceParity";

describe("reference parity contract", () => {
  it("canonicalizes the cluster scope and permits only confirmed direct commands", () => {
    const scope: ClusterScope = {
      workspaceId: "workspace-1",
      clusterId: "cluster-1",
      namespaces: ["payments", "default", "payments"],
      freshness: "live",
    };
    const request: DirectCommandRequest = {
      scope,
      resource: {
        apiGroup: "apps",
        version: "v1",
        kind: "Deployment",
        namespace: "payments",
        name: "checkout",
        uid: "uid-1",
      },
      action: "deployment.scale",
      diff: { replicas: { before: 2, after: 3 } },
      confirmation: true,
      reason: "scale checkout",
    };

    expect(buildScopeKey(scope)).toBe("workspace-1:cluster-1:default,payments");
    expect(canDispatchDirectCommand(request)).toBe(true);
    expect(canDispatchDirectCommand({ ...request, confirmation: false })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { gitOpsResourceDetailLocator, gitOpsResourceDetailPath } from "./gitOpsResourceDetailRoute";

describe("GitOps resource detail route", () => {
  it("round-trips every Kubernetes identity field without path inference", () => {
    const locator = {
      clusterId: "cluster-a",
      apiVersion: "kustomize.toolkit.fluxcd.io/v1",
      kind: "Kustomization",
      namespace: "flux-system",
      name: "storefront",
    };
    const path = gitOpsResourceDetailPath(locator);

    expect(gitOpsResourceDetailLocator(path.slice(path.indexOf("?")))).toEqual(locator);
  });

  it("rejects incomplete resource identity", () => {
    expect(gitOpsResourceDetailLocator("?cluster=cluster-a&kind=Application")).toBeNull();
  });
});

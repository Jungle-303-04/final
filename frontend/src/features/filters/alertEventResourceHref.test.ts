import { describe, expect, it } from "vitest";

import { alertEventResourceHref } from "./alertEventResourceHref";

describe("alert event resource navigation", () => {
  it("uses the canonical filter serializer for a namespaced resource", () => {
    expect(alertEventResourceHref({
      cluster: "cluster-2",
      namespace: "sandbox",
      kind: "Pod",
      name: "arena-0",
    })).toBe(
      "/resources?clusters=cluster-2&resources.types=pod&detail=Pod%2Fsandbox%2Farena-0",
    );
  });

  it("keeps cluster-scoped identities explicit", () => {
    expect(alertEventResourceHref({
      cluster: "cluster-2",
      namespace: null,
      kind: "Node",
      name: "worker-a",
    })).toBe(
      "/resources?clusters=cluster-2&resources.types=node&detail=Node%2F~%2Fworker-a",
    );
  });
});

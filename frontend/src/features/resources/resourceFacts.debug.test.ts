import { describe, expect, it } from "vitest";

import { toResourceFacts } from "./resourceFacts";

describe("Pod debug facts", () => {
  it("merges observed regular and ephemeral container identities without duplicates", () => {
    expect(toResourceFacts("pod", {
      containers: [{ name: "app" }, { name: "sidecar" }],
      ephemeral_containers: [{ name: "opsia-debug-abc123" }, { name: "app" }],
    })).toMatchObject({
      type: "pod",
      containerNames: ["app", "sidecar", "opsia-debug-abc123"],
    });
  });
});

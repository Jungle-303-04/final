import { describe, expect, it } from "vitest";

import { toResourceFacts } from "./resourceFacts";

describe("ResourceQuota facts", () => {
  it("preserves observed hard and used Kubernetes quantities", () => {
    expect(toResourceFacts("resourcequota", {
      hard: { pods: "20", "requests.cpu": "4" },
      used: { pods: "7", "requests.cpu": "1250m" },
    })).toEqual({
      type: "resource-quota",
      hard: [
        { key: "pods", value: "20" },
        { key: "requests.cpu", value: "4" },
      ],
      used: [
        { key: "pods", value: "7" },
        { key: "requests.cpu", value: "1250m" },
      ],
    });
  });
});

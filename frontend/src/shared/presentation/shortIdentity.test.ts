import { describe, expect, it } from "vitest";

import { shortIdentity } from "./shortIdentity";

describe("shortIdentity", () => {
  it("keeps both ends of long identifiers", () => {
    expect(shortIdentity("user-bf4a1234567890abcdefghijklmnop", 20))
      .toBe("user-bf4a1…hijklmnop");
  });

  it("separates a ReplicaSet-style revision from its workload name", () => {
    expect(shortIdentity("very-long-checkout-production-api-7d9f8c6b5d", 28))
      .toBe("very-lo…ion-api · 7d9f8c6b5d");
  });

  it("keeps both ends of a commit SHA", () => {
    expect(shortIdentity("f0123456789abcdef0123456789abcdef"))
      .toBe("f012345678…89abcdef");
  });

  it("uses the recognizable host label for cloud-internal node names", () => {
    expect(shortIdentity("ip-192-168-51-161.ap-northeast-2.compute.internal"))
      .toBe("ip-192-168-51-161");
  });
});

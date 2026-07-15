import { describe, expect, it } from "vitest";
import {
  gitOpsApplicationDetailIdFromRoute,
  gitOpsApplicationDetailPath,
} from "./gitOpsApplicationDetailRoute";

describe("GitOps application detail route identity", () => {
  it("encodes outbound IDs and preserves the single decoded wildcard value", () => {
    expect(gitOpsApplicationDetailPath("application/default/storefront"))
      .toBe("/gitops/detail/application%2Fdefault%2Fstorefront");
    expect(gitOpsApplicationDetailIdFromRoute("application/default/storefront"))
      .toBe("application/default/storefront");
    expect(gitOpsApplicationDetailIdFromRoute("application%2Fdefault")).toBe("application%2Fdefault");
  });

  it("rejects empty IDs without inventing a detail route", () => {
    expect(gitOpsApplicationDetailIdFromRoute(undefined)).toBeNull();
    expect(gitOpsApplicationDetailIdFromRoute("   ")).toBeNull();
    expect(() => gitOpsApplicationDetailPath(" ")).toThrow(RangeError);
  });
});

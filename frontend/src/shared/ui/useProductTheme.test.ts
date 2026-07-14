import { describe, expect, it } from "vitest";
import { resolveProductColorMode } from "./useProductTheme";

describe("resolveProductColorMode", () => {
  it("follows an explicit product theme and falls back to the product default", () => {
    expect(resolveProductColorMode("light")).toBe("light");
    expect(resolveProductColorMode("dark")).toBe("dark");
    expect(resolveProductColorMode()).toBe("dark");
  });
});

import { describe, expect, it } from "vitest";
import { resolveProductColorMode, resolveProductThemeSelection } from "./useProductTheme";

describe("resolveProductColorMode", () => {
  it("follows an explicit product theme and falls back to the product default", () => {
    expect(resolveProductColorMode("light")).toBe("light");
    expect(resolveProductColorMode("dark")).toBe("dark");
    expect(resolveProductColorMode()).toBe("dark");
  });
});

describe("resolveProductThemeSelection", () => {
  it("preserves the three supported choices and defaults to the operating system", () => {
    expect(resolveProductThemeSelection("system")).toBe("system");
    expect(resolveProductThemeSelection("dark")).toBe("dark");
    expect(resolveProductThemeSelection("light")).toBe("light");
    expect(resolveProductThemeSelection()).toBe("system");
    expect(resolveProductThemeSelection("unsupported")).toBe("system");
  });
});

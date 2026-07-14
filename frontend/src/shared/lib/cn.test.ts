import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("joins conditional inputs and resolves Tailwind conflicts", () => {
    expect(cn("px-2", [false, "text-sm"], { "px-4": true, hidden: false }))
      .toBe("text-sm px-4");
  });

  it("ignores component state callbacks instead of stringifying them", () => {
    expect(cn("block", () => "hidden")).toBe("block");
  });
});

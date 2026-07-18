// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BRAND_COLOR, BrandIcon } from "./BrandIcon";

describe("BrandIcon", () => {
  it.each(["github", "redis", "postgresql", "argocd"] as const)(
    "renders the official %s vector with an accessible product label",
    (brand) => {
      render(<BrandIcon brand={brand} label={`${brand} 제공자`} />);

      const icon = screen.getByRole("img", { name: `${brand} 제공자` });
      expect(icon.tagName).toBe("svg");
      expect(icon.querySelector("path")?.getAttribute("d")?.length)
        .toBeGreaterThan(20);
      expect(BRAND_COLOR[brand]).toMatch(/^#[\dA-F]{6}$/);
    },
  );

  it("reuses the established AWS provider asset", () => {
    render(<BrandIcon brand="aws" label="AWS 제공자" />);

    const icon = screen.getByRole("img", { name: "AWS 제공자" });
    expect(icon.getAttribute("data-brand")).toBe("aws");
    expect(icon.querySelectorAll("img")).toHaveLength(2);
  });
});

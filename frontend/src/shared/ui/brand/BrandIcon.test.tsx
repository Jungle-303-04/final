// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrandIcon } from "./BrandIcon";

describe("BrandIcon", () => {
  it("exposes an accessible label for every supported service identity", () => {
    const brands = ["github", "redis", "postgresql", "argocd", "aws"] as const;
    render(<>{brands.map((brand) => (
      <BrandIcon brand={brand} key={brand} label={`${brand} 제공자`} />
    ))}</>);

    for (const brand of brands) {
      expect(screen.getByRole("img", { name: `${brand} 제공자` })).toBeTruthy();
    }
  });
});

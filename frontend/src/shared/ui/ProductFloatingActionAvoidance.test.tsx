// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductFloatingActionAvoidance } from "./ProductFloatingActionAvoidance";

describe("ProductFloatingActionAvoidance", () => {
  it("uses the shared fixed-action geometry for its inline avoidance lane", () => {
    const { container } = render(
      <ProductFloatingActionAvoidance>Timeline content</ProductFloatingActionAvoidance>,
    );
    const avoidance = container.querySelector('[data-slot="product-floating-action-avoidance"]');

    expect(avoidance?.className).toContain("pe-[var(--product-floating-action-inline-clearance)]");
  });
});

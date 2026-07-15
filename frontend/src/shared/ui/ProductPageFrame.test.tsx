// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductPageFrame } from "./ProductPageFrame";

describe("ProductPageFrame", () => {
  it("reserves the shared floating-action clearance after its content", () => {
    const { container } = render(<ProductPageFrame>Timeline content</ProductPageFrame>);
    const frame = container.querySelector('[data-slot="product-page-frame"]');

    expect(frame?.className).toContain("pb-[var(--product-floating-action-clearance)]");
    expect(frame?.className).toContain("sm:pb-[var(--product-floating-action-clearance)]");
  });
});

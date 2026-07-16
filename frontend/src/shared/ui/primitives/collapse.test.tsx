// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Collapse, CollapseChevron } from "./collapse";

afterEach(cleanup);

describe("product-owned Collapse", () => {
  it("lazily mounts content once, then keeps closed content inert", () => {
    const { container, rerender } = render(
      <Collapse mountLazily open={false}>
        <button type="button">상세 작업</button>
      </Collapse>,
    );

    const collapse = container.querySelector<HTMLElement>('[data-slot="collapse"]');
    const content = container.querySelector<HTMLElement>('[data-slot="collapse-content"]');
    expect(collapse?.getAttribute("data-state")).toBe("closed");
    expect(collapse?.className).toContain("grid-rows-[0fr]");
    expect(collapse?.className).toContain("motion-reduce:transition-none");
    expect(content?.getAttribute("aria-hidden")).toBe("true");
    expect(content?.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("button", { name: "상세 작업" })).toBeNull();

    rerender(
      <Collapse mountLazily open>
        <button type="button">상세 작업</button>
      </Collapse>,
    );
    expect(collapse?.getAttribute("data-state")).toBe("open");
    expect(collapse?.className).toContain("grid-rows-[1fr]");
    expect(content?.hasAttribute("aria-hidden")).toBe(false);
    expect(content?.hasAttribute("inert")).toBe(false);
    expect(screen.getByRole("button", { name: "상세 작업" })).toBeTruthy();

    rerender(
      <Collapse mountLazily open={false}>
        <button type="button">상세 작업</button>
      </Collapse>,
    );
    expect(content?.getAttribute("aria-hidden")).toBe("true");
    expect(content?.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("button", { name: "상세 작업" })).toBeNull();
  });

  it("uses one decorative disclosure caret with reduced-motion-safe rotation", () => {
    const { rerender } = render(<CollapseChevron open={false} />);
    const chevron = document.querySelector<HTMLElement>('[data-slot="collapse-chevron"]');

    expect(chevron?.getAttribute("aria-hidden")).toBe("true");
    expect(chevron?.getAttribute("class")).toContain("motion-reduce:transition-none");
    expect(chevron?.getAttribute("class")).not.toContain("rotate-90");

    rerender(<CollapseChevron open />);
    expect(chevron?.getAttribute("class")).toContain("rotate-90");
  });
});

function assertCollapseTypeContracts() {
  // @ts-expect-error Collapse state is always explicit and controlled by its owner
  void <Collapse>내용</Collapse>;
}

void assertCollapseTypeContracts;

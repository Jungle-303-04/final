// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./button";

afterEach(cleanup);

describe("product-owned Button", () => {
  it("keeps native semantics and accessible visual-state contracts", () => {
    render(
      <Button className="w-full" disabled variant="outline">
        실행
      </Button>,
    );

    const button = screen.getByRole("button", { name: "실행" });
    expect(button.getAttribute("data-slot")).toBe("button");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.className).toContain("w-full");
    expect(button.className).toContain("motion-reduce:transition-none");
    expect(button.className).toContain("forced-colors:disabled:opacity-100");
    expect(button.className).toContain("forced-colors:focus-visible:outline-[Highlight]");
  });

  it("preserves the canonical slot against unsafe runtime props", () => {
    const unsafeProps = {
      "data-slot": "unsafe-button",
    } as unknown as Parameters<typeof Button>[0];

    render(<Button {...unsafeProps}>다시 시도</Button>);

    expect(screen.getByRole("button", { name: "다시 시도" }).getAttribute("data-slot"))
      .toBe("button");
  });
});

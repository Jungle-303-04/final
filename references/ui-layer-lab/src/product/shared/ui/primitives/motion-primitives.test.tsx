// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Toggle } from "./toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

afterEach(cleanup);

describe("product motion primitives", () => {
  it("disables Toggle transitions when reduced motion is requested", () => {
    render(<Toggle aria-label="필터" pressed />);

    expect(screen.getByRole("button", { name: "필터" }).className)
      .toContain("motion-reduce:transition-none");
  });

  it("disables Tooltip enter and exit animation when reduced motion is requested", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delay={0}>
        <Tooltip>
          <TooltipTrigger render={<button type="button" />}>도움말 열기</TooltipTrigger>
          <TooltipContent>현재 상태 설명</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    await user.hover(screen.getByRole("button", { name: "도움말 열기" }));
    const tooltip = await waitFor(() => {
      const element = document.querySelector<HTMLElement>('[data-slot="tooltip-content"]');
      expect(element).toBeTruthy();
      return element as HTMLElement;
    });
    expect(tooltip.className).toContain("motion-reduce:data-open:animate-none");
    expect(tooltip.className).toContain("motion-reduce:data-closed:animate-none");
    expect(tooltip.className).toContain("motion-reduce:duration-0");
  });
});

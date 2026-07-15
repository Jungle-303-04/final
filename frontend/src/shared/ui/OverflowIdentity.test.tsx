// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OverflowIdentity } from "./OverflowIdentity";
import { TooltipProvider } from "./primitives/tooltip";

afterEach(cleanup);

describe("OverflowIdentity", () => {
  it("keeps the full identity available to keyboard focus", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delay={0}>
        <OverflowIdentity value="ip-192-168-26-122.ap-northeast-2.compute.internal" />
      </TooltipProvider>,
    );

    await user.tab();

    expect(document.querySelector('[data-slot="overflow-identity"]'))
      .toBe(document.activeElement);
    await waitFor(() => {
      expect(document.querySelector('[data-slot="tooltip-content"]')?.textContent)
        .toBe("ip-192-168-26-122.ap-northeast-2.compute.internal");
    });
  });

  it("copies the full value from the selectable tooltip", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <TooltipProvider delay={0}>
        <OverflowIdentity value="run-1234567890abcdef1234567890abcdef" />
      </TooltipProvider>,
    );

    await user.tab();
    const tooltip = await waitFor(() => {
      const element = document.querySelector<HTMLElement>('[data-copy-value]');
      expect(element).toBeTruthy();
      return element!;
    });
    await user.click(tooltip);
    expect(writeText).toHaveBeenCalledWith("run-1234567890abcdef1234567890abcdef");
  });
});

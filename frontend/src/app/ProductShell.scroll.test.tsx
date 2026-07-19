// @vitest-environment jsdom

import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  installMatchMedia,
  renderShell,
  replaceProperty,
} from "./__tests__/ProductShellInteractionSupport";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ProductShell surface scroll contract", () => {
  it("returns the product viewport to the top after a surface transition", async () => {
    installMatchMedia(false);
    const scrollTo = vi.fn();
    const restoreScrollTo = replaceProperty(HTMLElement.prototype, "scrollTo", scrollTo);
    const user = userEvent.setup();

    try {
      renderShell();
      scrollTo.mockClear();

      await user.click(screen.getByRole("link", { name: "이슈" }));

      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({
        behavior: "auto",
        left: 0,
        top: 0,
      }));
    } finally {
      restoreScrollTo();
    }
  });
});

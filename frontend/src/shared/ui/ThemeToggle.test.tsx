// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { ThemeToggle } from "./ThemeToggle";

afterEach(cleanup);

describe("ThemeToggle", () => {
  it("offers operating-system, dark, and light choices", async () => {
    const user = userEvent.setup();
    const select = vi.fn();

    render(
      <I18nProvider navigatorLanguage="en-US">
        <ThemeToggle
          controller={{
            isDark: false,
            selection: "system",
            select,
            toggle: vi.fn(),
          }}
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Choose theme" }));

    expect(screen.getByRole("button", { name: "Operating system" }).getAttribute("aria-pressed"))
      .toBe("true");
    expect(screen.getByRole("button", { name: "Dark" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Light" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(select).toHaveBeenCalledWith("dark");
  });
});

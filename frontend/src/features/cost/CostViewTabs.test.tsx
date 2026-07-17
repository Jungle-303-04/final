// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { CostViewTabs } from "./CostViewTabs";

afterEach(cleanup);

describe("CostViewTabs", () => {
  it("supports arrow-key selection without changing unrelated URL state", () => {
    const select = vi.fn();
    render(
      <I18nProvider navigatorLanguage="en" storage={null}>
        <CostViewTabs onSelect={select} value="overview" />
      </I18nProvider>,
    );

    const overview = screen.getByRole("tab", { name: "Overview" });
    overview.focus();
    fireEvent.keyDown(overview, { key: "ArrowRight" });

    expect(select).toHaveBeenCalledWith("trend");
    expect(screen.getByRole("tab", { name: "Allocation trend" }).tabIndex).toBe(-1);
  });
});

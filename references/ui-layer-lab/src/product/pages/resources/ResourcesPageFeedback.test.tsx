// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../shared/i18n";
import { CatalogFreshness } from "./ResourcesPageFeedback";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-13T01:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CatalogFreshness text density", () => {
  it("does not render a badge for a fresh normal snapshot", () => {
    const { container } = render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <CatalogFreshness observedAt="2026-07-13T00:59:30.000Z" />
      </I18nProvider>,
    );

    expect(container.childElementCount).toBe(0);
    expect(screen.queryByText("스냅샷 최신")).toBeNull();
  });

  it("renders freshness only when the snapshot is stale or unavailable", () => {
    const { rerender } = render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <CatalogFreshness observedAt="2026-07-13T00:55:00.000Z" />
      </I18nProvider>,
    );

    expect(screen.getByRole("status").textContent).toContain("스냅샷 지연");
    expect(screen.getByRole("status").textContent).toContain("5분 전 관측");

    rerender(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <CatalogFreshness observedAt={null} />
      </I18nProvider>,
    );
    expect(screen.getByText("관측 시각 미제공")).toBeTruthy();
  });
});

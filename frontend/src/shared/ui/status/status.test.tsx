// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { I18nProvider } from "@/shared/i18n";
import { StatusPill } from "./StatusPill";
import { TintChip } from "./TintChip";

afterEach(cleanup);

describe("shared status presentation", () => {
  it("uses the canonical translated status label and critical token", () => {
    renderWithI18n(<StatusPill tone="critical" />);

    const pill = screen.getByText("임계").closest("[data-slot='status-pill']");
    expect(pill?.getAttribute("data-status")).toBe("critical");
    expect(pill?.className).toContain("text-status-critical");
  });

  it("announces only explicitly live status changes", () => {
    const { rerender } = renderWithI18n(
      <StatusPill label="동기화 중" tone="warning" />,
    );
    expect(screen.queryByRole("status")).toBeNull();

    rerender(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <StatusPill label="동기화 완료" live tone="healthy" />
      </I18nProvider>,
    );
    expect(screen.getByRole("status").textContent).toContain("동기화 완료");
  });

  it("keeps tint semantics in the shared vocabulary", () => {
    renderWithI18n(<TintChip label="대기" tone="stale" />);

    expect(screen.getByText("대기").closest("[data-slot='tint-chip']")
      ?.getAttribute("data-tone")).toBe("stale");
  });
});

function renderWithI18n(element: ReactElement) {
  return render(element, {
    wrapper: ({ children }) => (
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        {children}
      </I18nProvider>
    ),
  });
}

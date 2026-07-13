// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n";
import { TooltipProvider } from "./primitives/tooltip";
import { ClusterConnectionStatus } from "./ClusterConnectionStatus";

afterEach(cleanup);

describe("ClusterConnectionStatus", () => {
  it("uses the selected English locale for status and observation time", () => {
    const observedAt = "2026-07-13T00:00:00.000Z";
    const expectedTime = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(observedAt));

    renderStatus("en-US", observedAt);

    const control = screen.getByRole("button", {
      name: `Connected · last observed ${expectedTime}`,
    });
    expect(control.className).toContain("w-(--product-toolbar-compact-control-width)");
    expect(control.className).toContain("min-w-0");
    expect(screen.getByText("Connected")).toBeTruthy();
  });

  it("keeps missing observations explicit in Korean", () => {
    renderStatus("ko-KR", null, "unknown");

    const control = screen.getByRole("button", {
      name: "연결 상태 미확인 · 마지막 관측 알 수 없음",
    });
    expect(control.className).toContain("w-(--product-toolbar-compact-control-width)");
    expect(screen.getByText("연결 상태 미확인").className).toContain("truncate");
  });
});

function renderStatus(
  navigatorLanguage: string,
  lastObservedAt: string | null,
  connectionState: "online" | "unknown" = "online",
) {
  return render(
    <I18nProvider navigatorLanguage={navigatorLanguage} storage={null}>
      <TooltipProvider>
        <ClusterConnectionStatus
          connectionState={connectionState}
          lastObservedAt={lastObservedAt}
        />
      </TooltipProvider>
    </I18nProvider>,
  );
}

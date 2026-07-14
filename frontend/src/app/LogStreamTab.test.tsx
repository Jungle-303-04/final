// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BottomDockTab } from "../features/bottom-dock/bottomDockState";
import { I18nProvider } from "../shared/i18n";
import { LogStreamTab } from "./LogStreamTab";

afterEach(() => cleanup());

describe("LogStreamTab", () => {
  it("counts rolling-buffer replacements as new lines while the reader is scrolled up", async () => {
    const view = render(renderTab(tab({ received: 2, dropped: 0, lineId: "line-2" })));
    const viewport = screen.getByRole("log", { name: "checkout 로그 스트림" });
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 50 },
      scrollHeight: { configurable: true, value: 100 },
      scrollTop: { configurable: true, value: 0, writable: true },
    });
    fireEvent.scroll(viewport);

    view.rerender(renderTab(tab({ received: 3, dropped: 1, lineId: "line-3" })));

    expect(await screen.findByRole("button", { name: "새 로그 1줄" })).toBeTruthy();
  });
});

function renderTab(value: BottomDockTab) {
  return (
    <I18nProvider navigatorLanguage="ko" storage={null}>
      <LogStreamTab onRetry={vi.fn()} tab={value} />
    </I18nProvider>
  );
}

function tab({
  dropped,
  lineId,
  received,
}: {
  dropped: number;
  lineId: string;
  received: number;
}): BottomDockTab {
  return {
    id: "pod:checkout",
    target: {
      type: "pod",
      clusterId: "cluster-1",
      namespace: "shop",
      name: "checkout",
      container: null,
    },
    status: "streaming",
    streamId: "stream-1",
    lines: [{
      id: lineId,
      observedAt: "2026-07-14T08:00:00+00:00",
      pod: "checkout",
      container: "app",
      line: lineId,
      lineTruncated: false,
    }],
    recentLineIds: [lineId],
    received,
    dropped,
    unseen: 0,
    pods: ["checkout"],
    endReason: null,
    failureCode: null,
    retryable: false,
  };
}

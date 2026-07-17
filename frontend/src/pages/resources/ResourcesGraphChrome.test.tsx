// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { PhysicalGraphBreadcrumb, TimelineStrip } from "./ResourcesGraphChrome";
import type { ChangeTimelineFrame } from "./useChangeTimelineDataFrame";

afterEach(cleanup);

describe("PhysicalGraphBreadcrumb", () => {
  it("clears with the keyboard and exposes the current zoom level as location", async () => {
    const user = userEvent.setup();
    const onSelectAll = vi.fn();
    const onSelectCluster = vi.fn();

    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <PhysicalGraphBreadcrumb
          items={[
            { id: "cluster-1", label: "production", onSelect: onSelectCluster },
            { id: "server-1", label: "worker-a", onSelect: vi.fn() },
          ]}
          onSelectAll={onSelectAll}
        />
      </I18nProvider>,
    );

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "All" }));
    await user.keyboard("{Enter}");
    expect(onSelectAll).toHaveBeenCalledOnce();
    await user.tab();
    await user.keyboard(" ");
    expect(onSelectCluster).toHaveBeenCalledOnce();
    expect(screen.getByText("worker-a").getAttribute("aria-current")).toBe("location");
    expect(screen.queryByRole("button", { name: "worker-a" })).toBeNull();
  });
});

describe("TimelineStrip", () => {
  it("keeps the selected second and replay range visible", () => {
    const fromMs = Date.UTC(2026, 6, 15, 4, 0, 0);
    const toMs = fromMs + 10_000;
    const selectedMs = fromMs + 5_000;
    const frame: ChangeTimelineFrame = {
      phase: "ready",
      failure: null,
      refreshFailure: null,
      refreshing: false,
      updatedAt: fromMs,
      data: {
        fromMs,
        toMs,
        bucketMs: 1_000,
        buckets: [{ startMs: fromMs, endMs: toMs, total: 4, warnings: 1 }],
        events: [],
        gaps: [],
        freshnessPolicy: {
          staleAfterSeconds: 5,
          refreshAfterSeconds: 15,
          keepLastSuccess: true,
          pauseWhenHidden: true,
          eventInvalidation: true,
          retryAfterSeconds: null,
          retryLimit: null,
          postMutationRefreshAfterSeconds: null,
        },
      },
    };

    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <TimelineStrip
          atMs={selectedMs}
          frame={frame}
          onAtChange={vi.fn()}
          replayStatus="ready"
          replayWindow={{ fromMs, toMs }}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "지난 변화 보기" }));

    const selectedTime = document.querySelector("output");
    expect(selectedTime).not.toBeNull();
    expect(selectedTime?.textContent).toMatch(/05/u);
    expect(screen.getByRole("slider", { name: "시간" })).toBeTruthy();
    expect(Array.from(document.querySelectorAll("time")).map((node) => node.dateTime))
      .toEqual([new Date(fromMs).toISOString(), new Date(toMs).toISOString()]);
  });
});

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { TimelineStrip } from "./ResourcesGraphChrome";
import type { ChangeTimelineFrame } from "./useChangeTimelineDataFrame";

afterEach(cleanup);

describe("TimelineStrip", () => {
  it("keeps the selected second and replay range visible", () => {
    const fromMs = Date.UTC(2026, 6, 15, 4, 0, 0);
    const toMs = fromMs + 10_000;
    const selectedMs = fromMs + 5_000;
    const frame: ChangeTimelineFrame = {
      phase: "ready",
      failure: null,
      data: {
        fromMs,
        toMs,
        bucketMs: 1_000,
        buckets: [{ startMs: fromMs, endMs: toMs, total: 4, warnings: 1 }],
        events: [],
        gaps: [],
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

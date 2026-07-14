// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FreshnessControl, type FreshnessCopy } from "./FreshnessControl";
import { freshnessBucket } from "./freshnessTime";
import { TooltipProvider } from "./primitives/tooltip";

const now = Date.UTC(2026, 6, 15, 1, 0, 0);

beforeEach(() => vi.setSystemTime(now));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FreshnessControl", () => {
  it("names polling honestly and shows second-level age", () => {
    renderFreshness({ dataUpdatedAt: now - 5_000, mode: "polling" });

    expect(screen.getByText("5초 폴링")).toBeTruthy();
    expect(screen.getByText(/5초 전 갱신/u)).toBeTruthy();
  });

  it("does not claim polling while the connection is recovering", () => {
    renderFreshness({
      connectionState: "connecting",
      dataUpdatedAt: now - 12_000,
      mode: "polling",
    });

    expect(screen.getByText("다시 연결 중")).toBeTruthy();
    expect(screen.queryByText("5초 폴링")).toBeNull();
    expect(screen.getByText(/12초 전 갱신/u)).toBeTruthy();
  });

  it("keeps an unloaded snapshot silent except for its refresh action", () => {
    renderFreshness({ mode: "snapshot", onRefresh: vi.fn() });

    expect(screen.getByRole("button", { name: "지금 갱신" })).toBeTruthy();
    expect(screen.queryByText(/갱신/u)).toBeNull();
  });
});

function renderFreshness(
  props: Partial<React.ComponentProps<typeof FreshnessControl>> &
    Pick<React.ComponentProps<typeof FreshnessControl>, "mode">,
) {
  return render(
    <TooltipProvider delay={0}>
      <FreshnessControl copy={copy} {...props} />
    </TooltipProvider>,
  );
}

const copy: FreshnessCopy = {
  paused: "폴링 일시 중지",
  pausedDescription: "화면이 다시 보이면 갱신합니다.",
  polling: "5초 폴링",
  pollingDescription: "5초마다 새 값을 확인합니다.",
  reconnecting: "다시 연결 중",
  reconnectingDescription: "연결이 복구될 때까지 이전 값을 표시합니다.",
  refreshNow: "지금 갱신",
  updated: (elapsed) => {
    const bucket = freshnessBucket(elapsed);
    const unit = { days: "일", hours: "시간", minutes: "분", seconds: "초" }[
      bucket.unit
    ];
    return `${bucket.value}${unit} 전 갱신`;
  },
  updatedAt: (timestamp) => `${new Date(timestamp).toISOString()} 갱신`,
};

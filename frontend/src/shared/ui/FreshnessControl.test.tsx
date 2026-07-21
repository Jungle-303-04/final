// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FreshnessControl, type FreshnessCopy } from "./FreshnessControl";
import { freshnessBucket } from "./freshnessTime";
import { TooltipProvider } from "./primitives/tooltip";
import { REFRESH_OBSERVATION_TIMEOUT_MS } from "./useRefreshAnimation";

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

    expect(screen.getAllByText("다시 연결 중")).toHaveLength(1);
    expect(screen.queryByText("5초 폴링")).toBeNull();
    expect(screen.getByText(/12초 전 갱신/u)).toBeTruthy();
  });

  it("keeps an unloaded snapshot silent except for its refresh action", () => {
    renderFreshness({ mode: "snapshot", onRefresh: vi.fn() });

    expect(screen.getByRole("button", { name: "지금 갱신" })).toBeTruthy();
    expect(screen.queryByText(/갱신/u)).toBeNull();
  });

  it("does not turn a rejected refresh into a success indicator", async () => {
    const user = userEvent.setup();
    renderFreshness({ mode: "snapshot", onRefresh: vi.fn().mockRejectedValue(new Error("offline")) });

    await user.click(screen.getByRole("button", { name: "지금 갱신" }));

    expect((await screen.findByRole("alert")).textContent).toContain("새로 고침에 실패했습니다.");
    expect(document.querySelector('[data-refresh-phase="succeeded"]')).toBeNull();
  });

  it("reports a synchronous refresh throw as a failure", async () => {
    const user = userEvent.setup();
    renderFreshness({ mode: "snapshot", onRefresh: () => { throw new Error("offline"); } });

    await user.click(screen.getByRole("button", { name: "지금 갱신" }));

    expect(screen.getByRole("alert").textContent).toContain("새로 고침에 실패했습니다.");
  });

  it("keeps abort cancellation distinct from failure", async () => {
    const user = userEvent.setup();
    renderFreshness({
      mode: "snapshot",
      onRefresh: () => Promise.reject(new DOMException("aborted", "AbortError")),
    });

    await user.click(screen.getByRole("button", { name: "지금 갱신" }));

    expect((await screen.findByRole("status")).textContent).toContain("새로 고침이 취소되었습니다.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("waits for newer freshness evidence before confirming a void refresh", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const view = renderFreshness({
      dataUpdatedAt: now - 5_000,
      isFetching: false,
      mode: "polling",
      onRefresh,
    });

    await user.click(screen.getByRole("button", { name: "지금 갱신" }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector('[data-refresh-phase="pending"]')).toBeTruthy();
    expect(screen.queryByText("새로 고쳤습니다.")).toBeNull();

    view.rerender(
      <TooltipProvider delay={0}>
        <FreshnessControl
          copy={copy}
          dataUpdatedAt={now}
          isFetching={false}
          mode="polling"
          onRefresh={onRefresh}
        />
      </TooltipProvider>,
    );

    expect(await screen.findByText("새로 고쳤습니다.")).toBeTruthy();
  });

  it("requires both a resolving request and newer freshness evidence when both are available", async () => {
    const user = userEvent.setup();
    let resolve: (() => void) | undefined;
    const onRefresh = () => new Promise<void>((next) => { resolve = next; });
    const view = renderFreshness({
      dataUpdatedAt: now - 5_000,
      isFetching: false,
      mode: "polling",
      onRefresh,
    });

    await user.click(screen.getByRole("button", { name: "지금 갱신" }));
    view.rerender(
      <TooltipProvider delay={0}>
        <FreshnessControl
          copy={copy}
          dataUpdatedAt={now}
          isFetching={false}
          mode="polling"
          onRefresh={onRefresh}
        />
      </TooltipProvider>,
    );
    expect(view.container.querySelector('[data-refresh-phase="pending"]')).toBeTruthy();

    await act(async () => resolve?.());

    expect(await screen.findByText("새로 고쳤습니다.")).toBeTruthy();
  });

  it("shows success only after a resolving request without freshness evidence", async () => {
    const user = userEvent.setup();
    let resolve: (() => void) | undefined;
    renderFreshness({
      mode: "snapshot",
      onRefresh: () => new Promise<void>((next) => { resolve = next; }),
    });

    await user.click(screen.getByRole("button", { name: "지금 갱신" }));
    expect(screen.getByText("새로 고치는 중")).toBeTruthy();

    await act(async () => resolve?.());

    expect(await screen.findByText("새로 고쳤습니다.")).toBeTruthy();
  });

  it("waits for a void refresh data frame to fetch and settle before showing success", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const view = renderFreshness({ mode: "snapshot", onRefresh });

    await user.click(screen.getByRole("button", { name: "지금 갱신" }));

    expect(view.container.querySelector('[data-refresh-phase="pending"]')).toBeTruthy();
    expect(screen.queryByText("새로 고쳤습니다.")).toBeNull();

    view.rerender(
      <TooltipProvider delay={0}>
        <FreshnessControl copy={copy} isFetching mode="snapshot" onRefresh={onRefresh} />
      </TooltipProvider>,
    );
    expect(view.container.querySelector('[data-refresh-phase="pending"]')).toBeTruthy();

    view.rerender(
      <TooltipProvider delay={0}>
        <FreshnessControl copy={copy} isFetching={false} mode="snapshot" onRefresh={onRefresh} />
      </TooltipProvider>,
    );

    expect(await screen.findByText("새로 고쳤습니다.")).toBeTruthy();
  });

  it("cancels a void refresh when its owner never publishes an observation", async () => {
    vi.useFakeTimers();
    renderFreshness({ mode: "snapshot", onRefresh: vi.fn() });

    fireEvent.click(screen.getByRole("button", { name: "지금 갱신" }));
    expect(document.querySelector('[data-refresh-phase="pending"]')).toBeTruthy();

    act(() => vi.advanceTimersByTime(REFRESH_OBSERVATION_TIMEOUT_MS));

    expect(screen.getByRole("status").textContent).toContain("새로 고침이 취소되었습니다.");
    expect(document.querySelector('[data-refresh-phase="succeeded"]')).toBeNull();
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
  refreshCancelled: "새로 고침이 취소되었습니다.",
  refreshFailed: "새로 고침에 실패했습니다.",
  paused: "폴링 일시 중지",
  pausedDescription: "화면이 다시 보이면 갱신합니다.",
  refreshPending: "새로 고치는 중",
  polling: "5초 폴링",
  pollingDescription: "5초마다 새 값을 확인합니다.",
  reconnecting: "다시 연결 중",
  reconnectingDescription: "연결이 복구될 때까지 이전 값을 표시합니다.",
  refreshNow: "지금 갱신",
  refreshSucceeded: "새로 고쳤습니다.",
  updated: (elapsed) => {
    const bucket = freshnessBucket(elapsed);
    const unit = { days: "일", hours: "시간", minutes: "분", seconds: "초" }[
      bucket.unit
    ];
    return `${bucket.value}${unit} 전 갱신`;
  },
  updatedAt: (timestamp) => `${new Date(timestamp).toISOString()} 갱신`,
};

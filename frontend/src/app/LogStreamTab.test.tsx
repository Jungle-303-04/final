// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BottomDockTab } from "../features/bottom-dock/bottomDockState";
import { I18nProvider } from "../shared/i18n";
import { LogStreamTab } from "./LogStreamTab";

vi.mock("react-virtuoso", async () => {
  const React = await import("react");
  return {
    Virtuoso: React.forwardRef((props: Record<string, unknown>, ref) => {
      React.useImperativeHandle(ref, () => ({ scrollToIndex: vi.fn() }));
      const data = (props.data ?? []) as BottomDockTab["lines"];
      const itemContent = props.itemContent as (index: number, line: BottomDockTab["lines"][number]) => React.ReactNode;
      return <div>{data.map((line, index) => <React.Fragment key={line.id}>{itemContent(index, line)}</React.Fragment>)}</div>;
    }),
  };
});

afterEach(() => cleanup());

describe("LogStreamTab", () => {
  it("keeps transport failure actionable while preserving an honest empty viewer", () => {
    const retry = vi.fn();
    renderTab(tab({ status: "failed", retryable: true, lines: [] }), retry);

    expect(screen.getByText("연결 실패")).toBeTruthy();
    expect(screen.getByText("아직 관측된 로그 줄이 없습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "로그 스트림 다시 시작" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("renders real structured lines with stream membership and terminal reason", () => {
    renderTab(tab({
      status: "ended",
      endReason: "window_complete",
      lines: [{
        id: "line-1",
        observedAt: "2026-07-14T08:00:00+00:00",
        pod: "checkout",
        container: "app",
        line: '{"level":"info","message":"request complete"}',
        lineTruncated: false,
      }],
    }));

    expect(screen.getByText("스트림 종료: window_complete")).toBeTruthy();
    expect(screen.getByText("파드 1개: checkout")).toBeTruthy();
    expect(screen.getByText("request complete")).toBeTruthy();
  });

  it("renders a server diagnostic as a copy-only recovery action", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderTab(tab({
      status: "ended",
      endReason: "no_pods",
      lines: [],
      diagnostic: {
        code: "no_matching_pods",
        recovery: {
          kind: "copy-command",
          command: "kubectl get deployment checkout --namespace shop",
          clusterId: "cluster-1",
          readOnly: true,
        },
      },
    }));

    expect(screen.getByText("이 대상과 일치하는 Pod가 관측되지 않았습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "읽기 전용 진단 명령 복사" }));
    expect(writeText).toHaveBeenCalledWith("kubectl get deployment checkout --namespace shop");
  });
});

function renderTab(value: BottomDockTab, onRetry = vi.fn()) {
  return render(
    <I18nProvider navigatorLanguage="ko" storage={null}>
      <LogStreamTab onRetry={onRetry} tab={value} />
    </I18nProvider>,
  );
}

function tab(overrides: Partial<BottomDockTab>): BottomDockTab {
  const lines = overrides.lines ?? [];
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
    lines,
    recentLineIds: lines.map((line) => line.id),
    received: lines.length,
    dropped: 0,
    unseen: 0,
    pods: ["checkout"],
    endReason: null,
    diagnostic: null,
    failureCode: null,
    retryable: false,
    ...overrides,
  };
}

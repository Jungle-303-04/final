// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import type { BottomDockLine } from "../bottom-dock/bottomDockState";
import { LogViewer } from "./LogViewer";

const virtuoso = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
  scrollToIndex: vi.fn(),
}));

vi.mock("react-virtuoso", async () => {
  const React = await import("react");
  return {
    Virtuoso: React.forwardRef((props: Record<string, unknown>, ref) => {
      virtuoso.props = props;
      React.useImperativeHandle(ref, () => ({ scrollToIndex: virtuoso.scrollToIndex }));
      const data = (props.data ?? []) as BottomDockLine[];
      const itemContent = props.itemContent as (index: number, line: BottomDockLine) => React.ReactNode;
      const renderedIndices = data.length > 2 ? [0, data.length - 1] : data.map((_line, index) => index);
      return (
        <div data-testid="virtual-log-list">
          {renderedIndices.map((index) => (
            <React.Fragment key={data[index]?.id}>{itemContent(index, data[index]!)}</React.Fragment>
          ))}
        </div>
      );
    }),
  };
});

beforeEach(() => {
  virtuoso.props = null;
  virtuoso.scrollToIndex.mockReset();
  installMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("LogViewer", () => {
  it("virtualizes a long stream and keeps the mobile toolbar on one horizontal row", () => {
    const lines = Array.from({ length: 500 }, (_, index) => line(`line-${index}`, `message ${index}`));
    renderViewer(lines);

    expect(screen.getByText("message 0")).toBeTruthy();
    expect(screen.getByText("message 499")).toBeTruthy();
    expect(screen.queryByText("message 250")).toBeNull();
    expect(virtuoso.props?.data).toHaveLength(500);
    expect(screen.getByTestId("log-toolbar").className).toContain("flex-nowrap");
    expect(screen.getByTestId("log-toolbar").className).toContain("overflow-x-auto");
  });

  it("searches literals and regexes, respects case, and navigates with the keyboard", async () => {
    const user = userEvent.setup();
    renderViewer([
      line("one", "Payment FAILED"),
      line("two", "payment failed again"),
      line("three", "checkout ready"),
    ]);
    const search = screen.getByRole("textbox", { name: "로그 검색" });
    expect(search.getAttribute("data-slot")).toBe("input");
    await user.type(search, "payment");
    expect(screen.getByText("2개 중 1")).toBeTruthy();

    fireEvent.keyDown(search, { key: "Enter" });
    expect(virtuoso.scrollToIndex).toHaveBeenLastCalledWith(expect.objectContaining({
      index: 1,
      behavior: "smooth",
    }));
    fireEvent.keyDown(search, { key: "Enter", shiftKey: true });
    expect(virtuoso.scrollToIndex).toHaveBeenLastCalledWith(expect.objectContaining({ index: 0 }));

    await user.click(screen.getByRole("button", { name: "대소문자 구분" }));
    expect(screen.getByText("1개 중 1")).toBeTruthy();
    await user.clear(search);
    fireEvent.change(search, { target: { value: "[" } });
    await user.click(screen.getByRole("button", { name: "정규식 사용" }));
    expect(screen.getByText("정규식을 확인하세요")).toBeTruthy();
    fireEvent.keyDown(search, { key: "Escape" });
    expect((search as HTMLInputElement).value).toBe("");
  });

  it("filters by level and presents JSON and logfmt as compact, expanded, or raw", async () => {
    const user = userEvent.setup();
    renderViewer([
      line("json", '{"level":"error","message":"database failed","request_id":"r-1"}'),
      line("logfmt", 'level=info service=api message="request complete"'),
    ]);

    expect(screen.getByText("database failed")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "오류" }));
    expect(screen.queryByText("database failed")).toBeNull();
    expect(screen.getByText("request complete")).toBeTruthy();

    await user.selectOptions(screen.getByRole("combobox", { name: "구조화 로그 표시" }), "expanded");
    expect(screen.getByText("service")).toBeTruthy();
    expect(screen.getByText("api")).toBeTruthy();
    await user.selectOptions(screen.getByRole("combobox", { name: "구조화 로그 표시" }), "raw");
    expect(screen.getByText('level=info service=api message="request complete"')).toBeTruthy();
  });

  it("copies an observed line and downloads only the real accumulated buffer", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const createObjectURL = vi.fn().mockReturnValue("blob:logs");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderViewer([line("one", "first real line"), line("two", "second real line")]);

    const copyButtons = screen.getAllByRole("button", { name: "로그 한 줄 복사" });
    await user.click(copyButtons[0]!);
    expect(writeText).toHaveBeenCalledWith("first real line");
    expect(screen.getByRole("button", { name: "복사됨" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "관측된 로그 다운로드" }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(await blob.text()).toContain("first real line");
    expect(await blob.text()).toContain("second real line");
    expect(click).toHaveBeenCalledOnce();
  });

  it("stops following when the reader scrolls away and honors reduced motion when resuming", async () => {
    installMatchMedia(true);
    const first = [line("one", "first")];
    const view = render(renderViewerElement(first, 1));
    act(() => {
      (virtuoso.props?.atBottomStateChange as ((value: boolean) => void))(false);
    });
    view.rerender(renderViewerElement([...first, line("two", "second")], 2));

    const resume = await screen.findByRole("button", { name: "새 로그 1줄" });
    fireEvent.click(resume);
    expect(virtuoso.scrollToIndex).toHaveBeenLastCalledWith(expect.objectContaining({
      index: 1,
      behavior: "auto",
    }));
  });

  it("does not expose the high-rate viewport as a live log and throttles new-line announcements", () => {
    vi.useFakeTimers();
    const first = [line("one", "first")];
    const view = render(renderViewerElement(first, 1));

    expect(screen.queryByRole("log")).toBeNull();
    expect(screen.getByTestId("log-announcer").textContent).toBe("");

    view.rerender(renderViewerElement([
      ...first,
      line("two", "second"),
      line("three", "third"),
    ], 3));
    act(() => vi.advanceTimersByTime(999));
    expect(screen.getByTestId("log-announcer").textContent).toBe("");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("log-announcer").textContent).toBe("새 로그 2줄");
  });

  it("renders an honest empty state without manufacturing log rows", () => {
    renderViewer([]);
    expect(screen.getByText("아직 관측된 로그 줄이 없습니다.")).toBeTruthy();
    expect(screen.queryByTestId("virtual-log-list")).toBeNull();
  });
});

function renderViewer(lines: BottomDockLine[]) {
  return render(renderViewerElement(lines, lines.length));
}

function renderViewerElement(lines: BottomDockLine[], received: number) {
  return (
    <I18nProvider navigatorLanguage="ko" storage={null}>
      <LogViewer lines={lines} received={received} targetName="checkout" />
    </I18nProvider>
  );
}

function line(id: string, value: string): BottomDockLine {
  return {
    id,
    observedAt: "2026-07-14T08:00:00+00:00",
    pod: "checkout-api",
    container: "app",
    line: value,
    lineTruncated: false,
  };
}

function installMatchMedia(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)" ? reduced : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

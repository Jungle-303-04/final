// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductStateScreen } from "./ProductStateScreen";

afterEach(cleanup);

describe("ProductStateScreen", () => {
  it("announces loading without exposing decorative skeletons", () => {
    const { container } = render(<ProductStateScreen kind="loading" />);
    const main = screen.getByRole("main");

    expect(main.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("heading", { name: "운영 상태를 확인하는 중입니다" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "로딩 중" })).toBeTruthy();
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    for (const skeleton of container.querySelectorAll('[data-slot="skeleton"]')) {
      expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("keeps the zero-approval release gate calm and non-interactive", () => {
    const { container } = render(<ProductStateScreen kind="release" />);
    const main = screen.getByRole("main");

    expect(main.getAttribute("aria-busy")).toBeNull();
    expect(container.querySelector("[aria-live]")).toBeNull();
    expect(screen.getByRole("heading", { name: "API 연결 계층을 검증하고 있습니다" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("accepts an explicit authenticated release action without changing state semantics", () => {
    render(
      <ProductStateScreen
        action={<button type="button">세션 종료</button>}
        kind="release"
      />,
    );

    expect(screen.getByRole("button", { name: "세션 종료" })).toBeTruthy();
    expect(screen.getByRole("heading", {
      name: "API 연결 계층을 검증하고 있습니다",
    })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("exposes hard-error detail and a single retry action", async () => {
    const onRetry = vi.fn(async () => undefined);
    render(
      <ProductStateScreen
        kind="error"
        issue={{
          code: "invalid-response",
          correlationId: "corr-17",
          safeDetail: "응답 계약이 일치하지 않습니다.",
        }}
        retry={{ label: "응답 다시 읽기", pending: false, onRetry }}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("invalid-response");
    expect(alert.textContent).toContain("corr-17");
    const safeDetail = screen.getByText("응답 계약이 일치하지 않습니다.");
    expect(safeDetail.className).toContain("[overflow-wrap:anywhere]");
    await userEvent.setup().dblClick(screen.getByRole("button", { name: "응답 다시 읽기" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("disables an explicitly pending offline retry", async () => {
    const onRetry = vi.fn(async () => undefined);
    render(
      <ProductStateScreen
        kind="offline"
        issue={{ code: "network", safeDetail: "게이트웨이에 연결할 수 없습니다." }}
        retry={{ label: "연결 다시 확인", pending: true, onRetry }}
      />,
    );

    const retry = screen.getByRole("button", { name: "연결 다시 확인 중" });
    expect(retry.getAttribute("disabled")).not.toBeNull();
    expect(retry.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("status")).toBeNull();
    await userEvent.setup().click(retry);
    expect(onRetry).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("network");
  });

  it("falls back to a non-empty retry name and accepts feature-shaped loading geometry", () => {
    const onRetry = vi.fn();
    const { container, rerender } = render(
      <ProductStateScreen
        kind="offline"
        issue={{ code: "network" }}
        retry={{ label: "   ", pending: false, onRetry }}
      />,
    );

    const fallbackRetry = screen.getByRole("button", { name: "다시 시도" });
    expect(fallbackRetry.className).toContain("max-w-full");
    expect(fallbackRetry.className).toContain("whitespace-normal");
    rerender(
      <ProductStateScreen
        kind="loading"
        loadingPreview={
          <button data-testid="feature-loading-geometry" type="button">장식용 로딩 타일</button>
        }
      />,
    );
    expect(screen.getByTestId("feature-loading-geometry")).toBeTruthy();
    const preview = container.querySelector('[data-slot="loading-preview"]');
    expect(preview?.getAttribute("aria-hidden")).toBe("true");
    expect(preview?.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("button", { name: "장식용 로딩 타일" })).toBeNull();
  });

  it("releases the invocation guard when a retry never enters pending", () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    render(
      <ProductStateScreen
        kind="offline"
        issue={{ code: "network" }}
        retry={{ pending: false, onRetry }}
      />,
    );

    const retry = screen.getByRole("button", { name: "다시 시도" });
    fireEvent.click(retry);
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledOnce();

    vi.runOnlyPendingTimers();
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("separates quiet empty state from forbidden access", () => {
    const { rerender } = render(<ProductStateScreen kind="empty" />);

    expect(screen.getByRole("heading", { name: "표시할 데이터가 없습니다" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(
      <ProductStateScreen
        kind="forbidden"
        issue={{ code: "forbidden", safeDetail: "이 namespace를 조회할 권한이 없습니다." }}
      />,
    );
    expect(screen.getByRole("heading", { name: "이 범위에 접근할 수 없습니다" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("forbidden");
  });

  it("uses a named section instead of nesting main landmarks for content placement", () => {
    render(
      <main>
        <ProductStateScreen kind="loading" placement="content" />
      </main>,
    );

    expect(screen.getAllByRole("main")).toHaveLength(1);
    const region = screen.getByRole("region", { name: "운영 상태를 확인하는 중입니다" });
    expect(region).toBeTruthy();
    expect(screen.getByRole("heading", { name: "운영 상태를 확인하는 중입니다" }).tagName).toBe("H2");
  });
});

function assertProductStateTypeContracts() {
  // @ts-expect-error loading states never expose retry actions
  void <ProductStateScreen kind="loading" retry={{ pending: false, onRetry: async () => undefined }} />;
  // @ts-expect-error hard errors require a safe presentation issue
  void <ProductStateScreen kind="error" />;
  // @ts-expect-error raw Error objects are not valid presentation DTOs
  void <ProductStateScreen kind="error" issue={new Error("raw stack")} />;
  // @ts-expect-error 401 belongs to the session barrier, not the forbidden state
  void <ProductStateScreen kind="forbidden" issue={{ code: "unauthorized" }} />;
  // @ts-expect-error state-specific actions are available only at the authenticated release gate
  void <ProductStateScreen action={<button type="button" />} kind="loading" />;
}

void assertProductStateTypeContracts;

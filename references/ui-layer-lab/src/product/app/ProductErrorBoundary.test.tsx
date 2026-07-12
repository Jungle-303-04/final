// @vitest-environment jsdom

import { act, cleanup, fireEvent, render as renderBase, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../shared/i18n";
import { ProductErrorBoundary } from "./ProductErrorBoundary";

const RAW_ERROR_TOKEN = "secret-render-stack-token";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ProductErrorBoundary", () => {
  it("passes a healthy child through without adding another main landmark", () => {
    render(
      <ProductErrorBoundary>
        <main id="product-main" tabIndex={-1}>정상 제품 화면</main>
      </ProductErrorBoundary>,
    );

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main").textContent).toBe("정상 제품 화면");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("replaces a raw render error with one safe semantic fallback", () => {
    render(
      <ProductErrorBoundary>
        <ImmediateCrash />
      </ProductErrorBoundary>,
    );

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "검증된 응답을 읽지 못했습니다" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("unknown");
    expect(screen.getByRole("button", { name: "화면 다시 열기" })).toBeTruthy();
    expect(document.activeElement?.id).toBe("product-main");
    expect(document.body.textContent).not.toContain(RAW_ERROR_TOKEN);
    expect(document.body.textContent).not.toContain("ImmediateCrash");
  });

  it("records one structured diagnostic without the raw error or component stack", () => {
    const consoleErrorSpy = vi.mocked(console.error);

    render(
      <ProductErrorBoundary>
        <ImmediateCrash />
      </ProductErrorBoundary>,
    );

    const boundaryLogs = consoleErrorSpy.mock.calls.filter(
      ([payload]) =>
        typeof payload === "object" &&
        payload !== null &&
        Reflect.get(payload, "event") === "product.error_boundary.caught",
    );

    expect(boundaryLogs).toEqual([
      [
        {
          boundary: "ProductErrorBoundary",
          event: "product.error_boundary.caught",
          recovery: "manual_retry",
          severity: "error",
        },
      ],
    ]);
    expect(JSON.stringify(boundaryLogs)).not.toContain(RAW_ERROR_TOKEN);
    expect(JSON.stringify(boundaryLogs)).not.toContain("ImmediateCrash");
  });

  it("remounts the child only after the user requests a retry", async () => {
    let mountSequence = 0;

    function CrashableChild() {
      const [instanceId] = useState(() => ++mountSequence);
      const [crashed, setCrashed] = useState(false);
      if (crashed) throw new Error(RAW_ERROR_TOKEN);

      return (
        <main aria-label="복구 가능한 화면" id="product-main" tabIndex={-1}>
          <span data-testid="instance-id">instance-{instanceId}</span>
          <button onClick={() => setCrashed(true)} type="button">오류 발생</button>
        </main>
      );
    }

    render(
      <ProductErrorBoundary>
        <CrashableChild />
      </ProductErrorBoundary>,
    );
    const firstInstanceId = screen.getByTestId("instance-id").textContent;

    await userEvent.setup().click(screen.getByRole("button", { name: "오류 발생" }));
    expect(screen.getByRole("heading", { name: "검증된 응답을 읽지 못했습니다" })).toBeTruthy();
    expect(document.activeElement?.id).toBe("product-main");

    await userEvent.setup().click(screen.getByRole("button", { name: "화면 다시 열기" }));
    const recoveredInstanceId = screen.getByTestId("instance-id").textContent;
    expect(recoveredInstanceId).not.toBe(firstInstanceId);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement?.id).toBe("product-main");
  });

  it("contains a persistent crash without an automatic retry loop or network", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    const webSocketSpy = vi.fn();
    const eventSourceSpy = vi.fn();
    const xhrSpy = vi.fn();
    const sendBeaconSpy = vi.fn();
    const restore = [
      replaceProperty(globalThis, "fetch", fetchSpy),
      replaceProperty(globalThis, "WebSocket", webSocketSpy),
      replaceProperty(globalThis, "EventSource", eventSourceSpy),
      replaceProperty(globalThis, "XMLHttpRequest", xhrSpy),
      replaceProperty(navigator, "sendBeacon", sendBeaconSpy),
    ];
    let renderCount = 0;

    function PersistentCrash(): never {
      renderCount += 1;
      throw new Error(RAW_ERROR_TOKEN);
    }

    try {
      render(
        <ProductErrorBoundary>
          <PersistentCrash />
        </ProductErrorBoundary>,
      );
      const initialRenderCount = renderCount;

      fireEvent.click(screen.getByRole("button", { name: "화면 다시 열기" }));
      await act(async () => Promise.resolve());
      const settledRenderCount = renderCount;
      expect(settledRenderCount).toBeGreaterThan(initialRenderCount);
      expect(screen.getAllByRole("main")).toHaveLength(1);
      expect(screen.getByRole("button", { name: "화면 다시 열기" })).toBeTruthy();

      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("offline"));
      document.dispatchEvent(new Event("visibilitychange"));
      await act(async () => {
        vi.advanceTimersByTime(300_000);
        await Promise.resolve();
      });

      expect(renderCount).toBe(settledRenderCount);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(webSocketSpy).not.toHaveBeenCalled();
      expect(eventSourceSpy).not.toHaveBeenCalled();
      expect(xhrSpy).not.toHaveBeenCalled();
      expect(sendBeaconSpy).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toContain(RAW_ERROR_TOKEN);
    } finally {
      restore.reverse().forEach((restoreProperty) => restoreProperty());
    }
  });
});

function render(element: ReactElement) {
  return renderBase(element, {
    wrapper: ({ children }) => (
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        {children}
      </I18nProvider>
    ),
  });
}

function ImmediateCrash(): never {
  throw new Error(`${RAW_ERROR_TOKEN}\n    at ImmediateCrash (ProductErrorBoundary.test.tsx:1:1)`);
}

function replaceProperty(target: object, property: PropertyKey, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, {
    configurable: true,
    writable: true,
    value,
  });

  return () => {
    if (descriptor) Object.defineProperty(target, property, descriptor);
    else Reflect.deleteProperty(target, property);
  };
}

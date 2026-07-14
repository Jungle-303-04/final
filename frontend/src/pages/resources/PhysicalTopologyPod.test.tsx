// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PhysicalTopologyPod as PhysicalTopologyPodValue } from "../../features/resources/physicalTopologyContract";
import { I18nProvider } from "../../shared/i18n";
import { PhysicalTopologyPod } from "./PhysicalTopologyPod";
import {
  exponentialUsageStep,
  UsageSmoothingBoundary,
  usageColor,
} from "./useSmoothedUsageColor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PhysicalTopologyPod", () => {
  it("uses a fixed iconless square whose fill only follows usage", () => {
    const { container } = renderPod(pod({ usagePercent: 72 }));
    const button = screen.getByRole("button");

    expect(button.dataset.usageTone).toBe("amber");
    expect(button.className).toContain("size-9");
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("[data-pod-badge]")).toBeNull();
  });

  it("shows state only as an abnormal badge", () => {
    const { container } = renderPod(pod({ phase: "Pending", usagePercent: 92 }));

    expect(screen.getByRole("button").dataset.usageTone).toBe("red");
    expect(container.querySelector("[data-pod-badge='pending']")).not.toBeNull();
  });

  it("smooths only the token-based color while the measured number changes immediately", () => {
    installMatchMedia(false);
    const frames = installAnimationFrames();
    const rendered = renderPod(pod({ usagePercent: 50 }));
    const button = screen.getByRole("button");

    rendered.rerender(podTree(pod({ usagePercent: 90 })));
    expect(button.getAttribute("aria-label")).toContain("90%");
    expect(button.dataset.usageValue).toBe("50.000");

    act(() => frames.advance(0));
    act(() => frames.advance(250));
    expect(Number(button.dataset.usageValue)).toBeCloseTo(75.285, 2);
    expect(button.style.getPropertyValue("--usage-color")).toContain(
      "color-mix(in oklch",
    );

    const stopped = Number(button.dataset.usageValue);
    rendered.rerender(podTree(pod({ usagePercent: null })));
    act(() => frames.advance(1_000));
    expect(button.getAttribute("aria-label")).toContain("사용률 —");
    expect(Number(button.dataset.usageValue)).toBeCloseTo(stopped, 3);
  });

  it("replaces color immediately when reduced motion is requested", () => {
    installMatchMedia(true);
    const frames = installAnimationFrames();
    const rendered = renderPod(pod({ usagePercent: 20 }));

    rendered.rerender(podTree(pod({ usagePercent: 92 })));
    expect(screen.getByRole("button").dataset.usageValue).toBe("92.000");
    expect(frames.request).not.toHaveBeenCalled();
  });

  it("observes visibility before animating when a scene has over 200 usage marks", () => {
    installMatchMedia(false);
    const frames = installAnimationFrames();
    const intersection = installIntersectionObserver();
    const rendered = render(
      <UsageSmoothingBoundary markCount={201}>
        {podTree(pod({ usagePercent: 10 }))}
      </UsageSmoothingBoundary>,
    );

    rendered.rerender(
      <UsageSmoothingBoundary markCount={201}>
        {podTree(pod({ usagePercent: 90 }))}
      </UsageSmoothingBoundary>,
    );
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toContain("90%");
    expect(button.dataset.usageValue).toBe("10.000");
    expect(frames.request).not.toHaveBeenCalled();

    act(() => intersection.enter());
    expect(frames.request).toHaveBeenCalledOnce();
  });

  it("uses the confirmed exponential step and existing palette tokens", () => {
    expect(exponentialUsageStep(0, 100, 250)).toBeCloseTo(63.212, 3);
    expect(usageColor(75)).toContain("color-mix(in oklch");
    expect(usageColor(75)).toContain("var(--status-warning)");
    expect(usageColor(90)).toContain("var(--destructive)");
    expect(usageColor(106.2)).toBe(usageColor(100));
  });

  it("keeps the actual over-request value while the tooltip names its denominator", () => {
    renderPod(pod({
      usagePercent: 106.2,
      cpuMillicores: 531,
      cpuRequestMillicores: 500,
      memoryMebibytes: 64,
      memoryRequestMebibytes: 128,
    }));

    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toContain("106%");
    expect(button.getAttribute("title")).toContain(
      "요청량 대비 106% (0.531 / 0.5 코어)",
    );
  });
});

function renderPod(value: PhysicalTopologyPodValue) {
  return render(podTree(value));
}

function podTree(value: PhysicalTopologyPodValue) {
  return (
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <PhysicalTopologyPod nodeIndex={0} onOpen={vi.fn()} pod={value} podIndex={0} />
    </I18nProvider>
  );
}

function installMatchMedia(matches: boolean) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
}

function installAnimationFrames() {
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const request = vi.fn((callback: FrameRequestCallback) => {
    nextId += 1;
    callbacks.set(nextId, callback);
    return nextId;
  });
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => callbacks.delete(id)));
  return {
    request,
    advance(timestamp: number) {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback(timestamp));
    },
  };
}

function installIntersectionObserver() {
  let callback: IntersectionObserverCallback | null = null;
  class TestIntersectionObserver {
    constructor(next: IntersectionObserverCallback) {
      callback = next;
    }
    disconnect() {}
    observe() {}
    unobserve() {}
    takeRecords() { return []; }
    readonly root = null;
    readonly rootMargin = "0px";
    readonly thresholds = [0];
  }
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
  return {
    enter() {
      callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    },
  };
}

function pod(overrides: Partial<PhysicalTopologyPodValue>): PhysicalTopologyPodValue {
  return {
    id: "pod:test",
    name: "test",
    namespace: "default",
    serverId: "node:worker-a",
    usagePercent: null,
    cpuMillicores: null,
    cpuRequestMillicores: null,
    memoryMebibytes: null,
    memoryRequestMebibytes: null,
    phase: "Running",
    health: "healthy",
    restartCount: 0,
    matchesFilter: true,
    ...overrides,
  };
}

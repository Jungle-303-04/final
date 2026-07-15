// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PhysicalTopologyPod as PhysicalTopologyPodValue } from "../../features/resources/physicalTopologyContract";
import { I18nProvider } from "../../shared/i18n";
import { TooltipProvider } from "../../shared/ui/primitives/tooltip";
import { PHYSICAL_TOPOLOGY } from "./ResourcesPage.physicalTestSupport";
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
  it("uses only API usage_pct for fill while keeping restart state in a badge", () => {
    const [basePod] = PHYSICAL_TOPOLOGY.pods;
    const [low, high, unknown]: PhysicalTopologyPodValue[] = [
      {
        ...basePod,
        id: "pod:sandbox/low-restarting",
        name: "low-restarting",
        usagePercent: 15,
        cpuMillicores: 15,
        cpuRequestMillicores: 100,
        memoryMebibytes: 32,
        memoryRequestMebibytes: 64,
        phase: "OOMKilled",
        health: "critical",
        restartCount: 3,
      },
      {
        ...basePod,
        id: "pod:sandbox/high-running",
        name: "high-running",
        usagePercent: 85,
        cpuMillicores: 85,
        cpuRequestMillicores: 100,
        memoryMebibytes: 32,
        memoryRequestMebibytes: 64,
        phase: "Running",
        health: "healthy",
        restartCount: 0,
      },
      {
        ...basePod,
        id: "pod:sandbox/no-requests",
        name: "no-requests",
        usagePercent: null,
        cpuMillicores: 15,
        cpuRequestMillicores: null,
        memoryMebibytes: 32,
        memoryRequestMebibytes: null,
        phase: "Running",
        health: "healthy",
        restartCount: 0,
      },
    ];
    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        {([low, high, unknown] as const).map((value, index) => (
          <PhysicalTopologyPod
            key={value.id}
            nodeIndex={0}
            onOpen={vi.fn()}
            pod={value}
            podIndex={index}
          />
        ))}
      </I18nProvider>,
    );

    const lowButton = screen.getByRole("button", { name: /low-restarting/u });
    const highButton = screen.getByRole("button", { name: /high-running/u });
    const unknownButton = screen.getByRole("button", { name: /no-requests/u });
    expect(lowButton.dataset.usageTone).toBe("neutral");
    expect(lowButton.style.getPropertyValue("--usage-color")).toContain("var(--muted-foreground)");
    expect(within(lowButton).getByRole("img", { name: /재시작/u })).toBeTruthy();
    expect(highButton.dataset.usageTone).toBe("red");
    expect(highButton.style.getPropertyValue("--usage-color")).toContain("var(--destructive)");
    expect(highButton.querySelector("[data-pod-badge]")).toBeNull();
    expect(unknownButton.dataset.usageTone).toBe("unknown");
    expect(unknownButton.className).toContain("border-dashed");
    expect(unknownButton.style.getPropertyValue("--usage-color")).toBe("");
  });

  it("uses a fixed iconless square whose fill only follows usage", () => {
    const { container } = renderPod(pod({ name: "checkout-api-0", usagePercent: 72 }));
    const button = screen.getByRole("button");

    expect(button.dataset.usageTone).toBe("amber");
    expect(button.className).toContain("size-9");
    expect(button.textContent).toBe("CH");
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("[data-pod-badge]")).toBeNull();
    expect(button.className).toContain("transition-[opacity,transform,background-color]");
    expect(button.className).not.toContain("box-shadow");
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

    rendered.rerender(podTree(pod({ usagePercent: null })));
    act(() => frames.advance(1_000));
    expect(button.getAttribute("aria-label")).toContain("사용률 —");
    expect(button.dataset.usageValue).toBe("unknown");
    expect(button.className).toContain("border-dashed");
  });

  it("replaces color immediately when reduced motion is requested", () => {
    installMatchMedia(true);
    const frames = installAnimationFrames();
    const rendered = renderPod(pod({ usagePercent: 20 }));

    rendered.rerender(podTree(pod({ usagePercent: 92 })));
    expect(screen.getByRole("button").dataset.usageValue).toBe("92.000");
    expect(frames.request).not.toHaveBeenCalled();
  });

  it("holds the last measured value when no newer measurement arrives", () => {
    installMatchMedia(false);
    const frames = installAnimationFrames();
    const rendered = renderPod(pod({ usagePercent: 35 }));

    rendered.rerender(podTree(pod({ usagePercent: 80 })));
    for (const timestamp of [0, 250, 500, 750, 1_000, 1_250, 1_500, 1_750]) {
      act(() => frames.advance(timestamp));
    }
    expect(screen.getByRole("button").dataset.usageValue).toBe("80.000");
    const requestsAtRest = frames.request.mock.calls.length;

    rendered.rerender(podTree(pod({ usagePercent: 80, health: "warning" })));
    act(() => frames.advance(10_000));

    expect(screen.getByRole("button").dataset.usageValue).toBe("80.000");
    expect(frames.request).toHaveBeenCalledTimes(requestsAtRest);
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

  it("keeps the actual over-request value in its accessible name", () => {
    renderPod(pod({
      usagePercent: 106.2,
      cpuMillicores: 531,
      cpuRequestMillicores: 500,
      memoryMebibytes: 64,
      memoryRequestMebibytes: 128,
    }));

    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toContain("106.2%");
    expect(button.getAttribute("title")).toBeNull();
  });
});

function renderPod(value: PhysicalTopologyPodValue) {
  return render(podTree(value));
}

function podTree(value: PhysicalTopologyPodValue) {
  return (
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <TooltipProvider delay={0}>
        <PhysicalTopologyPod nodeIndex={0} onOpen={vi.fn()} pod={value} podIndex={0} />
      </TooltipProvider>
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
    cpuLimitMillicores: null,
    memoryMebibytes: null,
    memoryRequestMebibytes: null,
    memoryLimitMebibytes: null,
    phase: "Running",
    health: "healthy",
    restartCount: 0,
    matchesFilter: true,
    ...overrides,
  };
}

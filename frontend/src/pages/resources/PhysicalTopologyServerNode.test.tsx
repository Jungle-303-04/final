// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { PhysicalTopologyServerCard } from "./PhysicalTopologyServerNode";
import { PHYSICAL_TOPOLOGY } from "./ResourcesPage.physicalTestSupport";
import { resourcesNodePodsPort } from "./ResourcesPage.testSupport";
import { physicalServerPlacements } from "./physicalTopologyViewModel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PhysicalTopologyServerCard usage color", () => {
  it("uses only transform for hover motion and a stable server identity", () => {
    installMatchMedia();
    const placement = physicalServerPlacements(PHYSICAL_TOPOLOGY)[0]!;
    renderCard(placement);

    const card = screen.getByRole("article", { name: "서버 worker-a" });
    expect(card.dataset.morphId).toBe("server:cluster-1:node:worker-a");
    expect(card.className).toContain("transition-transform");
    expect(card.className).toContain("motion-reduce:hover:translate-y-0");
    expect(card.className).not.toContain("transition-[border-color,box-shadow,transform]");
    expect(document.querySelector('[data-slot="physical-topology-pods"]')?.className)
      .toContain("grid-cols-6");
  });

  it("updates measured values, smooths color, and removes bars without usage evidence", () => {
    installMatchMedia();
    const frames = installAnimationFrames();
    const initial = physicalServerPlacements(PHYSICAL_TOPOLOGY)[0]!;
    const rendered = renderCard(initial);

    const cpu = document.querySelector<HTMLElement>('[data-metric="cpu"]')!;
    const updated = {
      ...initial,
      server: { ...initial.server, cpuPercent: 90 },
    };
    rendered.rerender(cardTree(updated));

    expect(screen.getByText("90%")).toBeTruthy();
    expect(cpu.dataset.usageValue).toBe("68.000");
    expect(withinMetric(cpu)?.className).toContain("w-full");
    expect(withinMetric(cpu)?.style.transform).toBe("scaleX(0.68)");

    act(() => frames.advance(0));
    act(() => frames.advance(250));
    const stoppedColorValue = Number(cpu.dataset.usageValue);
    expect(stoppedColorValue).toBeCloseTo(81.907, 2);
    const scale = Number(withinMetric(cpu)?.style.transform.slice(7, -1));
    expect(scale).toBeCloseTo(stoppedColorValue / 100, 4);

    rendered.rerender(cardTree({
      ...updated,
      server: { ...updated.server, cpuPercent: null },
    }));
    act(() => frames.advance(1_000));
    expect(cpu.textContent).toContain("—");
    expect(withinMetric(cpu)).toBeNull();
    expect(cpu.dataset.usageValue).toBe("unknown");
  });
});

function renderCard(placement: ReturnType<typeof physicalServerPlacements>[number]) {
  return render(cardTree(placement));
}

function cardTree(placement: ReturnType<typeof physicalServerPlacements>[number]) {
  return (
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <PhysicalTopologyServerCard data={{
        clusterId: "cluster-1",
        index: 0,
        nodePodsPort: resourcesNodePodsPort(),
        onNodePodsUnauthorized: vi.fn(),
        onOpenPod: vi.fn(),
        onRevealServer: vi.fn(),
        placement,
      }} />
    </I18nProvider>
  );
}

function withinMetric(metric: HTMLElement): HTMLElement | null {
  return metric.querySelector<HTMLElement>('[role="progressbar"]');
}

function installMatchMedia() {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
}

function installAnimationFrames() {
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    nextId += 1;
    callbacks.set(nextId, callback);
    return nextId;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => callbacks.delete(id)));
  return {
    advance(timestamp: number) {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback(timestamp));
    },
  };
}

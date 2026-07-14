// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PhysicalTopologyPod as PhysicalTopologyPodValue } from "../../features/resources/physicalTopologyContract";
import { I18nProvider } from "../../shared/i18n";
import { PhysicalTopologyPod } from "./PhysicalTopologyPod";

afterEach(cleanup);

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
});

function renderPod(value: PhysicalTopologyPodValue) {
  return render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <PhysicalTopologyPod nodeIndex={0} onOpen={vi.fn()} pod={value} podIndex={0} />
    </I18nProvider>,
  );
}

function pod(overrides: Partial<PhysicalTopologyPodValue>): PhysicalTopologyPodValue {
  return {
    id: "pod:test",
    name: "test",
    namespace: "default",
    serverId: "node:worker-a",
    usagePercent: null,
    cpuMillicores: null,
    memoryMebibytes: null,
    phase: "Running",
    health: "healthy",
    restartCount: 0,
    matchesFilter: true,
    ...overrides,
  };
}

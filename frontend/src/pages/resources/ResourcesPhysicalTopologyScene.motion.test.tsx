// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { PHYSICAL_TOPOLOGY } from "./ResourcesPage.physicalTestSupport";
import { ResourcesPhysicalTopologyScene } from "./ResourcesPhysicalTopologyScene";
import { resourcesNodePodsPort } from "./ResourcesPage.testSupport";
import type { PhysicalTopologyFrame } from "./usePhysicalTopologyDataFrame";

afterEach(cleanup);

describe("ResourcesPhysicalTopologyScene motion identity", () => {
  it("does not repeat entrance motion when stable resources remount after polling", () => {
    const view = render(scene(readyFrame()));
    const firstServer = screen.getByRole("article", { name: "서버 worker-a" });
    const firstPod = screen.getByRole("button", { name: /checkout-api-0/u });

    expect(firstServer.className).toContain("motion-node-land");
    expect(firstPod.className).toContain("motion-pod-pop");
    expect(firstServer.className).toContain("h-52");

    view.rerender(scene(loadingFrame()));
    expect(document.querySelector('[data-slot="physical-server-skeleton"]')?.className)
      .toContain("h-52");
    view.rerender(scene(readyFrame()));

    expect(screen.getByRole("article", { name: "서버 worker-a" }).className)
      .not.toContain("motion-node-land");
    expect(screen.getByRole("button", { name: /checkout-api-0/u }).className)
      .not.toContain("motion-pod-pop");
  });

  it("keeps the server morph identity stable when server order changes", () => {
    const view = render(scene(readyFrame()));
    const workerA = screen.getByRole("article", { name: "서버 worker-a" });

    expect(workerA.dataset.morphId).toBe("server:cluster-1:node:worker-a");
    view.rerender(scene(readyFrame({
      ...PHYSICAL_TOPOLOGY,
      servers: [...PHYSICAL_TOPOLOGY.servers].reverse(),
    })));

    const reorderedWorkerA = screen.getByRole("article", { name: "서버 worker-a" });
    expect(reorderedWorkerA).toBe(workerA);
    expect(reorderedWorkerA.dataset.morphId).toBe("server:cluster-1:node:worker-a");
  });

  it("keeps the same pod element while realtime evidence changes", () => {
    const view = render(scene(readyFrame()));
    const firstPod = screen.getByRole("button", { name: /checkout-api-0/u });

    view.rerender(scene(readyFrame({
      ...PHYSICAL_TOPOLOGY,
      pods: PHYSICAL_TOPOLOGY.pods.map((pod) => pod.name === "checkout-api-0"
        ? { ...pod, usagePercent: 44, cpuMillicores: 44 }
        : pod),
    })));

    const updatedPod = screen.getByRole("button", { name: /checkout-api-0/u });
    expect(updatedPod).toBe(firstPod);
    expect(updatedPod.getAttribute("aria-label")).toContain("44%");
  });
});

function scene(frame: PhysicalTopologyFrame) {
  return (
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <ResourcesPhysicalTopologyScene
        clusterId="cluster-1"
        frame={frame}
        nodePodsPort={resourcesNodePodsPort()}
        onOpenPod={vi.fn()}
        onNodePodsUnauthorized={vi.fn()}
        onRevealServer={vi.fn()}
        skeletonServerCount={2}
      />
    </I18nProvider>
  );
}

function readyFrame(
  data = PHYSICAL_TOPOLOGY,
): Extract<PhysicalTopologyFrame, { phase: "ready" }> {
  return {
    phase: "ready",
    data,
    failure: null,
    refreshFailure: null,
    refreshing: false,
    updatedAt: 1,
  };
}

function loadingFrame(): Extract<PhysicalTopologyFrame, { phase: "loading" }> {
  return {
    phase: "loading",
    data: null,
    failure: null,
    refreshFailure: null,
    refreshing: false,
    updatedAt: 0,
  };
}

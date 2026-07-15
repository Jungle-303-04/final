// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HomePort } from "../../features/home/homeContract";
import { I18nProvider } from "../../shared/i18n";
import { NodePodsPopover } from "./NodePodsPopover";

afterEach(cleanup);

describe("NodePodsPopover", () => {
  it("loads the real node summary on focus and exposes every returned pod", async () => {
    const port = nodePodsPort();
    renderPopover(port, 4);

    const trigger = screen.getByRole("button", {
      name: "worker-a 서버의 파드 전체 보기",
    });
    fireEvent.focus(trigger);

    const overlay = await screen.findByRole("dialog", {
      name: "worker-a 서버의 파드",
    });
    expect(port.loadNodePods).toHaveBeenCalledWith(
      "cluster-1",
      "worker-a",
      expect.any(AbortSignal),
    );
    expect(within(overlay).getByText("checkout-api-0")).toBeTruthy();
    expect(within(overlay).getByText("orders-api-0")).toBeTruthy();
    expect(within(overlay).getByText("worker-sidecar-0")).toBeTruthy();
    expect(within(overlay).getAllByText("Running · healthy")).toHaveLength(2);
    expect(within(overlay).getByText("245.5m · 382 MiB")).toBeTruthy();
    expect(within(overlay).getByText("재시작 3회")).toBeTruthy();
    expect(within(overlay).getByText("1개 이름을 불러올 수 없음")).toBeTruthy();
  });

  it("opens from a tap and loads the snapshot once", async () => {
    const user = userEvent.setup();
    const port = nodePodsPort();
    renderPopover(port, 3);
    const trigger = screen.getByRole("button", {
      name: "worker-a 서버의 파드 전체 보기",
    });

    await user.click(trigger);
    expect(await screen.findByRole("dialog", { name: "worker-a 서버의 파드" })).toBeTruthy();
    expect(port.loadNodePods).toHaveBeenCalledTimes(1);
  });

  it("opens detail from an actual pod returned by the node contract", async () => {
    const user = userEvent.setup();
    const onOpenPod = vi.fn();
    renderPopover(nodePodsPort(), 3, onOpenPod);

    await user.click(screen.getByRole("button", {
      name: "worker-a 서버의 파드 전체 보기",
    }));
    const overlay = await screen.findByRole("dialog", { name: "worker-a 서버의 파드" });
    fireEvent.click(within(overlay).getByRole("button", {
      name: "checkout-api-0 상세 열기",
    }));

    expect(onOpenPod).toHaveBeenCalledWith(expect.objectContaining({
      name: "checkout-api-0",
      namespace: "shop",
    }));
    expect(screen.queryByRole("dialog", { name: "worker-a 서버의 파드" })).toBeNull();
  });

  it("keeps a clicked overlay pinned after the hover-close delay", async () => {
    const user = userEvent.setup();
    renderPopover(nodePodsPort(), 3);
    const trigger = screen.getByRole("button", {
      name: "worker-a 서버의 파드 전체 보기",
    });

    fireEvent.pointerEnter(trigger);
    await user.click(trigger);
    expect(await screen.findByRole("dialog", { name: "worker-a 서버의 파드" })).toBeTruthy();
    fireEvent.pointerLeave(trigger);
    await new Promise((resolve) => window.setTimeout(resolve, 220));

    expect(screen.getByRole("dialog", { name: "worker-a 서버의 파드" })).toBeTruthy();
  });
});

function renderPopover(
  port: Pick<HomePort, "loadNodePods">,
  expectedTotal: number,
  onOpenPod = vi.fn(),
) {
  return render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <NodePodsPopover
        clusterId="cluster-1"
        expectedTotal={expectedTotal}
        nodeName="worker-a"
        omittedCount={16}
        onOpenPod={onOpenPod}
        onUnauthorized={vi.fn()}
        port={port}
      />
    </I18nProvider>,
  );
}

function nodePodsPort(): Pick<HomePort, "loadNodePods"> {
  return {
    loadNodePods: vi.fn().mockResolvedValue({
      clusterId: "cluster-1",
      completeness: "unknown",
      nodeName: "worker-a",
      pods: [
        {
          id: "pod:cluster-1/worker-a/shop/checkout-api-0",
          identityStability: "ephemeral",
          name: "checkout-api-0",
          namespace: "shop",
          phase: "Running",
          health: "healthy",
          readiness: { ready: 1, total: 1 },
          restartCount: 3,
          owner: { kind: "Deployment", name: "checkout-api" },
          cpuMillicores: 245.5,
          memoryMebibytes: 382,
          incidentCorrelationId: null,
        },
        {
          id: "pod:cluster-1/worker-a/shop/orders-api-0",
          identityStability: "ephemeral",
          name: "orders-api-0",
          namespace: "shop",
          phase: "Pending",
          health: "warning",
          readiness: { ready: 0, total: 1 },
          restartCount: 0,
          owner: null,
          cpuMillicores: null,
          memoryMebibytes: null,
          incidentCorrelationId: null,
        },
        {
          id: "pod:cluster-1/worker-a/ops/worker-sidecar-0",
          identityStability: "ephemeral",
          name: "worker-sidecar-0",
          namespace: "ops",
          phase: "Running",
          health: "healthy",
          readiness: { ready: 1, total: 1 },
          restartCount: 0,
          owner: null,
          cpuMillicores: 8,
          memoryMebibytes: 32,
          incidentCorrelationId: null,
        },
      ],
    }),
  };
}

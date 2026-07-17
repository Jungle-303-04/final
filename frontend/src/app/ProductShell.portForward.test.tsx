// @vitest-environment jsdom

import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PortForwardSession,
  PortForwardSessionPort,
  PortForwardSessionSnapshot,
} from "../features/service-access/portForwardSessionContract";
import {
  installMatchMedia,
  renderShell,
} from "./__tests__/ProductShellInteractionSupport";

beforeEach(() => {
  installMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProductShell port-forward session indicator", () => {
  it("uses one shared session read and links each status to its exact resource surface", async () => {
    const user = userEvent.setup();
    const port = sessionPort([
      session({ id: "running", resourceName: "checkout", status: "running" }),
      session({
        error: "address already in use",
        exitCode: 1,
        id: "failed",
        localPort: 18_081,
        resourceKind: "Pod",
        resourceName: "checkout-abc",
        status: "error",
      }),
      session({
        exitCode: 0,
        id: "stopped",
        localPort: 18_082,
        resourceName: "payments",
        status: "stopped",
      }),
    ]);

    renderShell({
      initialEntry: "/home?clusters=cluster-1",
      portForwardSessions: port,
      releasedSurfaceIds: new Set(["home", "resources"]),
    });

    const trigger = await screen.findByRole("button", {
      name: "포트 전달: 활성 1개, 실패 1개, 종료 1개",
    });
    expect(trigger.className).toContain("motion-reduce:transition-none");
    await waitFor(() => expect(port.list).toHaveBeenCalledTimes(1));

    await user.click(trigger);
    expect((await screen.findByRole("link", {
      name: "Service shop/checkout 포트 전달 관리",
    })).getAttribute("href")).toBe(
      "/resources?clusters=cluster-1&resources.types=service&detail=Service%2Fshop%2Fcheckout",
    );
    expect(screen.getByRole("link", {
      name: "Pod shop/checkout-abc 포트 전달 관리",
    }).getAttribute("href")).toBe(
      "/resources?clusters=cluster-1&resources.types=pod&detail=Pod%2Fshop%2Fcheckout-abc",
    );
    expect(screen.getByText("실행 중")).toBeTruthy();
    expect(screen.getByText("실패")).toBeTruthy();
    expect(screen.getByText("중지됨")).toBeTruthy();
    expect(screen.getByText("address already in use")).toBeTruthy();
    expect(document.querySelector('[data-slot="popover-content"]')?.className)
      .toContain("motion-reduce:data-open:animate-none");
  });

  it("does not render or poll without a native desktop capability", async () => {
    const port = sessionPort([], false);

    renderShell({
      portForwardSessions: port,
      releasedSurfaceIds: new Set(["home", "resources"]),
    });

    await Promise.resolve();
    expect(screen.queryByRole("button", { name: /포트 전달:/u })).toBeNull();
    expect(port.list).not.toHaveBeenCalled();
  });

  it("exposes an accessible registry failure only when the native boundary exists", async () => {
    const port = sessionPort([]);
    port.list.mockRejectedValue(new Error("native registry unavailable"));

    renderShell({
      portForwardSessions: port,
      releasedSurfaceIds: new Set(["home", "resources"]),
    });

    await waitFor(() => expect(port.list).toHaveBeenCalled());
    expect(port.list).toHaveBeenCalledTimes(1);
    const failure = await screen.findByRole("button", { name: /포트 전달/u });
    expect(failure.getAttribute("aria-label")).toBe("네이티브 포트 전달 세션을 불러오지 못했습니다.");
  });
});

function sessionPort(
  sessions: readonly PortForwardSession[],
  available = true,
): PortForwardSessionPort & { list: ReturnType<typeof vi.fn> } {
  return {
    available,
    list: vi.fn().mockResolvedValue(snapshot(sessions)),
    recreate: vi.fn().mockResolvedValue({
      generation: 2,
      localPort: 18_080,
      sessionId: "00000000-0000-4000-8000-000000000002",
      startedAt: "2026-07-17T04:01:00Z",
    }),
    start: vi.fn().mockResolvedValue({
      generation: 1,
      localPort: 18_080,
      sessionId: "00000000-0000-4000-8000-000000000001",
      startedAt: "2026-07-17T04:00:00Z",
    }),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

function snapshot(sessions: readonly PortForwardSession[]): PortForwardSessionSnapshot {
  return {
    refreshPolicy: {
      eventInvalidation: false,
      keepLastSuccess: true,
      pauseWhenHidden: true,
      postMutationRefreshAfterSeconds: 0.5,
      refreshAfterSeconds: 30,
      retryAfterSeconds: null,
      retryLimit: null,
      staleAfterSeconds: null,
    },
    sessions,
  };
}

function session(
  overrides: Partial<PortForwardSession> & Pick<PortForwardSession, "id" | "resourceName" | "status">,
): PortForwardSession {
  const resourceKind = overrides.resourceKind ?? "Service";
  return {
    clusterId: "cluster-1",
    error: null,
    exitCode: null,
    freshness: "live",
    listenAddress: "127.0.0.1",
    localPort: 18_080,
    namespace: "shop",
    podName: resourceKind === "Pod" ? overrides.resourceName : null,
    podPort: 80,
    resourceKind,
    resourceUid: `uid-${overrides.id}`,
    scheme: null,
    serviceName: resourceKind === "Service" ? overrides.resourceName : null,
    servicePort: resourceKind === "Service" ? 80 : null,
    startedAt: "2026-07-17T04:00:00Z",
    workspaceId: "test-workspace",
    ...overrides,
  };
}

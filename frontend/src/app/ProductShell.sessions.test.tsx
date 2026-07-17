// @vitest-environment jsdom

import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GlobalFilterSuggestion } from "../features/global-filter/globalFilterContract";
import type {
  PortForwardSession,
  PortForwardSessionPort,
} from "../features/service-access/portForwardSessionContract";
import {
  installMatchMedia,
  renderShell,
} from "./__tests__/ProductShellInteractionSupport";

beforeEach(() => {
  installMatchMedia(false);
  vi.stubGlobal("ResizeObserver", class {
    disconnect() {}
    observe() {}
    unobserve() {}
  });
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProductShell session-aware cluster switching", () => {
  it("requires one focus-trapped confirmation before changing a cluster with active sessions", async () => {
    const user = userEvent.setup();
    const suggestion: GlobalFilterSuggestion = {
      count: 1,
      count_completeness: "exact",
      id: "cluster-2",
      label: "cluster-2",
      type: "cluster",
    };
    renderShell({
      globalFilterPort: { search: vi.fn().mockResolvedValue([suggestion]) },
      portForwardSessions: portForwardPort([portForwardSession()]),
      releasedSurfaceIds: new Set(["home", "resources"]),
    });

    await user.click(screen.getByRole("textbox", {
      name: "클러스터, 앱, 라벨, 리소스 필터",
    }));
    const clusterOption = await screen.findByText("cluster-2");
    await user.click(clusterOption);

    const confirmation = await screen.findByRole("dialog", {
      name: "활성 세션을 확인하세요",
    });
    expect(confirmation.textContent).toContain("포트 전달 1개");
    await waitFor(() => expect(confirmation.contains(document.activeElement)).toBe(true));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", {
      name: "활성 세션을 확인하세요",
    })).toBeNull());
    expect(screen.getByRole("button", {
      name: "클러스터 필터 cluster-1 제거",
    })).toBeTruthy();

    await user.click(screen.getByRole("textbox", {
      name: "클러스터, 앱, 라벨, 리소스 필터",
    }));
    await user.click(await screen.findByText("cluster-2"));
    await user.click(await screen.findByRole("button", { name: "클러스터 전환" }));

    expect(await screen.findByRole("button", {
      name: "클러스터 필터 cluster-2 제거",
    })).toBeTruthy();
  });
});

function portForwardPort(
  sessions: readonly PortForwardSession[],
): PortForwardSessionPort {
  return {
    available: true,
    list: vi.fn().mockResolvedValue({
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
    }),
    recreate: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function portForwardSession(): PortForwardSession {
  return {
    clusterId: "cluster-1",
    error: null,
    exitCode: null,
    freshness: "live",
    id: "port-forward-1",
    listenAddress: "127.0.0.1",
    localPort: 18_080,
    namespace: "shop",
    podName: "checkout-0",
    podPort: 8080,
    resourceKind: "Pod",
    resourceName: "checkout-0",
    resourceUid: "uid-checkout-0",
    scheme: null,
    serviceName: null,
    servicePort: null,
    startedAt: "2026-07-17T04:00:00Z",
    status: "running",
    workspaceId: "test-workspace",
  };
}

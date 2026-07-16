import { describe, expect, it, vi } from "vitest";

import type { DesktopPortForwardSession } from "../../desktop/desktopBridge";
import type { BrowserRefreshPolicy } from "../../shared/data/browserRefreshPolicyRegistry";
import { createPortForwardSessionAdapter } from "./createPortForwardSessionAdapter";

const POLICY: BrowserRefreshPolicy = {
  staleAfterSeconds: null,
  refreshAfterSeconds: 10,
  keepLastSuccess: true,
  pauseWhenHidden: true,
  eventInvalidation: false,
  retryAfterSeconds: null,
  retryLimit: null,
  postMutationRefreshAfterSeconds: 0.5,
};

describe("createPortForwardSessionAdapter", () => {
  it("combines validated native sessions with the server refresh policy", async () => {
    const listPortForwardSessions = vi.fn().mockResolvedValue([
      session("00000000-0000-4000-8000-000000000002", "2026-07-17T03:01:00Z"),
      session("00000000-0000-4000-8000-000000000001", "2026-07-17T03:00:00Z"),
    ]);
    const adapter = createPortForwardSessionAdapter({
      isDesktop: true,
      listPortForwardSessions,
      stopPortForwardSession: vi.fn(),
    }, {
      getPolicy: vi.fn().mockResolvedValue(POLICY),
    });

    await expect(adapter.list()).resolves.toMatchObject({
      sessions: [
        { id: "00000000-0000-4000-8000-000000000001" },
        { id: "00000000-0000-4000-8000-000000000002" },
      ],
      refreshPolicy: POLICY,
    });
  });

  it("rejects duplicate native identities and an incomplete mutation policy", async () => {
    const duplicate = session("00000000-0000-4000-8000-000000000001", "2026-07-17T03:00:00Z");
    const adapter = createPortForwardSessionAdapter({
      isDesktop: true,
      listPortForwardSessions: vi.fn().mockResolvedValue([duplicate, duplicate]),
      stopPortForwardSession: vi.fn(),
    }, {
      getPolicy: vi.fn().mockResolvedValue(POLICY),
    });
    await expect(adapter.list()).rejects.toThrow("unique");

    const missingFollowUp = createPortForwardSessionAdapter({
      isDesktop: true,
      listPortForwardSessions: vi.fn().mockResolvedValue([]),
      stopPortForwardSession: vi.fn(),
    }, {
      getPolicy: vi.fn().mockResolvedValue({
        ...POLICY,
        postMutationRefreshAfterSeconds: null,
      }),
    });
    await expect(missingFollowUp.list()).rejects.toThrow("mutation refresh policy");
  });

  it("forwards a normalized stop identity only to the native bridge", async () => {
    const stopPortForwardSession = vi.fn().mockResolvedValue(undefined);
    const adapter = createPortForwardSessionAdapter({
      isDesktop: true,
      listPortForwardSessions: vi.fn(),
      stopPortForwardSession,
    });

    await adapter.stop(" 00000000-0000-4000-8000-000000000001 ");

    expect(stopPortForwardSession).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
    );
  });
});

function session(id: string, startedAt: string): DesktopPortForwardSession {
  return {
    id,
    clusterId: "cluster-a",
    namespace: "shop",
    podName: "checkout-abc",
    podPort: 8080,
    localPort: 18_080,
    listenAddress: "127.0.0.1",
    serviceName: "checkout",
    servicePort: 80,
    scheme: "http",
    startedAt,
    status: "running",
    error: null,
  };
}

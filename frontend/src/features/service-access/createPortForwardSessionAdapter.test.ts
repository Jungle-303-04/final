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
      capabilities: vi.fn().mockResolvedValue({
        portForwardSessions: { state: "available" },
      }),
      listPortForwardSessions,
      startPortForward: vi.fn(),
      stopPortForwardSession: vi.fn(),
      recreatePortForward: vi.fn(),
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
      capabilities: vi.fn().mockResolvedValue({
        portForwardSessions: { state: "available" },
      }),
      listPortForwardSessions: vi.fn().mockResolvedValue([duplicate, duplicate]),
      startPortForward: vi.fn(),
      stopPortForwardSession: vi.fn(),
      recreatePortForward: vi.fn(),
    }, {
      getPolicy: vi.fn().mockResolvedValue(POLICY),
    });
    await expect(adapter.list()).rejects.toThrow("unique");

    const missingFollowUp = createPortForwardSessionAdapter({
      isDesktop: true,
      capabilities: vi.fn().mockResolvedValue({
        portForwardSessions: { state: "available" },
      }),
      listPortForwardSessions: vi.fn().mockResolvedValue([]),
      startPortForward: vi.fn(),
      stopPortForwardSession: vi.fn(),
      recreatePortForward: vi.fn(),
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
      capabilities: vi.fn().mockResolvedValue({
        portForwardSessions: { state: "available" },
      }),
      listPortForwardSessions: vi.fn(),
      startPortForward: vi.fn(),
      stopPortForwardSession,
      recreatePortForward: vi.fn(),
    });

    await adapter.stop(" 00000000-0000-4000-8000-000000000001 ");

    expect(stopPortForwardSession).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
    );
  });

  it("starts only a confirmed exact Service or Pod request after the native capability gate", async () => {
    const startPortForward = vi.fn().mockResolvedValue({
      sessionId: "00000000-0000-4000-8000-000000000001",
      generation: 1,
      localPort: 18_080,
      startedAt: "2026-07-17T03:00:00Z",
    });
    const adapter = createPortForwardSessionAdapter({
      isDesktop: true,
      capabilities: vi.fn().mockResolvedValue({
        portForwardSessions: { state: "available" },
      }),
      listPortForwardSessions: vi.fn(),
      startPortForward,
      stopPortForwardSession: vi.fn(),
      recreatePortForward: vi.fn(),
    });
    const request = {
      scope: {
        workspaceId: "workspace-a",
        clusterId: "cluster-a",
        namespaces: ["shop"],
        freshness: "live" as const,
      },
      resource: {
        apiGroup: "" as const,
        version: "v1" as const,
        kind: "Service" as const,
        namespace: "shop",
        name: "checkout",
        uid: "uid-service-1",
      },
      remotePort: 80,
      localPort: 18_080,
      listenAddress: "127.0.0.1" as const,
      confirmation: true as const,
    };

    await expect(adapter.start(request)).resolves.toMatchObject({ localPort: 18_080 });
    expect(startPortForward).toHaveBeenCalledWith(request);
  });

  it("rejects native start in browser mode without invoking the desktop boundary", async () => {
    const startPortForward = vi.fn();
    const adapter = createPortForwardSessionAdapter({
      isDesktop: false,
      capabilities: vi.fn().mockResolvedValue({
        portForwardSessions: { state: "unsupported", reason: "browser" },
      }),
      listPortForwardSessions: vi.fn(),
      startPortForward,
      stopPortForwardSession: vi.fn(),
      recreatePortForward: vi.fn(),
    });

    await expect(adapter.start({
      scope: {
        workspaceId: "workspace-a",
        clusterId: "cluster-a",
        namespaces: ["shop"],
        freshness: "live",
      },
      resource: {
        apiGroup: "",
        version: "v1",
        kind: "Pod",
        namespace: "shop",
        name: "checkout-api-7d9f",
        uid: "uid-pod-1",
      },
      remotePort: 8080,
      localPort: 18_080,
      listenAddress: "127.0.0.1",
      confirmation: true,
    })).rejects.toThrow("unavailable");
    expect(startPortForward).not.toHaveBeenCalled();
  });
});

function session(id: string, startedAt: string): DesktopPortForwardSession {
  return {
    id,
    workspaceId: "workspace-a",
    clusterId: "cluster-a",
    freshness: "live",
    namespace: "shop",
    resourceKind: "Service",
    resourceName: "checkout",
    resourceUid: "uid-service-1",
    podName: null,
    podPort: 8080,
    localPort: 18_080,
    listenAddress: "127.0.0.1",
    serviceName: "checkout",
    servicePort: 80,
    scheme: "http",
    startedAt,
    status: "running",
    error: null,
    exitCode: null,
  };
}

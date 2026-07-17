// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ServiceAccessPort } from "../../features/service-access/serviceAccessContract";
import type { PortForwardSessionPort } from "../../features/service-access/portForwardSessionContract";
import { PortForwardSessionsProvider } from "../../features/service-access/PortForwardSessionsProvider";
import { I18nProvider } from "../../shared/i18n";
import { RESOURCE_DETAIL } from "../../features/resources/createResourcesAdapter.testSupport";
import { endpointResource } from "../../features/resources/createResourcesAdapter.testSupport";
import { toResourceDetail } from "../../features/resources/resourcesCanonical";
import { ServiceAccessActions } from "./ServiceAccessActions";

const DETAIL = toResourceDetail("cluster-1", {
  resourceType: "service",
  kind: "Service",
  namespace: "shop",
  name: "checkout",
}, RESOURCE_DETAIL);

const POD_DETAIL = toResourceDetail("cluster-1", {
  resourceType: "pod",
  kind: "Pod",
  namespace: "shop",
  name: "checkout-api-7d9f",
}, {
  ...RESOURCE_DETAIL,
  identity: {
    resource_type: "pod",
    kind: "Pod",
    namespace: "shop",
    name: "checkout-api-7d9f",
  },
  resource: endpointResource({
    inventory_key: "inventory-pod-1",
    kind: "Pod",
    name: "checkout-api-7d9f",
    uid: "uid-pod-1",
  }),
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderActions(
  port: ServiceAccessPort,
  portForwardSessions?: PortForwardSessionPort,
  detail = DETAIL,
) {
  const actions = (
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <ServiceAccessActions
        detail={detail}
        port={port}
        portForwardSessions={portForwardSessions}
      />
    </I18nProvider>
  );
  return render(portForwardSessions === undefined
    ? actions
    : <PortForwardSessionsProvider port={portForwardSessions}>{actions}</PortForwardSessionsProvider>);
}

function servicePort(): ServiceAccessPort {
  return {
    resolve: vi.fn().mockResolvedValue({
      scope: {
        workspaceId: "workspace-1",
        clusterId: "cluster-1",
        namespaces: ["shop"],
        freshness: "live",
      },
      resource: {
        apiGroup: "",
        version: "v1",
        kind: "Service",
        namespace: "shop",
        name: "checkout",
        uid: "uid-service-1",
      },
      revision: "a".repeat(64),
      serviceRequest: "available",
      serviceRequestReason: null,
      localPortForward: "desktop-required",
      localPortForwardReason: "desktop-agent-port-forward-required",
      portDiscovery: "complete",
      portDiscoveryReason: null,
      ports: [{
        containerName: null,
        port: 80,
        name: "http",
        protocol: "TCP",
        appProtocol: "http",
        defaultScheme: "http",
      }],
    }),
    start: vi.fn().mockResolvedValue({
      accepted: true,
      eventId: "evt-service-1",
      auditEventId: "evt-service-1",
      correlationId: "corr-service-1",
      commandId: "cmd-service-1",
      status: "queued",
    }),
    cancel: vi.fn(),
  };
}

function podPort(overrides: Record<string, unknown> = {}): ServiceAccessPort {
  const descriptor = {
    scope: {
      workspaceId: "workspace-1",
      clusterId: "cluster-1",
      namespaces: ["shop"],
      freshness: "live" as const,
    },
    resource: {
      apiGroup: "",
      version: "v1",
      kind: "Pod",
      namespace: "shop",
      name: "checkout-api-7d9f",
      uid: "uid-pod-1",
    },
    revision: "b".repeat(64),
    serviceRequest: "unavailable" as const,
    serviceRequestReason: "pod_service_request_unsupported",
    localPortForward: "desktop-required" as const,
    localPortForwardReason: "desktop-agent-port-forward-required",
    portDiscovery: "complete" as const,
    portDiscoveryReason: null,
    ports: [
      {
        containerName: "app",
        port: 8080,
        name: "http",
        protocol: "TCP" as const,
        appProtocol: null,
        defaultScheme: "http" as const,
      },
      {
        containerName: "metrics",
        port: 8080,
        name: "metrics",
        protocol: "TCP" as const,
        appProtocol: null,
        defaultScheme: "http" as const,
      },
    ],
    ...overrides,
  };
  return {
    resolve: vi.fn().mockResolvedValue(descriptor),
    start: vi.fn(),
    cancel: vi.fn(),
  };
}

function sessionPort(): PortForwardSessionPort & {
  start: ReturnType<typeof vi.fn>;
} {
  return {
    available: true,
    list: vi.fn().mockResolvedValue({
      sessions: [],
      refreshPolicy: {
        staleAfterSeconds: null,
        refreshAfterSeconds: 10,
        keepLastSuccess: true,
        pauseWhenHidden: true,
        eventInvalidation: false,
        retryAfterSeconds: null,
        retryLimit: null,
        postMutationRefreshAfterSeconds: 0.5,
      },
    }),
    start: vi.fn().mockResolvedValue({
      sessionId: "00000000-0000-4000-8000-000000000001",
      generation: 1,
      localPort: 18_080,
      startedAt: "2026-07-17T03:00:00Z",
    }),
    stop: vi.fn(),
    recreate: vi.fn(),
  };
}

describe("ServiceAccessActions", () => {
  it("uses shared inputs for the bounded in-cluster HTTP request and hands off its command session", async () => {
    const port = servicePort();
    const user = userEvent.setup();
    renderActions(port);

    await user.click(await screen.findByRole("button", { name: "HTTP request" }));
    const path = screen.getByLabelText("Path");
    expect(path.getAttribute("data-slot")).toBe("input");
    await user.clear(path);
    await user.type(path, "/ready");
    await user.click(screen.getByRole("button", { name: "Run request" }));

    await waitFor(() => expect(port.start).toHaveBeenCalledWith(
      expect.objectContaining({ resource: expect.objectContaining({ uid: "uid-service-1" }) }),
      {
        port: 80,
        scheme: "http",
        path: "/ready",
        reason: "Inspect Service checkout through its exact observed identity.",
      },
    ));
    expect(await screen.findByText(/corr-service-1/u)).toBeTruthy();
    expect(screen.getByTestId("service-access-session").classList.contains("max-w-[26rem]")).toBe(true);
  });

  it("does not expose a direct target command when the agent tunnel is absent", async () => {
    const port = servicePort();
    renderActions(port);

    await screen.findByRole("button", { name: "HTTP request" });
    expect(screen.queryByRole("button", { name: "Port forwarding" })).toBeNull();
    expect(port.start).not.toHaveBeenCalled();
  });

  it("starts the exact Service forward only after one native confirmation", async () => {
    const sessions = sessionPort();
    const user = userEvent.setup();
    renderActions(servicePort(), sessions);

    await user.click(await screen.findByRole("button", { name: "Port forwarding" }));
    const localPort = screen.getByLabelText("Local port");
    await user.clear(localPort);
    await user.type(localPort, "18080");
    expect(sessions.start).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Start port forwarding" }));

    await waitFor(() => expect(sessions.start).toHaveBeenCalledWith({
      scope: {
        workspaceId: "workspace-1",
        clusterId: "cluster-1",
        namespaces: ["shop"],
        freshness: "live",
      },
      resource: {
        apiGroup: "",
        version: "v1",
        kind: "Service",
        namespace: "shop",
        name: "checkout",
        uid: "uid-service-1",
      },
      capabilityRevision: "a".repeat(64),
      remotePort: 80,
      localPort: 18_080,
      listenAddress: "127.0.0.1",
      confirmation: true,
    }, expect.any(AbortSignal)));
    expect(await screen.findByText(/18080/u)).toBeTruthy();
  });

  it("does not expose Pod forwarding without the agent-backed desktop session port", async () => {
    const port = podPort();
    renderActions(port, undefined, POD_DETAIL);

    await waitFor(() => expect(port.resolve).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "HTTP request" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Port forwarding" })).toBeNull();
  });

  it("re-resolves an exact Pod before one native confirmation and blocks a stale UID", async () => {
    const initial = podPort();
    const initialResolve = initial.resolve as ReturnType<typeof vi.fn>;
    initialResolve
      .mockResolvedValueOnce(await podPort().resolve("inventory-pod-1"))
      .mockResolvedValueOnce({
        ...await podPort().resolve("inventory-pod-1"),
        resource: {
          ...(await podPort().resolve("inventory-pod-1")).resource,
          uid: "uid-pod-recreated",
        },
      });
    const sessions = sessionPort();
    const user = userEvent.setup();
    renderActions(initial, sessions, POD_DETAIL);

    await user.click(await screen.findByRole("button", { name: "Port forwarding" }));
    await user.click(screen.getByRole("button", { name: "Start port forwarding" }));

    await waitFor(() => expect(initial.resolve).toHaveBeenCalledTimes(2));
    expect(sessions.start).not.toHaveBeenCalled();
    expect(await screen.findByText(/changed since it was observed/u)).toBeTruthy();
  });

  it("omits the unavailable Pod action when no observed TCP port exists", async () => {
    renderActions(podPort({
      localPortForward: "unavailable",
      localPortForwardReason: "port-forward-no-tcp-ports",
      portDiscovery: "unavailable",
      portDiscoveryReason: "port-forward-no-tcp-ports",
      ports: [],
    }), undefined, POD_DETAIL);

    await waitFor(() => expect(screen.queryByRole("button", { name: "Port forwarding" })).toBeNull());
  });

  it("keeps partial Pod discovery hidden until the audited tunnel exists", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    renderActions(podPort({
      portDiscovery: "partial",
      portDiscoveryReason: "port-discovery-partial",
    }), undefined, POD_DETAIL);

    await waitFor(() => expect(screen.queryByRole("button", { name: "Port forwarding" })).toBeNull());
  });

  it("renders the native session list without clipping long identities", async () => {
    const sessions: PortForwardSessionPort = {
      available: true,
      list: vi.fn().mockResolvedValue({
        sessions: [{
          id: "session-native-a",
          workspaceId: "workspace-1",
          clusterId: "cluster-1",
          freshness: "live",
          namespace: "shop",
          resourceKind: "Service",
          resourceName: "checkout-deployment-with-a-very-long-identity-abcdef",
          resourceUid: "uid-service-1",
          podName: null,
          podPort: 8080,
          localPort: 18080,
          listenAddress: "127.0.0.1",
          serviceName: "checkout",
          servicePort: 80,
          scheme: "http",
          startedAt: "2026-07-17T03:00:00Z",
          status: "running",
          error: null,
          exitCode: null,
        }],
        refreshPolicy: {
          staleAfterSeconds: null,
          refreshAfterSeconds: 10,
          keepLastSuccess: true,
          pauseWhenHidden: true,
          eventInvalidation: false,
          retryAfterSeconds: null,
          retryLimit: null,
          postMutationRefreshAfterSeconds: 0.5,
        },
      }),
      start: vi.fn(),
      stop: vi.fn(),
      recreate: vi.fn(),
    };
    renderActions(servicePort(), sessions);

    expect(await screen.findByRole("heading", { name: "Port-forward sessions" })).toBeTruthy();
    expect(screen.getByText("127.0.0.1:18080")).toBeTruthy();
    const identity = screen.getByTitle("shop/checkout-deployment-with-a-very-long-identity-abcdef");
    expect(identity.classList.contains("truncate")).toBe(true);
  });
});

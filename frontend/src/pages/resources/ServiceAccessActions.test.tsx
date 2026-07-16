// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ServiceAccessPort } from "../../features/service-access/serviceAccessContract";
import type { PortForwardSessionPort } from "../../features/service-access/portForwardSessionContract";
import { I18nProvider } from "../../shared/i18n";
import { RESOURCE_DETAIL } from "../../features/resources/createResourcesAdapter.testSupport";
import { toResourceDetail } from "../../features/resources/resourcesCanonical";
import { ServiceAccessActions } from "./ServiceAccessActions";

const DETAIL = toResourceDetail("cluster-1", {
  resourceType: "service",
  kind: "Service",
  namespace: "shop",
  name: "checkout",
}, RESOURCE_DETAIL);

afterEach(cleanup);

function renderActions(port: ServiceAccessPort, portForwardSessions?: PortForwardSessionPort) {
  return render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <ServiceAccessActions
        detail={DETAIL}
        port={port}
        portForwardSessions={portForwardSessions}
      />
    </I18nProvider>,
  );
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
      localPortForwardReason: "desktop-port-forward-bridge-required",
      ports: [{
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

  it("makes the native ownership boundary explicit and only builds a manual kubectl command", async () => {
    const port = servicePort();
    const user = userEvent.setup();
    renderActions(port);

    await user.click(await screen.findByRole("button", { name: "Port forwarding" }));
    expect(screen.getByText(/The browser does not bind local ports\./u)).toBeTruthy();
    const localPort = screen.getByLabelText("Local port");
    expect(localPort.getAttribute("data-slot")).toBe("input");
    await user.clear(localPort);
    await user.type(localPort, "18080");
    expect(screen.getByText(
      "kubectl -n shop port-forward service/checkout 18080:80 --address 127.0.0.1",
    )).toBeTruthy();
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
      remotePort: 80,
      localPort: 18_080,
      listenAddress: "127.0.0.1",
      confirmation: true,
    }, expect.any(AbortSignal)));
    expect(await screen.findByText(/18080/u)).toBeTruthy();
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

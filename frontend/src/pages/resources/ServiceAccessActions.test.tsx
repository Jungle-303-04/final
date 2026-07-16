// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ServiceAccessPort } from "../../features/service-access/serviceAccessContract";
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

function renderActions(port: ServiceAccessPort) {
  return render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <ServiceAccessActions detail={DETAIL} port={port} />
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
});

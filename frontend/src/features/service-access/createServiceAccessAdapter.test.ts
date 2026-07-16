import { describe, expect, it, vi } from "vitest";

import { createServiceAccessAdapter } from "./createServiceAccessAdapter";
import type { ServiceAccessCapabilities } from "./serviceAccessContract";

const CAPABILITIES: ServiceAccessCapabilities = {
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
    name: "checkout-api",
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
};

describe("service access adapter", () => {
  it("keeps the server-issued ResourceRef and audit identifiers through request creation", async () => {
    const resolveServiceAccess = vi.fn().mockResolvedValue({
      scope: {
        workspace_id: "workspace-1",
        cluster_id: "cluster-1",
        namespaces: ["shop"],
        freshness: "live",
      },
      resource: {
        api_group: "",
        version: "v1",
        kind: "Service",
        namespace: "shop",
        name: "checkout-api",
        uid: "uid-service-1",
      },
      revision: "a".repeat(64),
      service_request: "available",
      service_request_reason: null,
      local_port_forward: "desktop_required",
      local_port_forward_reason: "desktop_port_forward_bridge_required",
      ports: [{
        port: 80,
        name: "http",
        protocol: "TCP",
        app_protocol: "http",
        default_scheme: "http",
      }],
    });
    const startServiceRequest = vi.fn().mockResolvedValue({
      accepted: true,
      event_id: "evt-service-1",
      audit_event_id: "evt-service-1",
      correlation_id: "corr-service-1",
      command_id: "cmd-service-1",
      status: "queued",
    });
    const cancelCommand = vi.fn();
    const port = createServiceAccessAdapter({
      cancelCommand,
      resolveServiceAccess,
      startServiceRequest,
    });

    await expect(port.resolve("inventory-service-1")).resolves.toEqual(CAPABILITIES);
    await expect(port.start(CAPABILITIES, {
      port: 80,
      scheme: "http",
      path: "/ready",
      reason: "verify readiness",
    })).resolves.toMatchObject({
      commandId: "cmd-service-1",
      auditEventId: "evt-service-1",
    });
    expect(startServiceRequest).toHaveBeenCalledWith({
      scope: {
        workspace_id: "workspace-1",
        cluster_id: "cluster-1",
        namespaces: ["shop"],
        freshness: "live",
      },
      resource: {
        api_group: "",
        version: "v1",
        kind: "Service",
        namespace: "shop",
        name: "checkout-api",
        uid: "uid-service-1",
      },
      port: 80,
      scheme: "http",
      path: "/ready",
      confirmation: true,
      reason: "verify readiness",
    }, undefined);
  });

  it("rejects a port absent from the exact capability and keeps cancel delivery idempotent", async () => {
    const cancelCommand = vi.fn().mockResolvedValue({
      accepted: true,
      command_id: "cmd-service-1",
      action: "cancel",
      event_id: "evt-cancel-1",
      audit_event_id: "evt-cancel-1",
      correlation_id: "corr-service-1",
      status: "cancel_requested",
      idempotent: false,
      attempt_id: null,
    });
    const port = createServiceAccessAdapter({
      cancelCommand,
      resolveServiceAccess: vi.fn(),
      startServiceRequest: vi.fn(),
      idempotencyKey: () => "service-cancel-key",
    });

    await expect(port.start(CAPABILITIES, {
      port: 8080,
      scheme: "http",
      path: "/",
      reason: "invalid port",
    })).rejects.toThrow(TypeError);
    await port.cancel("cmd-service-1");
    await port.cancel("cmd-service-1");
    expect(cancelCommand).toHaveBeenNthCalledWith(1, {
      commandId: "cmd-service-1",
      idempotencyKey: "service-cancel-key",
      reason: "cancel bounded service request",
    }, undefined);
    expect(cancelCommand).toHaveBeenNthCalledWith(2, {
      commandId: "cmd-service-1",
      idempotencyKey: "service-cancel-key",
      reason: "cancel bounded service request",
    }, undefined);
  });
});

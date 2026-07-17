import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveServiceAccess, startServiceRequest } from "./service-access";

const CAPABILITIES = {
  scope: {
    workspace_id: "workspace-main",
    cluster_id: "cluster-a",
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
  local_port_forward_reason: "desktop_agent_port_forward_required",
  port_discovery: "complete",
  port_discovery_reason: null,
  ports: [{
    container_name: null,
    port: 8080,
    name: "http",
    protocol: "TCP",
    app_protocol: "http",
    default_scheme: "http",
  }],
} as const;

describe("service access API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("resolves one encoded inventory key through the strict capability schema", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(CAPABILITIES), { status: 200 }),
    );

    await expect(resolveServiceAccess(" service/key ")).resolves.toEqual(CAPABILITIES);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/service-access/capabilities?resource=service%2Fkey",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("starts only an explicit bounded request and validates the audit receipt", async () => {
    const input = {
      scope: {
        ...CAPABILITIES.scope,
        namespaces: [...CAPABILITIES.scope.namespaces],
      },
      resource: CAPABILITIES.resource,
      port: 8080,
      scheme: "http" as const,
      path: "/health",
      confirmation: true as const,
      reason: "verify the service endpoint",
    };
    const receipt = {
      accepted: true,
      event_id: "event-1",
      audit_event_id: "event-1",
      correlation_id: "correlation-1",
      command_id: "command-1",
      status: "queued",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(receipt), { status: 202 }),
    );

    await expect(startServiceRequest(input)).resolves.toEqual(receipt);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/service-access/requests",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
  });

  it("rejects empty identities and malformed capability ordering", async () => {
    expect(() => resolveServiceAccess("  ")).toThrow(TypeError);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        ...CAPABILITIES,
        ports: [
          { ...CAPABILITIES.ports[0], port: 8081 },
          CAPABILITIES.ports[0],
        ],
      }), { status: 200 }),
    );
    await expect(resolveServiceAccess("service-key"))
      .rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

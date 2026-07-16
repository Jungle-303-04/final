import { describe, expect, it } from "vitest";

import {
  serviceAccessCapabilitiesSchema,
  serviceRequestOperationResultSchema,
} from "./serviceAccessSchemas";

const CAPABILITIES = {
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
  ports: [
    {
      port: 80,
      name: "http",
      protocol: "TCP",
      app_protocol: "http",
      default_scheme: "http",
    },
    {
      port: 443,
      name: "https",
      protocol: "TCP",
      app_protocol: "https",
      default_scheme: "https",
    },
  ],
};

describe("service access strict schemas", () => {
  it("accepts an exact sorted capability response and rejects additive wire fields", () => {
    expect(serviceAccessCapabilitiesSchema.parse(CAPABILITIES).ports).toHaveLength(2);
    expect(() => serviceAccessCapabilitiesSchema.parse({
      ...CAPABILITIES,
      browser_owns_local_port: true,
    })).toThrow();
  });

  it("rejects duplicate or unsorted service ports", () => {
    expect(() => serviceAccessCapabilitiesSchema.parse({
      ...CAPABILITIES,
      ports: [CAPABILITIES.ports[1], CAPABILITIES.ports[0]],
    })).toThrow();
    expect(() => serviceAccessCapabilitiesSchema.parse({
      ...CAPABILITIES,
      ports: [CAPABILITIES.ports[0], CAPABILITIES.ports[0]],
    })).toThrow();
  });

  it("parses only the bounded service result nested in a terminal OperationEvent", () => {
    const parsed = serviceRequestOperationResultSchema.parse({
      status: 200,
      status_text: "OK",
      duration_ms: 8,
      headers: { "content-type": "application/json" },
      body: "{\"ok\":true}",
      truncated: false,
      body_bytes: 11,
      error: null,
    });
    expect(parsed.status).toBe(200);
    expect(() => serviceRequestOperationResultSchema.parse({
      ...parsed,
      body_bytes: 512 * 1024 + 1,
    })).toThrow();
  });
});

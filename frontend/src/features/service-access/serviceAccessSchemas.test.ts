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
  port_discovery: "complete",
  port_discovery_reason: null,
  ports: [
    {
      container_name: null,
      port: 80,
      name: "http",
      protocol: "TCP",
      app_protocol: "http",
      default_scheme: "http",
    },
    {
      container_name: null,
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

  it("accepts only exact Pod container TCP descriptors and explicit partial discovery", () => {
    const pod = serviceAccessCapabilitiesSchema.parse({
      ...CAPABILITIES,
      resource: {
        ...CAPABILITIES.resource,
        kind: "Pod",
        name: "checkout-api-7d9f",
        uid: "uid-pod-1",
      },
      service_request: "unavailable",
      service_request_reason: "pod_service_request_unsupported",
      port_discovery: "partial",
      port_discovery_reason: "port_discovery_partial",
      ports: [{
        container_name: "app",
        port: 8080,
        name: "http",
        protocol: "TCP",
        app_protocol: null,
        default_scheme: "http",
      }],
    });

    expect(pod.ports[0]?.container_name).toBe("app");
    expect(() => serviceAccessCapabilitiesSchema.parse({
      ...pod,
      ports: [{ ...pod.ports[0], protocol: "UDP" }],
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

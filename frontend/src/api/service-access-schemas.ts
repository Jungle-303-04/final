import { z } from "zod";

const dnsLabelSchema = z.string()
  .regex(/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/u)
  .max(63);

export const serviceAccessCapabilitiesSchema = z.strictObject({
  scope: z.strictObject({
    workspace_id: z.string().min(1),
    cluster_id: z.string().min(1),
    namespaces: z.array(z.string().min(1)),
    freshness: z.enum(["live", "stale", "partial", "disconnected"]),
  }),
  resource: z.strictObject({
    api_group: z.union([z.literal(""), z.literal("core")]),
    version: z.literal("v1"),
    kind: z.string().refine((value) => value.toLocaleLowerCase() === "service"),
    namespace: dnsLabelSchema,
    name: dnsLabelSchema,
    uid: z.string().min(1),
  }),
  revision: z.string().regex(/^[0-9a-f]{64}$/u),
  service_request: z.enum(["available", "forbidden", "unavailable"]),
  service_request_reason: z.string().min(1).max(240).nullable(),
  local_port_forward: z.literal("desktop_required"),
  local_port_forward_reason: z.literal("desktop_port_forward_bridge_required"),
  ports: z.array(z.strictObject({
    port: z.number().int().min(1).max(65_535),
    name: z.string().min(1).max(63).nullable(),
    protocol: z.literal("TCP"),
    app_protocol: z.string().min(1).max(120).nullable(),
    default_scheme: z.enum(["http", "https"]),
  })),
}).superRefine((capabilities, context) => {
  const namespaces = [...new Set(capabilities.scope.namespaces)].sort();
  if (
    namespaces.length !== capabilities.scope.namespaces.length
    || namespaces.some((namespace, index) => namespace !== capabilities.scope.namespaces[index])
  ) {
    context.addIssue({
      code: "custom",
      message: "scope namespaces must be sorted and unique",
      path: ["scope", "namespaces"],
    });
  }
  if (
    (capabilities.service_request === "available")
    !== (capabilities.service_request_reason === null)
  ) {
    context.addIssue({
      code: "custom",
      message: "service availability reason is inconsistent",
      path: ["service_request_reason"],
    });
  }
  const ports = capabilities.ports.map(({ port }) => port);
  if (
    new Set(ports).size !== ports.length
    || ports.some((port, index) => index > 0 && port <= ports[index - 1]!)
  ) {
    context.addIssue({
      code: "custom",
      message: "service ports must be sorted and unique",
      path: ["ports"],
    });
  }
});

export type ServiceAccessCapabilitiesEndpoint = z.infer<
  typeof serviceAccessCapabilitiesSchema
>;

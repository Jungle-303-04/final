import { z } from "zod";

const MAX_BODY_BYTES = 512 * 1024;
const MAX_HEADER_VALUE_BYTES = 4 * 1024;

export const serviceAccessScopeSchema = z.strictObject({
  workspace_id: z.string().min(1),
  cluster_id: z.string().min(1),
  namespaces: z.array(z.string().min(1)),
  freshness: z.enum(["live", "stale", "partial", "disconnected"]),
}).superRefine((scope, context) => {
  const sorted = [...new Set(scope.namespaces)].sort();
  if (
    sorted.length !== scope.namespaces.length
    || sorted.some((namespace, index) => namespace !== scope.namespaces[index])
  ) {
    context.addIssue({ code: "custom", message: "scope namespaces must be sorted and unique" });
  }
});

export const serviceResourceRefSchema = z.strictObject({
  api_group: z.union([z.literal(""), z.literal("core")]),
  version: z.literal("v1"),
  kind: z.string().refine((value) => value.toLocaleLowerCase() === "service"),
  namespace: z.string().regex(/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/u).max(63),
  name: z.string().regex(/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/u).max(63),
  uid: z.string().min(1),
});

export const serviceAccessPortSchema = z.strictObject({
  port: z.number().int().min(1).max(65_535),
  name: z.string().min(1).max(63).nullable(),
  protocol: z.literal("TCP"),
  app_protocol: z.string().min(1).max(120).nullable(),
  default_scheme: z.enum(["http", "https"]),
});

export const serviceAccessCapabilitiesSchema = z.strictObject({
  scope: serviceAccessScopeSchema,
  resource: serviceResourceRefSchema,
  revision: z.string().regex(/^[0-9a-f]{64}$/u),
  service_request: z.enum(["available", "forbidden", "unavailable"]),
  service_request_reason: z.string().min(1).max(240).nullable(),
  local_port_forward: z.literal("desktop_required"),
  local_port_forward_reason: z.literal("desktop_port_forward_bridge_required"),
  ports: z.array(serviceAccessPortSchema),
}).superRefine((capabilities, context) => {
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
  const values = capabilities.ports.map(({ port }) => port);
  if (
    new Set(values).size !== values.length
    || values.some((port, index) => index > 0 && port <= values[index - 1]!)
  ) {
    context.addIssue({
      code: "custom",
      message: "service ports must be sorted and unique",
      path: ["ports"],
    });
  }
});

export const serviceRequestOperationResultSchema = z.strictObject({
  status: z.number().int().min(100).max(599),
  status_text: z.string().max(120),
  duration_ms: z.number().int().nonnegative(),
  headers: z.record(z.string(), z.string()),
  body: z.string(),
  truncated: z.boolean(),
  body_bytes: z.number().int().min(0).max(MAX_BODY_BYTES),
  error: z.string().max(500).nullable(),
}).superRefine((result, context) => {
  const encoder = new TextEncoder();
  if (encoder.encode(result.body).byteLength !== result.body_bytes) {
    context.addIssue({ code: "custom", message: "body byte count is inconsistent" });
  }
  if (
    Object.keys(result.headers).length > 100
    || Object.values(result.headers).some(
      (value) => encoder.encode(value).byteLength > MAX_HEADER_VALUE_BYTES,
    )
  ) {
    context.addIssue({ code: "custom", message: "response headers exceed the bounded contract" });
  }
});

export type ServiceAccessCapabilitiesEndpoint = z.infer<typeof serviceAccessCapabilitiesSchema>;
export type ServiceRequestOperationResultEndpoint = z.infer<typeof serviceRequestOperationResultSchema>;

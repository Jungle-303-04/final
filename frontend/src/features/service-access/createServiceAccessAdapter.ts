import type {
  ServiceAccessCapabilities,
  ServiceAccessPort,
  ServiceRequestOperationResult,
} from "./serviceAccessContract";
import type {
  ServiceAccessEndpointDependencies,
} from "./serviceAccessEndpointContract";
import type {
  ServiceAccessCapabilitiesEndpoint,
  ServiceRequestOperationResultEndpoint,
} from "./serviceAccessSchemas";
import { serviceRequestOperationResultSchema } from "./serviceAccessSchemas";

export function createServiceAccessAdapter(
  endpoints: ServiceAccessEndpointDependencies,
): ServiceAccessPort {
  const cancelKeys = new Map<string, string>();
  return {
    async resolve(resourceId, signal) {
      const normalized = resourceId.trim();
      if (!normalized) throw new TypeError("service access resource id is required");
      return toCapabilities(await endpoints.resolveServiceAccess(normalized, signal));
    },
    async start(capabilities, input, signal) {
      if (capabilities.serviceRequest !== "available") {
        throw new TypeError("service request capability is unavailable");
      }
      if (!capabilities.ports.some(({ port }) => port === input.port)) {
        throw new TypeError("service request port is outside the exact capability");
      }
      const path = normalizedPath(input.path);
      const reason = input.reason.trim();
      if (!reason) throw new TypeError("service request reason is required");
      const receipt = await endpoints.startServiceRequest({
        scope: {
          workspace_id: capabilities.scope.workspaceId,
          cluster_id: capabilities.scope.clusterId,
          namespaces: [...capabilities.scope.namespaces],
          freshness: capabilities.scope.freshness,
        },
        resource: {
          api_group: capabilities.resource.apiGroup,
          version: "v1",
          kind: capabilities.resource.kind,
          namespace: capabilities.resource.namespace,
          name: capabilities.resource.name,
          uid: capabilities.resource.uid,
        },
        port: input.port,
        scheme: input.scheme,
        path,
        confirmation: true,
        reason,
      }, signal);
      if (receipt.audit_event_id !== receipt.event_id) {
        throw new TypeError("service request audit identity is invalid");
      }
      return {
        accepted: receipt.accepted,
        eventId: receipt.event_id,
        auditEventId: receipt.audit_event_id,
        correlationId: receipt.correlation_id,
        commandId: receipt.command_id,
        status: receipt.status,
      };
    },
    async cancel(commandId, signal) {
      const normalized = commandId.trim();
      if (!normalized) throw new TypeError("service request command id is required");
      let key = cancelKeys.get(normalized);
      if (!key) {
        key = endpoints.idempotencyKey?.() ?? defaultIdempotencyKey();
        cancelKeys.set(normalized, key);
      }
      await endpoints.cancelCommand({
        commandId: normalized,
        idempotencyKey: key,
        reason: "cancel bounded service request",
      }, signal);
    },
  };
}

export function toServiceRequestOperationResult(
  value: unknown,
): ServiceRequestOperationResult | null {
  const parsed = serviceRequestOperationResultSchema.safeParse(value);
  if (!parsed.success) return null;
  return toOperationResult(parsed.data);
}

function toCapabilities(
  value: ServiceAccessCapabilitiesEndpoint,
): ServiceAccessCapabilities {
  return {
    scope: {
      workspaceId: value.scope.workspace_id,
      clusterId: value.scope.cluster_id,
      namespaces: [...value.scope.namespaces],
      freshness: value.scope.freshness,
    },
    resource: {
      apiGroup: value.resource.api_group,
      version: value.resource.version,
      kind: value.resource.kind,
      namespace: value.resource.namespace,
      name: value.resource.name,
      uid: value.resource.uid,
    },
    revision: value.revision,
    serviceRequest: value.service_request,
    serviceRequestReason: value.service_request_reason,
    localPortForward: value.local_port_forward === "desktop_required"
      ? "desktop-required"
      : "unavailable",
    localPortForwardReason: value.local_port_forward_reason.replace(/_/gu, "-"),
    portDiscovery: value.port_discovery,
    portDiscoveryReason: value.port_discovery_reason?.replace(/_/gu, "-") ?? null,
    ports: value.ports.map((port) => ({
      containerName: port.container_name,
      port: port.port,
      name: port.name,
      protocol: port.protocol,
      appProtocol: port.app_protocol,
      defaultScheme: port.default_scheme,
    })),
  };
}

function toOperationResult(
  value: ServiceRequestOperationResultEndpoint,
): ServiceRequestOperationResult {
  return {
    status: value.status,
    statusText: value.status_text,
    durationMs: value.duration_ms,
    headers: { ...value.headers },
    body: value.body,
    truncated: value.truncated,
    bodyBytes: value.body_bytes,
    error: value.error,
  };
}

function normalizedPath(value: string): string {
  const normalized = value.trim();
  if (
    !normalized.startsWith("/")
    || normalized.startsWith("//")
    || normalized.includes("#")
    || /[\r\n\0]/u.test(normalized)
  ) {
    throw new TypeError("service request path must remain relative to the exact Service");
  }
  return normalized;
}

function defaultIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `service-${crypto.randomUUID()}`;
  }
  return `service-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

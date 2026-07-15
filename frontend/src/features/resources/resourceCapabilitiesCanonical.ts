import type {
  ResourceCapabilities,
  ResourceActionReceipt,
} from "./resourceCapabilitiesContract";
import type { ResourceCapabilitiesEndpointResponse } from "./resourceCapabilitiesEndpointContract";
import { ResourcesCanonicalError } from "./resourcesValidation";

export function toResourceCapabilities(
  requestedResourceId: string,
  value: ResourceCapabilitiesEndpointResponse,
): ResourceCapabilities {
  if (value.subject.resource_id !== requestedResourceId) {
    throw new ResourcesCanonicalError();
  }
  return {
    subject: {
      resourceId: value.subject.resource_id,
      snapshotId: value.subject.snapshot_id,
      clusterId: value.subject.cluster_id,
      resourceType: value.subject.resource_type,
      kind: value.subject.kind,
      namespace: value.subject.namespace,
      name: value.subject.name,
    },
    revision: value.revision,
    capabilities: value.capabilities.map((item) => ({
      capabilityId: item.capability_id,
      label: item.label,
      description: item.description,
      execution: item.execution,
      confirmationRequired: item.confirmation_required,
      realtime: item.realtime,
      inputSchema: item.input_schema.map((input) => ({
        key: input.key,
        label: input.label,
        type: input.type,
        required: input.required,
        minimum: input.minimum,
        maximum: input.maximum,
        default: input.default,
      })),
      method: item.method,
      path: item.path,
    })),
  };
}

export function toResourceActionReceipt(value: {
  accepted: boolean;
  event_id: string;
  correlation_id: string;
  command_id?: string | null;
}): ResourceActionReceipt {
  return {
    accepted: value.accepted,
    eventId: value.event_id,
    correlationId: value.correlation_id,
    commandId: value.command_id ?? null,
  };
}

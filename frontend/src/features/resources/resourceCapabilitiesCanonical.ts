import type {
  ResourceCapabilities,
  ResourceActionReceipt,
  ResourceActionStatus,
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
        prefillResultKey: input.prefill_result_key,
      })),
      method: item.method,
      path: item.path,
      requestContext: item.request_context,
      resultIntent: item.result_intent,
    })),
  };
}

export function toResourceActionReceipt(value: {
  accepted: true;
  event_id: string;
  audit_event_id: string;
  correlation_id: string;
  command_id: string;
  status: ResourceActionStatus;
}): ResourceActionReceipt {
  return {
    accepted: value.accepted,
    eventId: value.event_id,
    auditEventId: value.audit_event_id,
    correlationId: value.correlation_id,
    commandId: value.command_id,
    status: value.status,
  };
}

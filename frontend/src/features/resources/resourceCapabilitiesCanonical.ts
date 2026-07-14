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
      method: item.method,
      path: item.path,
    })),
  };
}

export function toResourceActionReceipt(value: {
  accepted: boolean;
  event_id: string;
  correlation_id: string;
}): ResourceActionReceipt {
  return {
    accepted: value.accepted,
    eventId: value.event_id,
    correlationId: value.correlation_id,
  };
}

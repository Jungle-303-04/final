import type {
  ResourceFacts,
  ResourceInvolvedFact,
  ResourceOwnerFact,
  ResourcePortFact,
  ResourceReadinessFact,
} from "./resourcesContract";
import {
  invalidResponse,
  nonNegativeInteger,
  optionalNonNegativeInteger,
  optionalNonNegativeNumber,
  optionalResponseRecord,
  responseBoolean,
  responseIdentity,
  responseOptionalText,
  responseRecord,
  responseStringArray,
  responseTimestamp,
  safeScalarEntries,
} from "./resourcesValidation";

export function toResourceFacts(
  resourceType: string,
  rawSummary: Record<string, unknown>,
): ResourceFacts {
  const summary = responseRecord(rawSummary);
  switch (resourceType) {
    case "pod":
      return podFacts(summary);
    case "node":
      return nodeFacts(summary);
    case "workload":
      return workloadFacts(summary);
    case "service":
      return serviceFacts(summary);
    case "event":
      return eventFacts(summary);
    default:
      return { type: "generic" };
  }
}

function podFacts(summary: Record<string, unknown>): ResourceFacts {
  return {
    type: "pod",
    phase: responseOptionalText(summary.phase),
    nodeName: responseOptionalText(summary.node_name),
    owner: ownerFact(summary.owner_kind, summary.owner_name),
    readiness: podReadiness(summary.containers),
    restartCount: optionalNonNegativeInteger(summary.restart_total),
    cpuMillicores: optionalNonNegativeNumber(summary.cpu_mcores),
    memoryMebibytes: optionalNonNegativeNumber(summary.mem_mib),
    podIp: responseOptionalText(summary.pod_ip),
    hostIp: responseOptionalText(summary.host_ip),
    waitingReasons: responseStringArray(summary.waiting_reasons),
    terminatedReasons: responseStringArray(summary.terminated_reasons),
  };
}

function nodeFacts(summary: Record<string, unknown>): ResourceFacts {
  return {
    type: "node",
    ready: responseBoolean(summary.ready),
    podCapacity: nodePodCapacity(summary),
    cpuMillicores: optionalNonNegativeNumber(summary.cpu_mcores),
    memoryMebibytes: optionalNonNegativeNumber(summary.mem_mib),
    cpuRatio: optionalNonNegativeNumber(summary.cpu_ratio),
    memoryRatio: optionalNonNegativeNumber(summary.mem_ratio),
  };
}

function workloadFacts(summary: Record<string, unknown>): ResourceFacts {
  return {
    type: "workload",
    desiredReplicas: optionalNonNegativeInteger(summary.desired_replicas),
    readyReplicas: optionalNonNegativeInteger(summary.ready_replicas),
    availableReplicas: optionalNonNegativeInteger(summary.available_replicas),
    updatedReplicas: optionalNonNegativeInteger(summary.updated_replicas),
    unavailableReplicas: optionalNonNegativeInteger(summary.unavailable_replicas),
    generation: optionalNonNegativeInteger(summary.generation),
    observedGeneration: optionalNonNegativeInteger(summary.observed_generation),
  };
}

function serviceFacts(summary: Record<string, unknown>): ResourceFacts {
  return {
    type: "service",
    serviceType: responseOptionalText(summary.type),
    clusterIp: responseOptionalText(summary.cluster_ip),
    externalUrl: responseOptionalText(summary.external_url),
    externalHosts: responseStringArray(summary.external_hosts),
    selector: summary.selector === null || summary.selector === undefined
      ? []
      : safeScalarEntries(summary.selector),
    ports: resourcePorts(summary.ports),
  };
}

function eventFacts(summary: Record<string, unknown>): ResourceFacts {
  return {
    type: "event",
    eventType: responseOptionalText(summary.type),
    reason: responseOptionalText(summary.reason),
    message: responseOptionalText(summary.message),
    occurrenceCount: optionalNonNegativeInteger(summary.count),
    firstSeenAt: responseTimestamp(summary.first_timestamp),
    lastSeenAt: responseTimestamp(summary.last_timestamp),
    reportingComponent: responseOptionalText(summary.reporting_component),
    involvedResource: involvedFact(
      summary.involved_kind,
      summary.involved_name,
      summary.involved_uid,
    ),
  };
}

function ownerFact(kindValue: unknown, nameValue: unknown): ResourceOwnerFact | null {
  const kind = responseOptionalText(kindValue);
  const name = responseOptionalText(nameValue);
  return kind === null || name === null ? null : { kind, name };
}

function involvedFact(
  kindValue: unknown,
  nameValue: unknown,
  uidValue: unknown,
): ResourceInvolvedFact | null {
  const kind = responseOptionalText(kindValue);
  const name = responseOptionalText(nameValue);
  const uid = responseOptionalText(uidValue);
  return kind === null || name === null ? null : { kind, name, uid };
}

function podReadiness(value: unknown): ResourceReadinessFact | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) invalidResponse();
  let ready = 0;
  for (const rawContainer of value) {
    const container = responseRecord(rawContainer);
    if (responseBoolean(container.ready) === true) ready += 1;
  }
  return { ready, total: value.length };
}

function nodePodCapacity(summary: Record<string, unknown>): number | null {
  for (const key of ["allocatable", "capacity"] as const) {
    const capacity = optionalResponseRecord(summary[key]);
    if (capacity === null || capacity.pods === null || capacity.pods === undefined) continue;
    if (typeof capacity.pods === "number") return nonNegativeInteger(capacity.pods);
    if (typeof capacity.pods === "string" && /^\d+$/.test(capacity.pods)) {
      return nonNegativeInteger(Number(capacity.pods));
    }
    invalidResponse();
  }
  return optionalNonNegativeInteger(summary.pod_capacity);
}

function resourcePorts(value: unknown): ResourcePortFact[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) invalidResponse();
  return value.map((rawPort) => {
    const port = responseRecord(rawPort);
    return {
      name: responseOptionalText(port.name),
      protocol: responseOptionalText(port.protocol),
      port: optionalNonNegativeInteger(port.port),
      targetPort: targetPort(port.targetPort ?? port.target_port),
      nodePort: optionalNonNegativeInteger(port.nodePort ?? port.node_port),
    };
  });
}

function targetPort(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return responseIdentity(value);
  return String(nonNegativeInteger(value));
}

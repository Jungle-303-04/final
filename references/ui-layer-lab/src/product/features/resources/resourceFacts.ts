import type {
  ResourceFacts,
} from "./resourcesContract";
import {
  involvedFact,
  nodePodCapacity,
  ownerFact,
  podReadiness,
  resourcePorts,
  serviceSelector,
} from "./resourceFactDetails";
import {
  ignoreResourceFactWarning,
  optionalFact,
  type ResourceFactWarningSink,
} from "./resourceFactSafety";
import {
  optionalNonNegativeInteger,
  optionalNonNegativeNumber,
  responseBoolean,
  responseOptionalText,
  responseRecord,
  responseStringArray,
  responseTimestamp,
} from "./resourcesValidation";

export function toResourceFacts(
  resourceType: string,
  rawSummary: Record<string, unknown>,
  warn: ResourceFactWarningSink = ignoreResourceFactWarning,
): ResourceFacts {
  const summary = responseRecord(rawSummary);
  switch (resourceType) {
    case "pod":
      return podFacts(summary, warn);
    case "node":
      return nodeFacts(summary, warn);
    case "workload":
      return workloadFacts(summary, warn);
    case "service":
      return serviceFacts(summary, warn);
    case "event":
      return eventFacts(summary, warn);
    default:
      return { type: "generic" };
  }
}

function podFacts(
  summary: Record<string, unknown>,
  warn: ResourceFactWarningSink,
): ResourceFacts {
  return {
    type: "pod",
    phase: optionalFact("phase", null, () => responseOptionalText(summary.phase), warn),
    nodeName: optionalFact(
      "nodeName",
      null,
      () => responseOptionalText(summary.node_name),
      warn,
    ),
    owner: optionalFact(
      "owner",
      null,
      () => ownerFact(summary.owner_kind, summary.owner_name),
      warn,
    ),
    readiness: optionalFact("readiness", null, () => podReadiness(summary.containers), warn),
    restartCount: optionalFact(
      "restartCount",
      null,
      () => optionalNonNegativeInteger(summary.restart_total),
      warn,
    ),
    cpuMillicores: optionalFact(
      "cpuMillicores",
      null,
      () => optionalNonNegativeNumber(summary.cpu_mcores),
      warn,
    ),
    memoryMebibytes: optionalFact(
      "memoryMebibytes",
      null,
      () => optionalNonNegativeNumber(summary.mem_mib),
      warn,
    ),
    podIp: optionalFact("podIp", null, () => responseOptionalText(summary.pod_ip), warn),
    hostIp: optionalFact("hostIp", null, () => responseOptionalText(summary.host_ip), warn),
    waitingReasons: optionalFact(
      "waitingReasons",
      [],
      () => responseStringArray(summary.waiting_reasons),
      warn,
    ),
    terminatedReasons: optionalFact(
      "terminatedReasons",
      [],
      () => responseStringArray(summary.terminated_reasons),
      warn,
    ),
  };
}

function nodeFacts(
  summary: Record<string, unknown>,
  warn: ResourceFactWarningSink,
): ResourceFacts {
  return {
    type: "node",
    ready: optionalFact("ready", null, () => responseBoolean(summary.ready), warn),
    podCapacity: optionalFact("podCapacity", null, () => nodePodCapacity(summary), warn),
    cpuMillicores: optionalFact(
      "cpuMillicores",
      null,
      () => optionalNonNegativeNumber(summary.cpu_mcores),
      warn,
    ),
    memoryMebibytes: optionalFact(
      "memoryMebibytes",
      null,
      () => optionalNonNegativeNumber(summary.mem_mib),
      warn,
    ),
    cpuRatio: optionalFact(
      "cpuRatio",
      null,
      () => optionalNonNegativeNumber(summary.cpu_ratio),
      warn,
    ),
    memoryRatio: optionalFact(
      "memoryRatio",
      null,
      () => optionalNonNegativeNumber(summary.mem_ratio),
      warn,
    ),
  };
}

function workloadFacts(
  summary: Record<string, unknown>,
  warn: ResourceFactWarningSink,
): ResourceFacts {
  return {
    type: "workload",
    desiredReplicas: integerFact("desiredReplicas", summary.desired_replicas, warn),
    readyReplicas: integerFact("readyReplicas", summary.ready_replicas, warn),
    availableReplicas: integerFact("availableReplicas", summary.available_replicas, warn),
    updatedReplicas: integerFact("updatedReplicas", summary.updated_replicas, warn),
    unavailableReplicas: integerFact(
      "unavailableReplicas",
      summary.unavailable_replicas,
      warn,
    ),
    generation: integerFact("generation", summary.generation, warn),
    observedGeneration: integerFact(
      "observedGeneration",
      summary.observed_generation,
      warn,
    ),
  };
}

function serviceFacts(
  summary: Record<string, unknown>,
  warn: ResourceFactWarningSink,
): ResourceFacts {
  return {
    type: "service",
    serviceType: optionalFact(
      "serviceType",
      null,
      () => responseOptionalText(summary.type),
      warn,
    ),
    clusterIp: optionalFact(
      "clusterIp",
      null,
      () => responseOptionalText(summary.cluster_ip),
      warn,
    ),
    externalUrl: optionalFact(
      "externalUrl",
      null,
      () => responseOptionalText(summary.external_url),
      warn,
    ),
    externalHosts: optionalFact(
      "externalHosts",
      [],
      () => responseStringArray(summary.external_hosts),
      warn,
    ),
    selector: optionalFact("selector", [], () => serviceSelector(summary.selector), warn),
    ports: optionalFact("ports", [], () => resourcePorts(summary.ports), warn),
  };
}

function eventFacts(
  summary: Record<string, unknown>,
  warn: ResourceFactWarningSink,
): ResourceFacts {
  return {
    type: "event",
    eventType: textFact("eventType", summary.type, warn),
    reason: textFact("reason", summary.reason, warn),
    message: textFact("message", summary.message, warn),
    occurrenceCount: integerFact("occurrenceCount", summary.count, warn),
    firstSeenAt: optionalFact(
      "firstSeenAt",
      null,
      () => responseTimestamp(summary.first_timestamp),
      warn,
    ),
    lastSeenAt: optionalFact(
      "lastSeenAt",
      null,
      () => responseTimestamp(summary.last_timestamp),
      warn,
    ),
    reportingComponent: textFact(
      "reportingComponent",
      summary.reporting_component,
      warn,
    ),
    involvedResource: optionalFact(
      "involvedResource",
      null,
      () => involvedFact(
        summary.involved_kind,
        summary.involved_name,
        summary.involved_uid,
      ),
      warn,
    ),
  };
}

function integerFact(
  field: string,
  value: unknown,
  warn: ResourceFactWarningSink,
): number | null {
  return optionalFact(field, null, () => optionalNonNegativeInteger(value), warn);
}

function textFact(
  field: string,
  value: unknown,
  warn: ResourceFactWarningSink,
): string | null {
  return optionalFact(field, null, () => responseOptionalText(value), warn);
}

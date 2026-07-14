import type {
  ResourceInvolvedFact,
  ResourceMetadataEntry,
  ResourceOwnerFact,
  ResourcePortFact,
  ResourceReadinessFact,
} from "./resourcesContract";
import {
  invalidResponse,
  nonNegativeInteger,
  optionalNonNegativeInteger,
  optionalResponseRecord,
  responseBoolean,
  responseIdentity,
  responseOptionalText,
  responseRecord,
  safeScalarEntries,
} from "./resourcesValidation";

export function ownerFact(
  kindValue: unknown,
  nameValue: unknown,
): ResourceOwnerFact | null {
  const kind = responseOptionalText(kindValue);
  const name = responseOptionalText(nameValue);
  return kind === null || name === null ? null : { kind, name };
}

export function involvedFact(
  kindValue: unknown,
  nameValue: unknown,
  uidValue: unknown,
): ResourceInvolvedFact | null {
  const kind = responseOptionalText(kindValue);
  const name = responseOptionalText(nameValue);
  const uid = responseOptionalText(uidValue);
  return kind === null || name === null ? null : { kind, name, uid };
}

export function podReadiness(value: unknown): ResourceReadinessFact | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) invalidResponse();
  let ready = 0;
  for (const rawContainer of value) {
    const container = responseRecord(rawContainer);
    if (responseBoolean(container.ready) === true) ready += 1;
  }
  return { ready, total: value.length };
}

export function nodePodCapacity(summary: Record<string, unknown>): number | null {
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

export function serviceSelector(value: unknown): ResourceMetadataEntry[] {
  return value === null || value === undefined ? [] : safeScalarEntries(value);
}

export function resourcePorts(value: unknown): ResourcePortFact[] {
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

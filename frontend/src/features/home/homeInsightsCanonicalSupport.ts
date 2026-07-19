import type { HomeCertificateResourceRef, HomeInsightCoverage } from "./homeContract";
import type {
  HomeEndpointInsightCoverage,
  HomeEndpointResourceRef,
} from "./homeEndpointContract";
import {
  assertUnique,
  canonicalIdentity,
  canonicalOptionalIdentity,
  canonicalTimestamp,
  invalidResponse,
  nonNegativeInteger,
} from "./homeValidation";

export function nullableNonNegativeInteger(
  value: number | null | undefined,
): number | null {
  return value === null || value === undefined ? null : nonNegativeInteger(value);
}

export function positiveCountMap(
  wire: Readonly<Record<string, number>>,
  limit: number,
): Record<string, number> {
  if (Object.keys(wire).length > limit) invalidResponse();
  return Object.fromEntries(Object.entries(wire).map(([key, count]) => {
    const normalized = canonicalIdentity(key);
    const normalizedCount = nonNegativeInteger(count);
    if (normalizedCount === 0) invalidResponse();
    return [normalized, normalizedCount];
  }));
}

export function toInsightCoverage(
  wire: HomeEndpointInsightCoverage,
): HomeInsightCoverage {
  if (wire.availability !== "available" && wire.reason_codes.length === 0) invalidResponse();
  const reasonCodes = wire.reason_codes.map(canonicalIdentity);
  assertUnique(reasonCodes);
  return {
    availability: wire.availability,
    observedAt: canonicalTimestamp(wire.observed_at),
    reasonCodes,
  };
}

export function toInsightResourceRef(
  wire: HomeEndpointResourceRef,
): HomeCertificateResourceRef {
  if (wire.api_group !== wire.api_group.trim()) invalidResponse();
  return {
    apiGroup: wire.api_group,
    version: canonicalIdentity(wire.version),
    kind: canonicalIdentity(wire.kind),
    namespace: canonicalOptionalIdentity(wire.namespace),
    name: canonicalIdentity(wire.name),
    uid: canonicalIdentity(wire.uid),
  };
}

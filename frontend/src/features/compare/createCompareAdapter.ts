import type {
  CompareCandidateListEndpoint,
  CompareResourcePairEndpoint,
} from "../../api/compare-schemas";
import { compareTargetParam } from "./compareTarget";
import {
  ComparePortFailure,
  type ComparableManifest,
  type CompareCandidates,
  type CompareDescriptor,
  type CompareFailureCode,
  type ComparePort,
  type CompareProvenance,
  type CompareResourceRef,
  type CompareResult,
} from "./compareContract";
import type { CompareEndpointDependencies } from "./compareEndpointContract";

export function createCompareAdapter(endpoints: CompareEndpointDependencies): ComparePort {
  return {
    async getComparison(request, signal) {
      try {
        return toResult(request, await endpoints.getCompareResourcePair({
          clusterId: request.clusterId,
          kind: request.kind,
          apiGroup: request.apiGroup,
          apiVersion: request.apiVersion,
          a: compareTargetParam(request.a),
          b: compareTargetParam(request.b),
        }, signal));
      } catch (error) {
        if (isAbortError(error) || error instanceof ComparePortFailure) throw error;
        throw toFailure(error);
      }
    },
    async getCandidates(request, signal) {
      try {
        return toCandidates(request, await endpoints.getCompareCandidates(request, signal));
      } catch (error) {
        if (isAbortError(error) || error instanceof ComparePortFailure) throw error;
        throw toFailure(error);
      }
    },
  };
}

function toResult(
  request: Parameters<ComparePort["getComparison"]>[0],
  wire: CompareResourcePairEndpoint,
): CompareResult {
  const comparison = wire.comparison;
  assertDescriptor(request, comparison.descriptor);
  assertSide(request, comparison.a, comparison.descriptor, request.a);
  assertSide(request, comparison.b, comparison.descriptor, request.b);
  if (comparison.scope.cluster_id !== request.clusterId) throw new ComparePortFailure("invalid-response");
  return {
    scope: toScope(comparison.scope),
    descriptor: toDescriptor(comparison.descriptor),
    coverage: {
      availability: comparison.coverage.availability,
      latestSnapshotId: comparison.coverage.latest_snapshot_id,
      reasonCodes: comparison.coverage.reason_codes,
    },
    presentation: {
      modes: comparison.presentation.modes,
      swap: comparison.presentation.swap,
      diffOnly: comparison.presentation.diff_only,
    },
    a: toManifest(comparison.a),
    b: toManifest(comparison.b),
  };
}

function toCandidates(
  request: Parameters<ComparePort["getCandidates"]>[0],
  wire: CompareCandidateListEndpoint,
): CompareCandidates {
  const result = wire.result;
  assertDescriptor(request, result.descriptor);
  if (result.scope.cluster_id !== request.clusterId) throw new ComparePortFailure("invalid-response");
  return {
    scope: toScope(result.scope),
    descriptor: toDescriptor(result.descriptor),
    coverage: {
      availability: result.coverage.availability,
      latestSnapshotId: result.coverage.latest_snapshot_id,
      reasonCodes: result.coverage.reason_codes,
    },
    candidates: result.candidates.map((candidate) => {
      assertResourceDescriptor(candidate.resource, result.descriptor);
      return { resource: toResourceRef(candidate.resource), provenance: toProvenance(candidate.provenance) };
    }),
    excludedCount: result.excluded_count,
  };
}

function assertDescriptor(
  request: { kind: string; apiGroup: string; apiVersion: string | null },
  descriptor: CompareResourcePairEndpoint["comparison"]["descriptor"],
): void {
  if (
    descriptor.route_kind.toLocaleLowerCase() !== request.kind.toLocaleLowerCase()
    || descriptor.api_group !== request.apiGroup
    || (request.apiVersion !== null && descriptor.api_version !== request.apiVersion)
  ) {
    throw new ComparePortFailure("invalid-response");
  }
}

function assertSide(
  request: Parameters<ComparePort["getComparison"]>[0],
  manifest: CompareResourcePairEndpoint["comparison"]["a"],
  descriptor: CompareResourcePairEndpoint["comparison"]["descriptor"],
  target: { namespace: string | null; name: string },
): void {
  assertDescriptor(request, descriptor);
  assertResourceDescriptor(manifest.resource, descriptor);
  if (manifest.resource.namespace !== target.namespace || manifest.resource.name !== target.name
    || manifest.metadata.namespace !== target.namespace || manifest.metadata.name !== target.name) {
    throw new ComparePortFailure("invalid-response");
  }
}

function assertResourceDescriptor(
  resource: CompareResourcePairEndpoint["comparison"]["a"]["resource"],
  descriptor: CompareResourcePairEndpoint["comparison"]["descriptor"],
): void {
  if (
    resource.api_group !== descriptor.api_group
    || resource.version !== descriptor.api_version
    || resource.kind !== descriptor.kubernetes_kind
  ) throw new ComparePortFailure("invalid-response");
}

function toScope(scope: CompareResourcePairEndpoint["comparison"]["scope"]): CompareResult["scope"] {
  return {
    workspaceId: scope.workspace_id,
    clusterId: scope.cluster_id,
    namespaces: scope.namespaces,
    freshness: scope.freshness,
  };
}

function toDescriptor(value: CompareResourcePairEndpoint["comparison"]["descriptor"]): CompareDescriptor {
  return {
    routeKind: value.route_kind,
    apiGroup: value.api_group,
    apiVersion: value.api_version,
    kubernetesKind: value.kubernetes_kind,
    resourceType: value.resource_type,
    projectionKind: value.projection_kind,
  };
}

function toManifest(value: CompareResourcePairEndpoint["comparison"]["a"]): ComparableManifest {
  const projection = value.projection.projection_kind === "workload_replicas"
    ? { projectionKind: value.projection.projection_kind, replicas: value.projection.replicas } as const
    : {
      projectionKind: value.projection.projection_kind,
      serviceType: value.projection.service_type,
      ports: value.projection.ports.map((port) => ({
        name: port.name,
        port: port.port,
        protocol: port.protocol,
        targetPortName: port.target_port_name,
        targetPortNumber: port.target_port_number,
        nodePort: port.node_port,
      })),
      excludedPortCount: value.projection.excluded_port_count,
    } as const;
  return {
    resource: toResourceRef(value.resource),
    metadata: value.metadata,
    projection,
    provenance: toProvenance(value.provenance),
    omittedPaths: value.omitted_paths,
  };
}

function toResourceRef(value: CompareResourcePairEndpoint["comparison"]["a"]["resource"]): CompareResourceRef {
  return {
    apiGroup: value.api_group,
    version: value.version,
    kind: value.kind,
    namespace: value.namespace,
    name: value.name,
    uid: value.uid,
  };
}

function toProvenance(value: CompareResourcePairEndpoint["comparison"]["a"]["provenance"]): CompareProvenance {
  return {
    observationSnapshotId: value.observation_snapshot_id,
    latestSnapshotId: value.latest_snapshot_id,
    observedAt: value.observed_at,
    availability: value.availability,
    reasonCodes: value.reason_codes,
  };
}

function toFailure(error: unknown): ComparePortFailure {
  const status = numberField(error, "status");
  const kind = stringField(error, "kind");
  const byKind: Record<string, CompareFailureCode> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    "not-found": "not-found",
    network: "offline",
    "invalid-request": "invalid-request",
    "invalid-payload": "invalid-response",
    "rate-limited": "rate-limited",
  };
  const byStatus: Record<number, CompareFailureCode> = {
    401: "unauthorized",
    403: "forbidden",
    404: "not-found",
    409: "identity-incomplete",
    422: "unsupported",
    429: "rate-limited",
    503: "unavailable",
  };
  return new ComparePortFailure(byKind[kind ?? ""] ?? byStatus[status ?? -1] ?? "error");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

function stringField(value: unknown, key: string): string | null {
  return typeof value === "object" && value !== null && key in value && typeof (value as Record<string, unknown>)[key] === "string"
    ? (value as Record<string, string>)[key]
    : null;
}

function numberField(value: unknown, key: string): number | null {
  return typeof value === "object" && value !== null && key in value && typeof (value as Record<string, unknown>)[key] === "number"
    ? (value as Record<string, number>)[key]
    : null;
}

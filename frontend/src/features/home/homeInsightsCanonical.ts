import type { HomeInsights } from "./homeContract";
import type { HomeEndpointInsights } from "./homeEndpointContract";
import {
  nullableNonNegativeInteger,
  positiveCountMap,
  toInsightCoverage,
  toInsightResourceRef,
} from "./homeInsightsCanonicalSupport";
import {
  assertSameIdentity,
  assertUnique,
  canonicalIdentity,
  canonicalTimestamp,
  invalidResponse,
  nonNegativeInteger,
} from "./homeValidation";

export function toHomeInsights(
  requestedClusterId: string,
  wire: HomeEndpointInsights,
): HomeInsights {
  const clusterId = canonicalIdentity(requestedClusterId);
  assertSameIdentity(wire.cluster_id, clusterId);
  const topologyCoverage = toInsightCoverage(wire.topology.coverage);
  const topologyCounts = {
    nodeCount: nullableNonNegativeInteger(wire.topology.node_count),
    edgeCount: nullableNonNegativeInteger(wire.topology.edge_count),
    omittedNodeCount: nullableNonNegativeInteger(wire.topology.omitted_node_count),
    omittedEdgeCount: nullableNonNegativeInteger(wire.topology.omitted_edge_count),
  };
  const topologyUnavailable = topologyCoverage.availability === "unavailable";
  if (
    topologyUnavailable !== Object.values(topologyCounts).every((value) => value === null) ||
    topologyUnavailable !== (wire.topology.relation_completeness === "unavailable") ||
    (topologyCoverage.availability === "available" &&
      wire.topology.relation_completeness !== "exact") ||
    (topologyCoverage.availability === "partial" &&
      wire.topology.relation_completeness !== "partial")
  ) {
    invalidResponse();
  }
  const trafficCoverage = toInsightCoverage(wire.explore.traffic.coverage);
  const costCoverage = toInsightCoverage(wire.explore.cost.coverage);
  const networkPolicyCoverage = toInsightCoverage(wire.posture.network_policy.coverage);
  const totalPolicies = nullableNonNegativeInteger(wire.posture.network_policy.total_policies);
  const coveredWorkloads = nullableNonNegativeInteger(
    wire.posture.network_policy.covered_workloads,
  );
  const totalWorkloads = nullableNonNegativeInteger(wire.posture.network_policy.total_workloads);
  const networkUnavailable = networkPolicyCoverage.availability === "unavailable";
  if (
    networkUnavailable !== [totalPolicies, coveredWorkloads, totalWorkloads].every(
      (value) => value === null,
    ) ||
    (coveredWorkloads !== null && totalWorkloads !== null && coveredWorkloads > totalWorkloads)
  ) {
    invalidResponse();
  }
  const gitopsCoverage = toInsightCoverage(wire.posture.gitops.coverage);
  const controllerCount = nullableNonNegativeInteger(wire.posture.gitops.controller_count);
  const providerCounts = positiveCountMap(wire.posture.gitops.provider_counts, 20);
  const healthCounts = positiveCountMap(wire.posture.gitops.health_counts, 40);
  const gitopsUnavailable = gitopsCoverage.availability === "unavailable";
  if (
    gitopsUnavailable !== (controllerCount === null) ||
    (gitopsUnavailable && (Object.keys(providerCounts).length > 0 || Object.keys(healthCounts).length > 0)) ||
    (controllerCount !== null && (
      Object.values(providerCounts).reduce((sum, count) => sum + count, 0) > controllerCount ||
      Object.values(healthCounts).reduce((sum, count) => sum + count, 0) > controllerCount
    ))
  ) {
    invalidResponse();
  }
  const auditCoverage = toInsightCoverage(wire.posture.audit.coverage);
  const totalCheckCount = nullableNonNegativeInteger(wire.posture.audit.total_check_count);
  const totalFindingCount = nullableNonNegativeInteger(wire.posture.audit.total_finding_count);
  const severityCounts = positiveCountMap(wire.posture.audit.severity_counts, 2);
  if (Object.keys(severityCounts).some((severity) => !["warning", "danger"].includes(severity))) {
    invalidResponse();
  }
  const auditUnavailable = auditCoverage.availability === "unavailable";
  if (
    auditUnavailable !== (totalCheckCount === null) ||
    auditUnavailable !== (totalFindingCount === null) ||
    (auditUnavailable && Object.keys(severityCounts).length > 0) ||
    (totalFindingCount !== null &&
      Object.values(severityCounts).reduce((sum, count) => sum + count, 0) !== totalFindingCount)
  ) {
    invalidResponse();
  }
  const customCoverage = toInsightCoverage(wire.custom_resources.coverage);
  const customItems = wire.custom_resources.items.map((item) => {
    const count = nonNegativeInteger(item.count);
    if (count === 0) invalidResponse();
    return {
      apiGroup: canonicalIdentity(item.api_group),
      version: canonicalIdentity(item.version),
      kind: canonicalIdentity(item.kind),
      count,
    };
  });
  assertUnique(customItems.map((item) =>
    `${item.apiGroup}/${item.version}/${item.kind}`
  ));
  const totalKinds = nullableNonNegativeInteger(wire.custom_resources.total_kinds);
  const totalResources = nullableNonNegativeInteger(wire.custom_resources.total_resources);
  const customUnavailable = customCoverage.availability === "unavailable";
  if (
    customUnavailable !== (totalKinds === null) ||
    customUnavailable !== (totalResources === null) ||
    (customUnavailable && (customItems.length > 0 || wire.custom_resources.has_more)) ||
    (totalKinds !== null && totalKinds < customItems.length) ||
    (totalResources !== null &&
      totalResources < customItems.reduce((total, item) => total + item.count, 0)) ||
    wire.custom_resources.has_more !== (
      totalKinds !== null && totalKinds > customItems.length
    )
  ) {
    invalidResponse();
  }
  const helmCoverage = toInsightCoverage(wire.helm.coverage);
  const releaseCount = nullableNonNegativeInteger(wire.helm.release_count);
  if (Object.keys(wire.helm.status_counts).length > 20) invalidResponse();
  const statusCounts = Object.fromEntries(
    Object.entries(wire.helm.status_counts).map(([status, count]) => {
      const normalized = canonicalIdentity(status);
      if (normalized.length > 120) invalidResponse();
      const normalizedCount = nonNegativeInteger(count);
      if (normalizedCount === 0) invalidResponse();
      return [normalized, normalizedCount];
    }),
  );
  const helmUnavailable = helmCoverage.availability === "unavailable";
  if (
    helmUnavailable !== (releaseCount === null) ||
    (helmUnavailable && Object.keys(statusCounts).length > 0) ||
    (releaseCount !== null &&
      Object.values(statusCounts).reduce((total, count) => total + count, 0) > releaseCount)
  ) {
    invalidResponse();
  }
  const certificateCoverage = toInsightCoverage(wire.certificate_expiry.coverage);
  const certificateItems = wire.certificate_expiry.items.map((item) => {
    const secret = toInsightResourceRef(item.secret);
    const sourceCertificate = toInsightResourceRef(item.source_certificate);
    if (secret.kind !== "Secret" || sourceCertificate.kind !== "Certificate") invalidResponse();
    if (!["valid", "expiring", "expired"].includes(item.status)) invalidResponse();
    const notAfter = canonicalTimestamp(item.not_after);
    if (notAfter === null || !Number.isSafeInteger(item.seconds_remaining)) invalidResponse();
    return {
      secret,
      sourceCertificate,
      notAfter,
      status: item.status,
      secondsRemaining: item.seconds_remaining,
      observedAt: canonicalTimestamp(item.observed_at),
    };
  });
  assertUnique(certificateItems.map((item) => item.secret.uid));
  const tlsSecretCount = nullableNonNegativeInteger(
    wire.certificate_expiry.tls_secret_count,
  );
  const observedExpiryCount = nullableNonNegativeInteger(
    wire.certificate_expiry.observed_expiry_count,
  );
  const expiringCount = nullableNonNegativeInteger(
    wire.certificate_expiry.expiring_count,
  );
  const expiredCount = nullableNonNegativeInteger(
    wire.certificate_expiry.expired_count,
  );
  const earliestExpiry = canonicalTimestamp(wire.certificate_expiry.earliest_expiry);
  const certificateUnavailable = certificateCoverage.availability === "unavailable";
  const certificateCounts = [
    tlsSecretCount,
    observedExpiryCount,
    expiringCount,
    expiredCount,
  ];
  if (
    (certificateUnavailable && (
      certificateCounts.some((count) => count !== null) ||
      certificateItems.length > 0 ||
      earliestExpiry !== null ||
      wire.certificate_expiry.has_more
    )) ||
    (!certificateUnavailable && certificateCounts.some((count) => count === null)) ||
    (tlsSecretCount !== null && observedExpiryCount !== null &&
      observedExpiryCount > tlsSecretCount) ||
    (observedExpiryCount !== null && expiringCount !== null && expiredCount !== null &&
      expiringCount + expiredCount > observedExpiryCount) ||
    (!certificateUnavailable && (observedExpiryCount === 0 || earliestExpiry === null)) ||
    wire.certificate_expiry.has_more !== (
      observedExpiryCount !== null && observedExpiryCount > certificateItems.length
    )
  ) {
    invalidResponse();
  }
  const warningBeforeSeconds = nonNegativeInteger(
    wire.certificate_expiry.warning_before_seconds,
  );
  if (warningBeforeSeconds < 1 || warningBeforeSeconds > 315_360_000) invalidResponse();
  const refreshAfterSeconds = nonNegativeInteger(wire.refresh_after_seconds);
  if (refreshAfterSeconds < 1 || refreshAfterSeconds > 3600) invalidResponse();
  return {
    clusterId,
    topology: {
      coverage: topologyCoverage,
      ...topologyCounts,
      relationCompleteness: wire.topology.relation_completeness,
    },
    explore: {
      traffic: { coverage: trafficCoverage },
      cost: { coverage: costCoverage },
    },
    posture: {
      networkPolicy: {
        coverage: networkPolicyCoverage,
        totalPolicies,
        coveredWorkloads,
        totalWorkloads,
      },
      gitops: {
        coverage: gitopsCoverage,
        controllerCount,
        providerCounts,
        healthCounts,
      },
      audit: {
        coverage: auditCoverage,
        totalCheckCount,
        totalFindingCount,
        severityCounts,
      },
    },
    customResources: {
      coverage: customCoverage,
      items: customItems,
      totalKinds,
      totalResources,
      hasMore: wire.custom_resources.has_more,
    },
    helm: {
      coverage: helmCoverage,
      releaseCount,
      statusCounts,
    },
    certificateExpiry: {
      coverage: certificateCoverage,
      items: certificateItems,
      tlsSecretCount,
      observedExpiryCount,
      expiringCount,
      expiredCount,
      earliestExpiry,
      warningBeforeSeconds,
      hasMore: wire.certificate_expiry.has_more,
    },
    refreshAfterSeconds,
  };
}

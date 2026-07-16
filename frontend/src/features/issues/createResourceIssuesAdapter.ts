import { toResourcesPortFailure } from "../resources/createResourcesAdapter";
import { ResourcesPortFailure } from "../resources/resourcesContract";
import type {
  ResourceIssue,
  ResourceIssueList,
  ResourceIssuesPort,
} from "./resourceIssuesContract";
import type {
  ResourceIssueEndpointResponse,
  ResourceIssuesEndpointDependencies,
} from "./resourceIssuesEndpointContract";

const RESOURCE_ISSUE_LIMIT = 25;

export function createResourceIssuesAdapter(
  dependencies: ResourceIssuesEndpointDependencies,
): ResourceIssuesPort {
  return {
    async loadResourceIssues(clusterId, identity, signal) {
      try {
        if (![clusterId, identity.kind, identity.name].every((value) => value.trim())) {
          throw new TypeError("resource issue identity is incomplete");
        }
        return toResourceIssueList(await dependencies.getResourceIssues({
          clusterId,
          kind: identity.kind,
          namespace: identity.namespace,
          name: identity.name,
          limit: RESOURCE_ISSUE_LIMIT,
        }, signal));
      } catch (error) {
        if (error instanceof ResourcesPortFailure) throw error;
        if (error instanceof TypeError || error instanceof RangeError) {
          throw new ResourcesPortFailure("invalid-request");
        }
        throw toResourcesPortFailure(error);
      }
    },
  };
}

function toResourceIssueList(endpoint: ResourceIssueEndpointResponse): ResourceIssueList {
  return {
    scope: {
      workspaceId: endpoint.scope.workspace_id,
      clusterId: endpoint.scope.cluster_id,
      namespaces: endpoint.scope.namespaces,
      freshness: endpoint.scope.freshness,
    },
    coverageAvailability: endpoint.coverage_availability,
    observedAt: endpoint.observed_at,
    reasonCodes: endpoint.reason_codes,
    items: endpoint.items.map(toResourceIssue),
    hasMore: endpoint.has_more,
    limit: endpoint.limit,
  };
}

function toResourceIssue(item: ResourceIssueEndpointResponse["items"][number]): ResourceIssue {
  return {
    id: `${item.workspace_id}:${item.correlation_id}`,
    workspaceId: item.workspace_id,
    incidentId: item.incident_id,
    correlationId: item.correlation_id,
    clusterId: item.cluster_id,
    namespace: item.incident_namespace,
    resourceKind: item.incident_resource_kind,
    resourceName: item.incident_resource_name,
    symptom: item.incident_symptom,
    currentSubject: item.current_subject,
    status: item.status,
    severity: item.issue_severity,
    severityAvailability: item.severity_availability,
    rootCause: item.root_cause,
    confidence: item.confidence,
    supportingEvidence: item.supporting_evidence,
    missingEvidence: item.missing_evidence,
    evidenceRef: item.evidence_ref,
    actionRoute: item.action_route,
    commandId: item.command_id,
    pullRequestUrl: item.pr_url,
    errorReason: item.error_reason,
    updatedAt: item.updated_at,
    onset: {
      firstObservedAt: item.onset.first_observed_at,
      source: item.onset.source,
      timingKind: item.onset.timing_kind,
      timingAvailability: item.onset.timing_availability,
      timingReasonCode: item.onset.timing_reason_code,
    },
  };
}

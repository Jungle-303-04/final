import type {
  DiagnoseCapabilities,
  DiagnoseEvent,
  DiagnoseLaunchResult,
  DiagnosePort,
  DiagnoseResourceTarget,
  DiagnoseRun,
  DiagnoseRunList,
} from "./diagnoseContract";
import type {
  DiagnoseCapabilitiesEndpoint,
  DiagnoseEndpointDependencies,
  DiagnoseRunEndpoint,
} from "./diagnoseEndpointContract";

export function createDiagnoseAdapter(
  endpoints: DiagnoseEndpointDependencies,
): DiagnosePort {
  return {
    async getCapabilities(signal) {
      return capability(await endpoints.getDiagnoseCapabilities(signal));
    },
    async grantBrowserConsent(workspaceId, clusterId, capabilities, signal) {
      await endpoints.grantDiagnoseConsent({
        scope: {
          workspace_id: workspaceId,
          cluster_id: clusterId,
          namespaces: [],
          freshness: "partial",
        },
        agent_id: capabilities.agent.id,
        disclosure_revision: capabilities.disclosureRevision,
        surface: "browser",
      }, signal);
    },
    async startResourceRun(target, capabilities, signal) {
      const wire = await endpoints.createDiagnoseRun({
        cluster_id: target.clusterId,
        resource_type: target.resourceType,
        api_group: target.apiGroup,
        api_version: target.apiVersion,
        kind: target.kind,
        namespace: target.namespace,
        name: target.name,
        uid: target.uid,
        agent: {
          agent_id: capabilities.agent.id,
          isolated: capabilities.agent.isolated,
          model: capabilities.agent.model,
          effort: capabilities.agent.effort,
        },
        disclosure_revision: capabilities.disclosureRevision,
      }, signal);
      return {
        run: run(wire.run),
        created: wire.created,
        deduplicated: wire.deduplicated,
      } satisfies DiagnoseLaunchResult;
    },
    async listRuns(limit, signal) {
      const wire = await endpoints.listDiagnoseRuns(limit, signal);
      return {
        runs: wire.runs.map(run),
        complete: wire.complete,
        historyStatus: wire.history_status,
        reasonCodes: wire.reason_codes,
      } satisfies DiagnoseRunList;
    },
    async addTurn(runId, question, signal) {
      return run(await endpoints.addDiagnoseTurn(runId, question, signal));
    },
    async stopRun(runId, signal) {
      return run(await endpoints.stopDiagnoseRun(runId, signal));
    },
    async clearFinished(signal) {
      return (await endpoints.clearDiagnoseHistory(signal)).deleted_runs;
    },
    async *subscribeEvents(runId, options) {
      for await (const raw of endpoints.subscribeDiagnoseEvents(runId, options)) {
        const wire = raw;
        yield {
          runId: wire.run_id,
          sequence: wire.sequence,
          kind: wire.kind,
          payload: wire.payload,
          occurredAt: wire.occurred_at,
        } satisfies DiagnoseEvent;
      }
    },
  };
}

function capability(
  wire: DiagnoseCapabilitiesEndpoint,
): DiagnoseCapabilities {
  return {
    enabled: wire.enabled,
    agent: {
      id: wire.agent.agent_id,
      isolated: wire.agent.isolated,
      model: wire.agent.model ?? null,
      effort: wire.agent.effort,
    },
    label: wire.label,
    disclosureRevision: wire.disclosure_revision,
    consented: wire.consented,
    reasonCodes: wire.reason_codes,
  };
}

function run(wire: DiagnoseRunEndpoint): DiagnoseRun {
  return {
    runId: wire.run_id,
    target: resourceTarget(wire),
    status: wire.status,
    statusReason: wire.status_reason ?? null,
    createdAt: wire.created_at,
    updatedAt: wire.updated_at,
  };
}

function resourceTarget(wire: DiagnoseRunEndpoint): DiagnoseResourceTarget {
  return {
    clusterId: wire.target.scope.cluster_id,
    resourceType: inferResourceType(wire.target.resource.kind),
    apiGroup: wire.target.resource.api_group,
    apiVersion: wire.target.resource.version,
    kind: wire.target.resource.kind,
    namespace: wire.target.resource.namespace,
    name: wire.target.resource.name,
    uid: wire.target.resource.uid,
  };
}

function inferResourceType(kind: string): string {
  const normalized = kind.trim().toLowerCase();
  if (normalized === "pod") return "pod";
  if (["deployment", "statefulset", "daemonset", "replicaset"].includes(normalized)) {
    return "workload";
  }
  if (normalized === "service") return "service";
  if (normalized === "node") return "node";
  if (normalized === "namespace") return "namespace";
  if (normalized === "event") return "event";
  return "custom";
}

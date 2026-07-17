import type { WorkloadDetailRequest } from "./workloadDetailContract";
import type { ScheduledRunCatalogEndpoint, WorkloadDetailEndpoint } from "./workloadDetailWireContract";

export interface WorkloadDetailEndpointDependencies {
  getWorkloadDetail(
    request: WorkloadDetailRequest,
    signal?: AbortSignal,
  ): Promise<WorkloadDetailEndpoint>;
  getScheduledWorkloadRuns(
    clusterId: string,
    kind: string,
    namespace: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<ScheduledRunCatalogEndpoint>;
}

import type { WorkloadDetailRequest } from "./workloadDetailContract";
import type { WorkloadDetailEndpoint } from "./workloadDetailWireContract";

export interface WorkloadDetailEndpointDependencies {
  getWorkloadDetail(
    request: WorkloadDetailRequest,
    signal?: AbortSignal,
  ): Promise<WorkloadDetailEndpoint>;
}

import type { WorkloadDetailEndpoint } from "../../api/workload-detail-schemas";
import type { WorkloadDetailRequest } from "./workloadDetailContract";

export interface WorkloadDetailEndpointDependencies {
  getWorkloadDetail(
    request: WorkloadDetailRequest,
    signal?: AbortSignal,
  ): Promise<WorkloadDetailEndpoint>;
}

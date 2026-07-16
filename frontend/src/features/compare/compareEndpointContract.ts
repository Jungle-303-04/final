import type {
  CompareCandidateListEndpoint,
  CompareResourcePairEndpoint,
} from "../../api/compare-schemas";
import type {
  CompareIdentityRequest,
  CompareRequest,
} from "./compareContract";

export interface CompareEndpointDependencies {
  getCompareResourcePair(
    request: {
      clusterId: string;
      kind: string;
      apiGroup: string;
      apiVersion: string | null;
      a: string;
      b: string;
    },
    signal?: AbortSignal,
  ): Promise<CompareResourcePairEndpoint>;
  getCompareCandidates(
    request: CompareIdentityRequest,
    signal?: AbortSignal,
  ): Promise<CompareCandidateListEndpoint>;
}

export type { CompareIdentityRequest, CompareRequest };

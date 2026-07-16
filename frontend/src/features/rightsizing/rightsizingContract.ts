export type RightsizingAction = "increase" | "reduction" | "review" | "in_range" | "need_data";
export type RightsizingSignal =
  | "hpa"
  | "oom"
  | "bursty"
  | "throttling"
  | "query_error"
  | "history_incomplete";

export interface RightsizingQuantity {
  unit: "millicores" | "bytes";
  value: number;
}

export interface RightsizingMetric {
  container: string;
  resource: "cpu" | "memory";
  fit: "balanced" | "oversized" | "under_requested" | "missing_request" | "insufficient_history";
  action: RightsizingAction;
  confidence: "high" | "medium" | "low" | "none";
  currentRequest: RightsizingQuantity | null;
  observedDemand: RightsizingQuantity | null;
  recommendedRequest: RightsizingQuantity | null;
  sampleCount: number;
  expectedSamples: number;
  coverageBasisPoints: number;
  signals: readonly RightsizingSignal[];
  reasonCodes: readonly string[];
}

export interface RightsizingObservedWorkload {
  availability: "available" | "partial";
  resource: {
    apiGroup: string;
    version: string;
    kind: string;
    namespace: string | null;
    name: string;
    uid: string;
  };
  observedAt: string;
  freshness: "live" | "stale" | "partial" | "disconnected";
  provenance: {
    collector: string;
    algorithmRevision: string;
    sourceRevision: string;
    windowStartedAt: string;
    windowEndedAt: string;
    sampleIntervalSeconds: number;
  };
  replicas: number;
  scaledToZero: boolean;
  classification: RightsizingAction;
  impact: {
    replicas: number;
    cpuMillicoresChange: number;
    memoryBytesChange: number;
  };
  rows: readonly RightsizingMetric[];
  reasonCodes: readonly string[];
}

export type RightsizingWorkloadEvidence =
  | RightsizingObservedWorkload
  | { availability: "unavailable"; reasonCodes: readonly string[] };

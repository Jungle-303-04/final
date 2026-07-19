export type HomeBoardPeriod = "today" | "7d" | "30d";

export interface HomeActivityBucket {
  alerts: number;
  critical: number;
  deployments: number;
  fromMs: number;
  toMs: number;
}

export interface HomeActivityOverview {
  bucketMs: number;
  buckets: readonly HomeActivityBucket[];
  fromMs: number;
  toMs: number;
}

export interface HomeActivityQuery {
  bucketMs: number;
  fromMs: number;
  toMs: number;
}

export type HomeActivityFailureCode =
  | "forbidden"
  | "invalid-request"
  | "invalid-response"
  | "offline"
  | "rate-limited"
  | "unavailable"
  | "error";

export class HomeActivityPortFailure extends Error {
  readonly code: HomeActivityFailureCode;

  constructor(code: HomeActivityFailureCode) {
    super(`Home activity failed: ${code}`);
    this.name = "HomeActivityPortFailure";
    this.code = code;
  }
}

export interface HomeActivityPort {
  loadOverview(
    query: HomeActivityQuery,
    signal?: AbortSignal,
  ): Promise<HomeActivityOverview>;
}

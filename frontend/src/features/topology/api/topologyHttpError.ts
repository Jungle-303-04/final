import { z } from "zod";

import { TopologyGatewayError } from "../contracts";

export type TopologyHttpErrorCategory =
  | "network"
  | "unauthenticated"
  | "permission_denied"
  | "not_found"
  | "conflict"
  | "precondition_failed"
  | "invalid_request"
  | "rate_limited"
  | "source_unavailable"
  | "server_error"
  | "http_error"
  | "invalid_response";

const problemSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    correlationId: z.string().min(1).nullable().optional(),
    details: z.unknown().optional(),
  }),
});

export type CanonicalApiProblem = z.infer<typeof problemSchema>["error"];

function gatewayCode(
  category: TopologyHttpErrorCategory,
): TopologyGatewayError["code"] {
  if (category === "invalid_response") return "invalid_payload";
  if (category === "unauthenticated" || category === "permission_denied") {
    return "forbidden";
  }
  return "network";
}

function safeMessage(category: TopologyHttpErrorCategory): string {
  switch (category) {
    case "unauthenticated":
      return "세션이 만료되었습니다. 다시 로그인한 뒤 재시도하세요.";
    case "permission_denied":
      return "이 토폴로지를 조회할 권한이 없습니다.";
    case "not_found":
      return "요청한 워크스페이스 또는 토폴로지 스냅샷을 찾을 수 없습니다.";
    case "conflict":
      return "토폴로지 상태가 변경되었습니다. 최신 상태로 다시 조회하세요.";
    case "precondition_failed":
      return "요청 기준이 오래되었습니다. 최신 스냅샷을 다시 조회하세요.";
    case "invalid_request":
      return "토폴로지 조회 요청이 유효하지 않습니다.";
    case "rate_limited":
      return "조회 요청이 많습니다. 잠시 후 다시 시도하세요.";
    case "source_unavailable":
      return "토폴로지 데이터 소스에 일시적으로 연결할 수 없습니다.";
    case "server_error":
      return "토폴로지 서버에서 요청을 처리하지 못했습니다.";
    case "http_error":
      return "토폴로지 요청이 실패했습니다.";
    case "invalid_response":
      return "서버 응답이 프론트엔드 토폴로지 계약과 일치하지 않습니다.";
    case "network":
      return "토폴로지 서버에 연결할 수 없습니다.";
  }
}

export type TopologyHttpErrorOptions = {
  readonly category: TopologyHttpErrorCategory;
  readonly requestId: string;
  readonly httpStatus: number | null;
  readonly backendCode: string | null;
  readonly correlationId: string | null;
  readonly retryAfterMs: number | null;
  readonly validationIssues?: readonly {
    readonly path: string;
    readonly message: string;
  }[];
  readonly cause?: unknown;
};

/**
 * Typed transport failure consumed by topology application state.
 *
 * `message` is deliberately safe for direct UI display. `backendCode` and
 * `correlationId` support recovery/diagnostics; raw provider payloads are never
 * attached. Cancellation is not represented by this class and remains the
 * platform `AbortError`, so the UI keeps previous data without showing an error.
 */
export class TopologyHttpError extends TopologyGatewayError {
  readonly category: TopologyHttpErrorCategory;
  readonly requestId: string;
  readonly httpStatus: number | null;
  readonly backendCode: string | null;
  readonly correlationId: string | null;
  readonly retryAfterMs: number | null;
  readonly validationIssues: readonly {
    readonly path: string;
    readonly message: string;
  }[];

  constructor(options: TopologyHttpErrorOptions) {
    super(gatewayCode(options.category), safeMessage(options.category), {
      ...(options.cause === undefined ? {} : { cause: options.cause }),
    });
    this.name = "TopologyHttpError";
    this.category = options.category;
    this.requestId = options.requestId;
    this.httpStatus = options.httpStatus;
    this.backendCode = options.backendCode;
    this.correlationId = options.correlationId;
    this.retryAfterMs = options.retryAfterMs;
    this.validationIssues = options.validationIssues ?? [];
  }
}

export function categoryForHttpStatus(
  status: number,
): TopologyHttpErrorCategory {
  if (status === 401) return "unauthenticated";
  if (status === 403) return "permission_denied";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 412) return "precondition_failed";
  if (status === 400 || status === 422) return "invalid_request";
  if (status === 429) return "rate_limited";
  if (status === 502 || status === 503 || status === 504) {
    return "source_unavailable";
  }
  if (status >= 500) return "server_error";
  return "http_error";
}

export function parseCanonicalApiProblem(input: unknown): CanonicalApiProblem | null {
  const result = problemSchema.safeParse(input);
  return result.success ? result.data.error : null;
}

export function retryAfterMilliseconds(
  value: string | null,
  nowMs = Date.now(),
): number | null {
  if (value === null) return null;
  const normalized = value.trim();
  const seconds = Number(normalized);
  if (/^[0-9]+$/u.test(normalized) && Number.isFinite(seconds)) {
    return Math.round(seconds * 1000);
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, timestamp - nowMs);
}

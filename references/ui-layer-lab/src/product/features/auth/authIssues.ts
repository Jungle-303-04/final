import {
  AuthPortFailure,
  type AuthActionIssue,
  type AuthFailureCode,
} from "./authContract";
import type { MessageKey } from "../../shared/i18n";

export function toAuthActionIssue(error: unknown): AuthActionIssue {
  const failure = error instanceof AuthPortFailure
    ? error
    : new AuthPortFailure("server");
  return {
    code: failure.code,
    messageKey: messageKeyForFailure(failure.code, failure.retryAfterSeconds),
    messageParams: failure.code === "rate-limited" && failure.retryAfterSeconds !== null
      ? { seconds: failure.retryAfterSeconds }
      : undefined,
    retryAfterSeconds: failure.retryAfterSeconds,
    safeDetail: failure.safeDetail ?? undefined,
  };
}

export function logoutIssue(error: unknown): AuthActionIssue {
  return {
    ...toAuthActionIssue(error),
    messageKey: "auth.logout.error.message",
    messageParams: undefined,
  };
}

export function requiresSessionReconciliation(code: AuthFailureCode): boolean {
  return code === "network" || code === "invalid-response" || code === "server";
}

export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}

function messageKeyForFailure(
  code: AuthFailureCode,
  retryAfterSeconds: number | null,
): MessageKey {
  if (code === "invalid-credentials") return "auth.login.error.invalidCredentials";
  if (code === "email-unverified") return "auth.login.error.emailUnverified";
  if (code === "approval-pending") return "auth.login.error.approvalPending";
  if (code === "forbidden") return "auth.failure.forbidden";
  if (code === "rate-limited") {
    return retryAfterSeconds === null ? "auth.failure.rateLimited" : "auth.failure.rateLimitedAfter";
  }
  if (code === "network") return "auth.failure.network";
  if (code === "invalid-response") return "auth.failure.invalidResponse";
  return "auth.failure.server";
}

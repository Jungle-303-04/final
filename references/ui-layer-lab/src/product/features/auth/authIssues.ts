import {
  AuthPortFailure,
  type AuthActionIssue,
  type AuthFailureCode,
} from "./authContract";

export function toAuthActionIssue(error: unknown): AuthActionIssue {
  const failure = error instanceof AuthPortFailure
    ? error
    : new AuthPortFailure("server");
  return {
    code: failure.code,
    message: messageForFailure(failure.code, failure.retryAfterSeconds),
    retryAfterSeconds: failure.retryAfterSeconds,
  };
}

export function logoutIssue(error: unknown): AuthActionIssue {
  return {
    ...toAuthActionIssue(error),
    message: "로그아웃 요청을 완료하지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.",
  };
}

export function requiresSessionReconciliation(code: AuthFailureCode): boolean {
  return code === "network" || code === "invalid-response" || code === "server";
}

export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}

function messageForFailure(
  code: AuthFailureCode,
  retryAfterSeconds: number | null,
): string {
  if (code === "invalid-credentials") return "이메일 또는 비밀번호를 확인하세요.";
  if (code === "email-unverified") return "이메일 인증을 완료한 뒤 다시 로그인하세요.";
  if (code === "approval-pending") return "관리자 승인이 완료될 때까지 기다려 주세요.";
  if (code === "forbidden") return "이 계정에는 제품 접근 권한이 없습니다.";
  if (code === "rate-limited") {
    return retryAfterSeconds === null
      ? "요청이 너무 많습니다. 잠시 후 다시 시도하세요."
      : `요청이 너무 많습니다. ${retryAfterSeconds}초 후 다시 시도하세요.`;
  }
  if (code === "network") return "인증 서버에 연결할 수 없습니다.";
  if (code === "invalid-response") return "인증 응답이 제품 계약과 일치하지 않습니다.";
  return "인증 요청을 완료하지 못했습니다.";
}

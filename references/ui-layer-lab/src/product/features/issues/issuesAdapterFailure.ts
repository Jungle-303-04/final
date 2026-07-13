import {
  IssuesCanonicalError,
  IssuesPortFailure,
  IssuesRequestError,
  type IssuesFailureCode,
} from "./issuesContract";

export async function withCanonicalFailure<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof IssuesPortFailure) throw error;
    if (error instanceof IssuesRequestError) {
      throw new IssuesPortFailure("invalid-request");
    }
    if (error instanceof IssuesCanonicalError) {
      throw new IssuesPortFailure("invalid-response");
    }
    throw toPortFailure(error);
  }
}

export function transportStatus(error: unknown): number | null {
  return transportNumber(error, "status");
}

function toPortFailure(error: unknown): IssuesPortFailure {
  const status = transportStatus(error);
  const kind = transportString(error, "kind");
  const codeByKind: Record<string, IssuesFailureCode> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    "not-found": "not-found",
    "invalid-request": "invalid-request",
    "rate-limited": "rate-limited",
    network: "offline",
    "invalid-payload": "invalid-response",
  };
  const codeByStatus: Record<number, IssuesFailureCode> = {
    401: "unauthorized",
    403: "forbidden",
    404: "not-found",
    422: "invalid-request",
    429: "rate-limited",
    503: "unavailable",
  };
  return new IssuesPortFailure(
    codeByKind[kind ?? ""] ?? codeByStatus[status ?? -1] ?? "error",
    retryAfter(error),
  );
}

function transportString(error: unknown, key: string): string | null {
  if (typeof error !== "object" || error === null || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function transportNumber(error: unknown, key: string): number | null {
  if (typeof error !== "object" || error === null || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function retryAfter(error: unknown): number | null {
  const value = transportNumber(error, "retryAfter");
  return value !== null && value >= 0 ? value : null;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}

import {
  type HelmFailureCode,
  HelmPortFailure,
} from "./helmContract";

export async function withHelmPortFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof HelmPortFailure) throw error;
    throw toPortFailure(error);
  }
}

export function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function toPortFailure(error: unknown): HelmPortFailure {
  const kinds: Record<string, HelmFailureCode> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    "invalid-request": "invalid-request",
    "invalid-payload": "invalid-response",
    "not-found": "not-found",
    network: "offline",
    "rate-limited": "rate-limited",
  };
  const kind = stringField(error, "kind");
  const retryAfter = numberField(error, "retryAfter");
  const code = Object.prototype.hasOwnProperty.call(kinds, kind)
    ? kinds[kind as keyof typeof kinds]
    : "error";
  return new HelmPortFailure(code, retryAfter);
}

function stringField(value: unknown, key: string): string {
  const record = recordValue(value);
  return record && typeof record[key] === "string" ? record[key] : "";
}

function numberField(value: unknown, key: string): number | null {
  const record = recordValue(value);
  return record && typeof record[key] === "number" ? record[key] : null;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

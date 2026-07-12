import type {
  ResourceHealthTone,
  ResourceMetadataEntry,
} from "./resourcesContract";

export class ResourcesCanonicalError extends Error {
  constructor() {
    super("Resources endpoint response violated the canonical contract.");
    this.name = "ResourcesCanonicalError";
  }
}

export class ResourcesRequestError extends Error {
  constructor() {
    super("Resources request violated the canonical contract.");
    this.name = "ResourcesRequestError";
  }
}

export function responseIdentity(value: string): string {
  if (typeof value !== "string" || value === "" || value !== value.trim()) {
    invalidResponse();
  }
  return value;
}

export function requestIdentity(value: string): string {
  if (typeof value !== "string" || value === "" || value !== value.trim()) {
    throw new ResourcesRequestError();
  }
  return value;
}

export function responseResourceType(value: string): string {
  return responseIdentity(value).toLowerCase();
}

export function requestResourceType(value: string): string {
  return requestIdentity(value).toLowerCase();
}

export function responseOptionalIdentity(value: string | null): string | null {
  return value === null ? null : responseIdentity(value);
}

export function requestOptionalIdentity(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : requestIdentity(value);
}

export function responseOptionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") invalidResponse();
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

export function responseText(value: unknown): string {
  if (typeof value !== "string") invalidResponse();
  return value.trim();
}

export function responseTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") invalidResponse();
  const hasTimezone = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const milliseconds = Date.parse(value);
  if (!hasTimezone || !Number.isFinite(milliseconds)) invalidResponse();
  return new Date(milliseconds).toISOString();
}

export function nonNegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    invalidResponse();
  }
  return value;
}

export function optionalNonNegativeInteger(value: unknown): number | null {
  return value === null || value === undefined ? null : nonNegativeInteger(value);
}

export function optionalNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalidResponse();
  }
  return value;
}

export function requestLimit(value: number | undefined, fallback: number): number {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new ResourcesRequestError();
  }
  return limit;
}

export function responseBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "boolean") invalidResponse();
  return value;
}

export function responseStringArray(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) invalidResponse();
  const result = value.map((item) => {
    if (typeof item !== "string") invalidResponse();
    return responseIdentity(item);
  });
  assertUnique(result);
  return result;
}

export function responseRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) invalidResponse();
  return value;
}

export function optionalResponseRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  return responseRecord(value);
}

export function safeScalarEntries(value: unknown): ResourceMetadataEntry[] {
  const record = responseRecord(value);
  return Object.entries(record)
    .flatMap(([key, candidate]) => {
      if (key === "" || key !== key.trim()) return [];
      if (typeof candidate === "string") return [{ key, value: candidate }];
      if (typeof candidate === "boolean") return [{ key, value: String(candidate) }];
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return [{ key, value: String(candidate) }];
      }
      return [];
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function healthTone(value: string): ResourceHealthTone {
  const normalized = responseIdentity(value).toLowerCase().replace(/_/g, "-");
  if (["healthy", "ready", "running", "ok", "available", "normal"].includes(normalized)) {
    return "healthy";
  }
  if (["degraded", "warning", "warn", "progressing", "pending"].includes(normalized)) {
    return "warning";
  }
  if (["critical", "unhealthy", "failed", "error"].includes(normalized)) {
    return "critical";
  }
  if (["stale", "disconnected", "deleted"].includes(normalized)) return "stale";
  return "unknown";
}

export function assertSameIdentity(actual: string, expected: string): void {
  if (responseIdentity(actual) !== expected) invalidResponse();
}

export function assertSameResourceType(actual: string, expected: string): void {
  if (responseResourceType(actual) !== expected) invalidResponse();
}

export function assertSameOptionalIdentity(
  actual: string | null,
  expected: string | null,
): void {
  if (responseOptionalIdentity(actual) !== expected) invalidResponse();
}

export function assertUnique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) invalidResponse();
}

export function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) invalidResponse();
  return result;
}

export function resourceId(
  clusterId: string,
  uid: string | null,
  fallback: readonly string[],
): string {
  const segments = uid === null ? [clusterId, ...fallback] : [clusterId, uid];
  return `resource:${segments.map(encodeURIComponent).join("/")}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function invalidResponse(): never {
  throw new ResourcesCanonicalError();
}

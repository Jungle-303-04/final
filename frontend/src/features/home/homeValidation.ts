import type {
  HomeConnectionState,
  HomeHealthTone,
  HomeRegistrationState,
} from "./homeContract";

export function canonicalIdentity(value: string): string {
  if (value === "" || value !== value.trim()) invalidResponse();
  return value;
}

export function canonicalDisplayLabel(value: string, fallback: string): string {
  const normalized = value.trim();
  return normalized === "" ? canonicalIdentity(fallback) : normalized;
}

export function canonicalOptionalIdentity(value: string | null): string | null {
  return value === null ? null : canonicalIdentity(value);
}

export function canonicalOptionalText(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

export function canonicalTimestamp(value: string | null): string | null {
  if (value === null) return null;
  const hasTimezone = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const milliseconds = Date.parse(value);
  if (!hasTimezone || !Number.isFinite(milliseconds)) invalidResponse();
  return new Date(milliseconds).toISOString();
}

export function nonNegativeInteger(value: number): number {
  if (!Number.isInteger(value) || value < 0) invalidResponse();
  return value;
}

export function nonNegativeNumber(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) invalidResponse();
  return value;
}

export function percentage(value: number | null): number | null {
  return nonNegativeNumber(value);
}

export function healthTone(value: string): HomeHealthTone {
  const normalized = value.trim().toLowerCase().replace(/_/g, "-");
  if (["healthy", "ready", "running", "ok", "available"].includes(normalized)) {
    return "healthy";
  }
  if (["degraded", "warning", "warn", "progressing"].includes(normalized)) {
    return "warning";
  }
  if (["critical", "unhealthy", "failed", "error"].includes(normalized)) {
    return "critical";
  }
  if (["stale", "disconnected"].includes(normalized)) return "stale";
  return "unknown";
}

export function connectionState(value: string): HomeConnectionState {
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (["online", "connected"].includes(normalized)) return "online";
  if (normalized === "stale") return "stale";
  if (["pending", "pending_install", "installing", "never_connected"].includes(normalized)) {
    return "pending";
  }
  if (["offline", "disconnected", "install_expired", "expired"].includes(normalized)) {
    return "offline";
  }
  return "unknown";
}

export function registrationState(value: string): HomeRegistrationState {
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (["active", "connected", "registered", "ready"].includes(normalized)) return "active";
  if (["pending", "pending_install", "installing"].includes(normalized)) return "pending";
  if (["expired", "install_expired"].includes(normalized)) return "expired";
  return "unknown";
}

export function ephemeralId(kind: string, ...segments: string[]): string {
  return `${kind}:${segments.map(encodeURIComponent).join("/")}`;
}

export function assertSameIdentity(actual: string, expected: string): void {
  if (canonicalIdentity(actual) !== canonicalIdentity(expected)) invalidResponse();
}

export function assertUnique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) invalidResponse();
}

export class HomeCanonicalError extends Error {
  constructor() {
    super("Home endpoint response violated the canonical contract.");
    this.name = "HomeCanonicalError";
  }
}

export function isHomeCanonicalError(error: unknown): error is HomeCanonicalError {
  return error instanceof HomeCanonicalError ||
    (typeof error === "object" && error !== null && "name" in error &&
      error.name === "HomeCanonicalError");
}

export function invalidResponse(): never {
  throw new HomeCanonicalError();
}

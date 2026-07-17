import {
  AuthPortFailure,
  type AuthCredentials,
  type AuthFailureCode,
  type AuthPort,
  type ProductSession,
} from "./authContract";
import type { AuthEndpointSession } from "./authEndpointContract";

export type { AuthEndpointSession } from "./authEndpointContract";

export interface AuthEndpointDependencies {
  getSession(signal?: AbortSignal): Promise<AuthEndpointSession>;
  login(credentials: AuthCredentials, signal?: AbortSignal): Promise<AuthEndpointSession>;
  logout(signal?: AbortSignal): Promise<void>;
}

export function createAuthAdapter(
  endpoints: AuthEndpointDependencies,
): AuthPort {
  return {
    async loadSession(signal) {
      try {
        const wireSession = await endpoints.getSession(signal);
        if (!wireSession.authenticated) return { status: "unauthenticated" };
        return {
          status: "authenticated",
          session: toProductSession(wireSession),
        };
      } catch (error) {
        if (isAbortError(error) || error instanceof AuthPortFailure) throw error;
        if (transportKind(error) === "unauthorized") {
          return { status: "unauthenticated" };
        }
        throw toPortFailure(error);
      }
    },

    async signIn(credentials, signal) {
      try {
        const wireSession = await endpoints.login(credentials, signal);
        if (!wireSession.authenticated) {
          throw new AuthPortFailure("invalid-credentials");
        }
        return toProductSession(wireSession);
      } catch (error) {
        if (isAbortError(error) || error instanceof AuthPortFailure) throw error;
        const kind = transportKind(error);
        if (kind === "unauthorized" || kind === "invalid-request") {
          throw new AuthPortFailure("invalid-credentials");
        }
        throw toPortFailure(error);
      }
    },

    async signOut(signal) {
      try {
        await endpoints.logout(signal);
      } catch (error) {
        if (isAbortError(error)) throw error;
        if (transportKind(error) === "unauthorized") return;
        throw toPortFailure(error);
      }
    },
  };
}

function toProductSession(wireSession: AuthEndpointSession): ProductSession {
  const displayName = canonicalOptionalIdentity(wireSession.display_name);
  const email = canonicalOptionalIdentity(wireSession.email);
  const userId = canonicalIdentity(wireSession.user_id);
  const workspaceId = canonicalIdentity(wireSession.workspace_id);
  if (userId === null || workspaceId === null) {
    throw new AuthPortFailure("invalid-response");
  }

  const groups = wireSession.groups.map(canonicalIdentity);
  const roles = wireSession.roles.map(canonicalIdentity);
  if (
    wireSession.auth_enabled !== true
    || !groups.every((group): group is string => group !== null)
    || !roles.every((role): role is string => role !== null)
  ) {
    throw new AuthPortFailure("invalid-response");
  }

  return {
    authEnabled: true,
    authMode: wireSession.auth_mode,
    ...(displayName === null ? {} : { displayName }),
    ...(email === null ? {} : { email }),
    groups: [...new Set(groups)].sort((left, right) => left.localeCompare(right)),
    logout: {
      action: wireSession.logout.action,
      supported: wireSession.logout.supported,
      reauthenticationExpected: wireSession.logout.reauthentication_expected,
    },
    userId,
    roles: [...new Set(roles)].sort((left, right) => left.localeCompare(right)),
    workspaceId,
  };
}

function canonicalOptionalIdentity(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const canonical = canonicalIdentity(value);
  if (canonical === null) throw new AuthPortFailure("invalid-response");
  return canonical;
}

function canonicalIdentity(value: string): string | null {
  return value !== "" && value === value.trim() ? value : null;
}

function toPortFailure(error: unknown): AuthPortFailure {
  const canonicalReasonByTransportCode: Record<string, AuthFailureCode> = {
    email_unverified: "email-unverified",
    approval_pending: "approval-pending",
  };
  const canonicalReason = canonicalReasonByTransportCode[transportCode(error) ?? ""];
  if (canonicalReason !== undefined) {
    return new AuthPortFailure(canonicalReason, transportRetryAfter(error));
  }

  const codeByTransportKind: Record<string, AuthFailureCode> = {
    forbidden: "forbidden",
    "rate-limited": "rate-limited",
    network: "network",
    "invalid-payload": "invalid-response",
  };
  return new AuthPortFailure(
    codeByTransportKind[transportKind(error) ?? ""] ?? "server",
    transportRetryAfter(error),
    safePlainDetail(transportDetail(error)),
  );
}

function transportCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}

function transportKind(error: unknown): string | null {
  return typeof error === "object" && error !== null && "kind" in error &&
    typeof error.kind === "string"
    ? error.kind
    : null;
}

function transportDetail(error: unknown): string | null {
  return typeof error === "object" && error !== null && "detail" in error &&
    typeof error.detail === "string"
    ? error.detail
    : null;
}

const UNSAFE_DETAIL_PATTERN =
  /(?:<[^>]*>|&#?\w+;|\b(?:authorization|cookie|password|secret|session|token)\b\s*[:=]?|\b(?:error|exception)\s*:|(?:^|\s)at\s+\S+\s*\()/iu;

function safePlainDetail(detail: string | null): string | null {
  if (detail === null) return null;
  const normalized = detail.trim();
  if (normalized === "" || normalized.length > 240) return null;
  if ([...normalized].some(isControlCharacter)) return null;
  return UNSAFE_DETAIL_PATTERN.test(normalized) ? null : normalized;
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
}

function transportRetryAfter(error: unknown): number | null {
  if (
    typeof error !== "object" || error === null || !("retryAfter" in error) ||
    typeof error.retryAfter !== "number" || !Number.isFinite(error.retryAfter) ||
    error.retryAfter < 0
  ) {
    return null;
  }
  return error.retryAfter;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}

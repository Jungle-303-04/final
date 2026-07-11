import {
  AuthPortFailure,
  type AuthCredentials,
  type AuthFailureCode,
  type AuthPort,
  type ProductSession,
} from "./authContract";

export interface AuthEndpointSession {
  authenticated: boolean;
  user_id: string;
  roles: readonly string[];
  workspace_id: string;
}

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
  const userId = canonicalIdentity(wireSession.user_id);
  const workspaceId = canonicalIdentity(wireSession.workspace_id);
  if (userId === null || workspaceId === null) {
    throw new AuthPortFailure("invalid-response");
  }

  const roles = wireSession.roles.map(canonicalIdentity);
  if (!roles.every((role): role is string => role !== null)) {
    throw new AuthPortFailure("invalid-response");
  }

  return {
    userId,
    roles: [...new Set(roles)].sort((left, right) => left.localeCompare(right)),
    workspaceId,
  };
}

function canonicalIdentity(value: string): string | null {
  return value !== "" && value === value.trim() ? value : null;
}

function toPortFailure(error: unknown): AuthPortFailure {
  const codeByTransportKind: Record<string, AuthFailureCode> = {
    forbidden: "forbidden",
    "rate-limited": "rate-limited",
    network: "network",
    "invalid-payload": "invalid-response",
  };
  return new AuthPortFailure(
    codeByTransportKind[transportKind(error) ?? ""] ?? "server",
    transportRetryAfter(error),
  );
}

function transportKind(error: unknown): string | null {
  return typeof error === "object" && error !== null && "kind" in error &&
    typeof error.kind === "string"
    ? error.kind
    : null;
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

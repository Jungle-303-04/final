export interface ProductSession {
  userId: string;
  roles: readonly string[];
  workspaceId: string;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export type AuthSessionResult =
  | { status: "authenticated"; session: ProductSession }
  | { status: "unauthenticated" };

export type AuthFailureCode =
  | "invalid-credentials"
  | "email-unverified"
  | "approval-pending"
  | "forbidden"
  | "rate-limited"
  | "network"
  | "invalid-response"
  | "server";

export class AuthPortFailure extends Error {
  readonly code: AuthFailureCode;
  readonly retryAfterSeconds: number | null;

  constructor(code: AuthFailureCode, retryAfterSeconds: number | null = null) {
    super(`Authentication port failed: ${code}`);
    this.name = "AuthPortFailure";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface AuthPort {
  loadSession(signal?: AbortSignal): Promise<AuthSessionResult>;
  signIn(credentials: AuthCredentials, signal?: AbortSignal): Promise<ProductSession>;
  signOut(signal?: AbortSignal): Promise<void>;
}

export interface AuthActionIssue {
  code: AuthFailureCode;
  message: string;
  retryAfterSeconds: number | null;
}

export interface AuthenticatedAuthState {
  session: ProductSession;
  signOutIssue: AuthActionIssue | null;
  signOutPending: boolean;
  onSignOut: () => void;
}

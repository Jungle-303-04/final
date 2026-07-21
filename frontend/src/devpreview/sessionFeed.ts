import { useEffect, useState } from "react";

import { getSession } from "../api/auth";
import type { AuthSession } from "../api/schemas";

// UI-PHASE2-001 §5.2 / §6 hard-coded-session blocker: typed live adapter for the
// header account/workspace/logout. Reads `GET /api/auth/session`. Identity,
// roles, workspace and logout capability come from the real session — never a
// hard-coded name/email. A `storage.clear()+reload` is not a logout.

export type SessionStatus = "loading" | "ready" | "error";

export interface SessionView {
  status: SessionStatus;
  authenticated: boolean;
  authEnabled: boolean;
  authMode: string | null;
  displayName: string | null;
  email: string | null;
  userId: string | null;
  roles: string[];
  workspaceId: string | null;
  /** Whether the server advertises a supported logout for this auth mode. */
  logoutSupported: boolean;
}

const INITIAL: SessionView = {
  status: "loading",
  authenticated: false,
  authEnabled: false,
  authMode: null,
  displayName: null,
  email: null,
  userId: null,
  roles: [],
  workspaceId: null,
  logoutSupported: false,
};

function toSessionView(session: AuthSession): SessionView {
  return {
    status: "ready",
    authenticated: session.authenticated,
    authEnabled: session.auth_enabled ?? true,
    authMode: session.auth_mode ?? null,
    displayName: session.display_name ?? null,
    email: session.email ?? null,
    userId: session.user_id,
    roles: [...session.roles],
    workspaceId: session.workspace_id,
    logoutSupported: session.logout?.supported ?? false,
  };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

/** The first initial for the account avatar, derived from real identity. */
export function sessionInitial(view: SessionView): string {
  const source = view.displayName ?? view.email ?? view.userId ?? "";
  const trimmed = source.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

export function useSession(): SessionView {
  const [view, setView] = useState<SessionView>(INITIAL);
  useEffect(() => {
    const controller = new AbortController();
    void getSession(controller.signal)
      .then((session) => {
        if (controller.signal.aborted) return;
        setView(toSessionView(session));
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setView((prev) => ({ ...prev, status: "error" }));
      });
    return () => controller.abort();
  }, []);
  return view;
}

// 로그아웃도 이 도메인 어댑터 경계를 통해서만 노출한다(shell이 api를 직접 import하지 않도록).
export { logout } from "../api/auth";

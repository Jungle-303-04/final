import { apiRequest } from "./client";
import {
  authSessionSchema,
  authWorkspaceListSchema,
  logoutResponseSchema,
  type AuthSession,
} from "./schemas";
import type { AuthEndpointWorkspaceList } from "../features/auth/authEndpointContract";

export interface LoginCredentials {
  email: string;
  password: string;
}

export function getSession(signal?: AbortSignal): Promise<AuthSession> {
  return apiRequest("/api/auth/session", authSessionSchema, { signal });
}

export function login(
  credentials: LoginCredentials,
  signal?: AbortSignal,
): Promise<AuthSession> {
  return apiRequest("/api/auth/login", authSessionSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(credentials),
    signal,
  });
}

export async function logout(signal?: AbortSignal): Promise<void> {
  await apiRequest("/api/auth/logout", logoutResponseSchema, {
    method: "POST",
    signal,
  });
}

export function listAuthWorkspaces(signal?: AbortSignal): Promise<AuthEndpointWorkspaceList> {
  return apiRequest("/api/auth/workspaces", authWorkspaceListSchema, { signal });
}

export function switchAuthWorkspace(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<AuthSession> {
  return apiRequest("/api/auth/workspaces/switch", authSessionSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace_id: workspaceId }),
    signal,
  });
}

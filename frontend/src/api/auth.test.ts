import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSession, login, logout } from "./auth";
import { ApiError } from "./client";

const SESSION = {
  authenticated: true,
  auth_enabled: true,
  auth_mode: "password",
  groups: ["group-platform"],
  logout: {
    action: "end_session",
    supported: true,
    reauthentication_expected: false,
  },
  user_id: "user-123",
  roles: ["service_admin"],
  workspace_id: "default",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("auth API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the current session with cookie credentials and no request body", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(SESSION),
    );

    await expect(getSession()).resolves.toEqual(SESSION);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("body");
  });

  it("preserves a 401 session response as an unauthorized API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "Not authenticated" }, 401),
    );

    await expect(getSession()).rejects.toMatchObject({
      kind: "unauthorized",
      status: 401,
      detail: "Not authenticated",
    } satisfies Partial<ApiError>);
  });

  it("rejects a session response that does not match the wire contract", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ...SESSION, roles: "service_admin" }),
    );

    await expect(getSession()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("rejects source-only cloud roles and raw proxy logout URLs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        ...SESSION,
        cloud_role: "owner",
        logout: {
          ...SESSION.logout,
          redirect_url: "https://identity.example.test/logout",
        },
      }),
    );

    await expect(getSession()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("passes the caller AbortSignal through without replacing AbortError", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);
    controller.abort();

    await expect(getSession(controller.signal)).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("logs in once with the exact JSON body and state-changing request headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(SESSION),
    );

    await expect(login({
      email: "operator@example.com",
      password: "correct horse battery staple",
    })).resolves.toEqual(SESSION);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(path).toBe("/api/auth/login");
    expect(init).toMatchObject({
      body: JSON.stringify({
        email: "operator@example.com",
        password: "correct horse battery staple",
      }),
      credentials: "include",
      method: "POST",
    });
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-service-csrf")).toBe("same-origin");
  });

  it("does not retry a possibly-sent login POST", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("connection closed after request write"),
    );

    await expect(login({
      email: "operator@example.com",
      password: "secret",
    })).rejects.toMatchObject({ kind: "network" } satisfies Partial<ApiError>);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("logs out once using the JSON 200 contract and returns void", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ authenticated: false }),
    );

    await expect(logout()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(path).toBe("/api/auth/logout");
    expect(init).toMatchObject({
      credentials: "include",
      method: "POST",
    });
    expect(init).not.toHaveProperty("body");
    expect(headers.get("x-service-csrf")).toBe("same-origin");
  });

  it("forwards AbortSignal to logout without retrying the POST", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);
    controller.abort();

    await expect(logout(controller.signal)).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});

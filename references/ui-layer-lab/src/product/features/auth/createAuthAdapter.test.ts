import { describe, expect, it, vi } from "vitest";
import { AuthPortFailure } from "./authContract";
import {
  createAuthAdapter,
  type AuthEndpointDependencies,
  type AuthEndpointSession,
} from "./createAuthAdapter";

const AUTHENTICATED_WIRE_SESSION: AuthEndpointSession = {
  authenticated: true,
  user_id: "operator-17",
  roles: ["viewer", "admin", "viewer"],
  workspace_id: "workspace-main",
};

describe("canonical auth adapter", () => {
  it("maps an authenticated wire session and canonicalizes role order", async () => {
    const dependencies = endpoints();
    const port = createAuthAdapter(dependencies);

    await expect(port.loadSession()).resolves.toEqual({
      status: "authenticated",
      session: {
        userId: "operator-17",
        roles: ["admin", "viewer"],
        workspaceId: "workspace-main",
      },
    });
  });

  it("discards every identity field from an unauthenticated response", async () => {
    const dependencies = endpoints({
      getSession: vi.fn().mockResolvedValue({
        ...AUTHENTICATED_WIRE_SESSION,
        authenticated: false,
      }),
    });

    const result = await createAuthAdapter(dependencies).loadSession();

    expect(result).toEqual({ status: "unauthenticated" });
    expect(result).not.toHaveProperty("session");
  });

  it("maps a session 401 to unauthenticated without exposing the transport error", async () => {
    const dependencies = endpoints({
      getSession: vi.fn().mockRejectedValue({ kind: "unauthorized", detail: "private" }),
    });

    await expect(createAuthAdapter(dependencies).loadSession()).resolves.toEqual({
      status: "unauthenticated",
    });
  });

  it("rejects empty canonical identity fields as an invalid response", async () => {
    const dependencies = endpoints({
      getSession: vi.fn().mockResolvedValue({
        ...AUTHENTICATED_WIRE_SESSION,
        user_id: " ",
      }),
    });

    await expect(createAuthAdapter(dependencies).loadSession()).rejects.toMatchObject({
      code: "invalid-response",
    } satisfies Partial<AuthPortFailure>);
  });

  it("passes exact credentials and AbortSignal to the login endpoint", async () => {
    const controller = new AbortController();
    const dependencies = endpoints();
    const port = createAuthAdapter(dependencies);

    await expect(port.signIn({
      email: "operator@example.com",
      password: "one-time-secret",
    }, controller.signal)).resolves.toMatchObject({ userId: "operator-17" });
    expect(dependencies.login).toHaveBeenCalledOnce();
    expect(dependencies.login).toHaveBeenCalledWith({
      email: "operator@example.com",
      password: "one-time-secret",
    }, controller.signal);
  });

  it.each(["unauthorized", "invalid-request"])(
    "maps %s login rejection to invalid credentials",
    async (kind) => {
      const dependencies = endpoints({
        login: vi.fn().mockRejectedValue({ kind, detail: "private" }),
      });

      await expect(createAuthAdapter(dependencies).signIn({
        email: "operator@example.com",
        password: "incorrect",
      })).rejects.toMatchObject({ code: "invalid-credentials" });
    },
  );

  it("treats an authenticated:false login response as rejected credentials", async () => {
    const dependencies = endpoints({
      login: vi.fn().mockResolvedValue({
        ...AUTHENTICATED_WIRE_SESSION,
        authenticated: false,
      }),
    });

    await expect(createAuthAdapter(dependencies).signIn({
      email: "operator@example.com",
      password: "incorrect",
    })).rejects.toMatchObject({ code: "invalid-credentials" });
  });

  it.each([
    ["network", "network"],
    ["forbidden", "forbidden"],
    ["rate-limited", "rate-limited"],
    ["invalid-payload", "invalid-response"],
    ["http", "server"],
  ] as const)("maps %s transport failures to %s", async (kind, code) => {
    const dependencies = endpoints({
      getSession: vi.fn().mockRejectedValue({ kind, detail: "private" }),
    });

    await expect(createAuthAdapter(dependencies).loadSession()).rejects.toMatchObject({ code });
  });

  it("preserves a valid retry-after delay without exposing server detail", async () => {
    const dependencies = endpoints({
      login: vi.fn().mockRejectedValue({
        kind: "rate-limited",
        retryAfter: 12,
        detail: "private",
      }),
    });

    await expect(createAuthAdapter(dependencies).signIn({
      email: "operator@example.com",
      password: "secret",
    })).rejects.toMatchObject({
      code: "rate-limited",
      retryAfterSeconds: 12,
    });
  });

  it("accepts an unauthorized logout as an authoritative signed-out state", async () => {
    const dependencies = endpoints({
      logout: vi.fn().mockRejectedValue({ kind: "unauthorized" }),
    });

    await expect(createAuthAdapter(dependencies).signOut()).resolves.toBeUndefined();
    expect(dependencies.logout).toHaveBeenCalledOnce();
  });

  it("preserves AbortError identity for every operation", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    const dependencies = endpoints({
      getSession: vi.fn().mockRejectedValue(abortError),
    });

    await expect(createAuthAdapter(dependencies).loadSession()).rejects.toBe(abortError);
  });
});

function endpoints(
  overrides: Partial<AuthEndpointDependencies> = {},
 ) {
  return {
    getSession: vi.fn(overrides.getSession ?? (() => Promise.resolve(AUTHENTICATED_WIRE_SESSION))),
    login: vi.fn(overrides.login ?? (() => Promise.resolve(AUTHENTICATED_WIRE_SESSION))),
    logout: vi.fn(overrides.logout ?? (() => Promise.resolve())),
  };
}

import { describe, expect, it, vi } from "vitest";
import { AuthPortFailure } from "./authContract";
import {
  createAuthAdapter,
  type AuthEndpointDependencies,
  type AuthEndpointSession,
} from "./createAuthAdapter";

const AUTHENTICATED_WIRE_SESSION: AuthEndpointSession = {
  authenticated: true,
  auth_enabled: true,
  auth_mode: "password",
  groups: ["group-release", "group-platform", "group-release"],
  logout: {
    action: "end_session",
    supported: true,
    reauthentication_expected: false,
  },
  user_id: "operator-17",
  roles: ["viewer", "admin", "viewer"],
  workspace_id: "workspace-main",
};

describe("canonical auth adapter", () => {
  it("maps the authorized workspace catalog and returns switched session authority", async () => {
    const dependencies = endpoints({
      listWorkspaces: vi.fn().mockResolvedValue({
        current_workspace_id: "workspace-main",
        items: [{ workspace_id: "workspace-next", name: "Next", slug: "next" }],
      }),
      switchWorkspace: vi.fn().mockResolvedValue({
        ...AUTHENTICATED_WIRE_SESSION,
        workspace_id: "workspace-next",
      }),
    });
    const port = createAuthAdapter(dependencies);

    await expect(port.listWorkspaces()).resolves.toEqual({
      currentWorkspaceId: "workspace-main",
      items: [{ workspaceId: "workspace-next", name: "Next", slug: "next" }],
    });
    await expect(port.switchWorkspace("workspace-next")).resolves.toMatchObject({
      workspaceId: "workspace-next",
    });
    expect(dependencies.switchWorkspace).toHaveBeenCalledWith("workspace-next", undefined);
  });

  it("maps an authenticated wire session and canonicalizes role order", async () => {
    const dependencies = endpoints();
    const port = createAuthAdapter(dependencies);

    await expect(port.loadSession()).resolves.toEqual({
      status: "authenticated",
      session: {
        authEnabled: true,
        authMode: "password",
        groups: ["group-platform", "group-release"],
        logout: {
          action: "end_session",
          supported: true,
          reauthenticationExpected: false,
        },
        userId: "operator-17",
        roles: ["admin", "viewer"],
        workspaceId: "workspace-main",
      },
    });
  });

  it("preserves optional profile identity fields when the API proves them", async () => {
    const dependencies = endpoints({
      getSession: vi.fn().mockResolvedValue({
        ...AUTHENTICATED_WIRE_SESSION,
        display_name: "Woo Nyong",
        email: "woonyong.kr@gmail.com",
      }),
    });

    await expect(createAuthAdapter(dependencies).loadSession()).resolves.toMatchObject({
      status: "authenticated",
      session: {
        displayName: "Woo Nyong",
        email: "woonyong.kr@gmail.com",
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

  it.each([
    ["email_unverified", "email-unverified"],
    ["approval_pending", "approval-pending"],
  ] as const)("maps the canonical login reason %s to %s", async (transportCode, code) => {
    const dependencies = endpoints({
      login: vi.fn().mockRejectedValue({
        kind: "forbidden",
        code: transportCode,
        detail: "private",
      }),
    });

    const result = createAuthAdapter(dependencies).signIn({
      email: "operator@example.com",
      password: "secret",
    });

    await expect(result).rejects.toMatchObject({ code, safeDetail: null });
  });

  it("keeps an unknown forbidden login reason provider-neutral with safe plain detail", async () => {
    const dependencies = endpoints({
      login: vi.fn().mockRejectedValue({
        kind: "forbidden",
        code: "provider_only_reason",
        detail: "This account is not assigned to the requested workspace.",
      }),
    });

    await expect(createAuthAdapter(dependencies).signIn({
      email: "operator@example.com",
      password: "secret",
    })).rejects.toMatchObject({
      code: "forbidden",
      safeDetail: "This account is not assigned to the requested workspace.",
    });
  });

  it.each([null, "provider_only_reason"])(
    "preserves safe plain API detail when the structured code is %s",
    async (code) => {
      const dependencies = endpoints({
        getSession: vi.fn().mockRejectedValue({
          kind: "http",
          code: code ?? undefined,
          detail: "Authentication is temporarily unavailable.",
          status: 503,
        }),
      });

      await expect(createAuthAdapter(dependencies).loadSession()).rejects.toMatchObject({
        code: "server",
        safeDetail: "Authentication is temporarily unavailable.",
      });
    },
  );

  it.each([
    "<script>alert('x')</script>",
    "Error: private failure\n    at authenticate (/srv/auth.ts:10:2)",
    "authorization token=secret-value",
    "x".repeat(241),
  ])("rejects unsafe authentication detail: %s", async (detail) => {
    const dependencies = endpoints({
      getSession: vi.fn().mockRejectedValue({
        kind: "http",
        detail,
        status: 500,
      }),
    });

    await expect(createAuthAdapter(dependencies).loadSession()).rejects.toMatchObject({
      code: "server",
      safeDetail: null,
    });
  });

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

  it("preserves a valid retry-after delay without exposing secret detail", async () => {
    const dependencies = endpoints({
      login: vi.fn().mockRejectedValue({
        kind: "rate-limited",
        retryAfter: 12,
        detail: "token=private",
      }),
    });

    await expect(createAuthAdapter(dependencies).signIn({
      email: "operator@example.com",
      password: "secret",
    })).rejects.toMatchObject({
      code: "rate-limited",
      retryAfterSeconds: 12,
      safeDetail: null,
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
    listWorkspaces: vi.fn(overrides.listWorkspaces ?? (() => Promise.resolve({
      current_workspace_id: "workspace-main",
      items: [],
    }))),
    login: vi.fn(overrides.login ?? (() => Promise.resolve(AUTHENTICATED_WIRE_SESSION))),
    logout: vi.fn(overrides.logout ?? (() => Promise.resolve())),
    switchWorkspace: vi.fn(
      overrides.switchWorkspace ?? (() => Promise.resolve(AUTHENTICATED_WIRE_SESSION)),
    ),
  };
}

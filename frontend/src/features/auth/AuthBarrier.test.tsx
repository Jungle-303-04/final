// @vitest-environment jsdom

import { ThemeProvider } from "next-themes";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  I18nProvider,
  useI18n,
  type LocaleStorage,
  type SupportedLocale,
} from "../../shared/i18n";
import { AuthBarrier } from "./AuthBarrier";
import {
  AuthPortFailure,
  type AuthPort,
  type AuthSessionResult,
  type AuthenticatedAuthState,
  type ProductSession,
} from "./authContract";

const TEST_SESSION: ProductSession = {
  authEnabled: true,
  authMode: "password",
  groups: [],
  logout: {
    action: "end_session",
    supported: true,
    reauthenticationExpected: false,
  },
  userId: "operator-17",
  roles: ["viewer"],
  workspaceId: "workspace-main",
};

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  document.documentElement.className = "";
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("AuthBarrier", () => {
  it("deduplicates the StrictMode session read and remains in a busy checking state", () => {
    const pending = deferred<AuthSessionResult>();
    const port = authPort({ loadSession: vi.fn(() => pending.promise) });

    renderBarrier(port);

    expect(port.loadSession).toHaveBeenCalledOnce();
    expect(screen.getByRole("status", { name: "세션 확인 중" })).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByRole("main").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("shows an accessible login form for an unauthenticated session", async () => {
    const port = authPort({
      loadSession: vi.fn().mockResolvedValue({ status: "unauthenticated" }),
    });

    renderBarrier(port);

    expect(await screen.findByRole("heading", { name: "Kyro에 로그인" })).toBeTruthy();
    const email = screen.getByRole("textbox", { name: "아이디 또는 이메일" });
    const password = screen.getByLabelText("비밀번호");
    expect(email.getAttribute("type")).toBe("text");
    expect(email.getAttribute("autocomplete")).toBe("username");
    expect(email.hasAttribute("required")).toBe(true);
    expect(password.getAttribute("type")).toBe("password");
    expect(password.getAttribute("autocomplete")).toBe("current-password");
    expect(screen.queryByText(/OIDC|provider|callback/iu)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(email));
  });

  it("submits exact credentials once, clears the password, and waits for authority", async () => {
    const deferredSignIn = deferred<ProductSession>();
    const signIn = vi.fn(() => deferredSignIn.promise);
    const port = authPort({
      loadSession: vi.fn().mockResolvedValue({ status: "unauthenticated" }),
      signIn,
    });
    const user = userEvent.setup();
    renderBarrier(port);
    const email = await screen.findByRole("textbox", { name: "아이디 또는 이메일" });
    const password = screen.getByLabelText("비밀번호");
    await user.type(email, "operator@example.com");
    await user.type(password, "  unchanged secret  ");
    await user.click(screen.getByRole("button", { name: "로그인" }));
    await user.keyboard("{Enter}");

    expect(signIn).toHaveBeenCalledOnce();
    expect(signIn).toHaveBeenCalledWith({
      email: "operator@example.com",
      password: "  unchanged secret  ",
    }, expect.any(AbortSignal));
    expect((password as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "로그인 중" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText("인증된 제품")).toBeNull();

    deferredSignIn.resolve(TEST_SESSION);
    expect(await screen.findByText("인증된 제품")).toBeTruthy();
  });

  it("keeps email, clears password, focuses it, and hides private detail on rejection", async () => {
    const port = authPort({
      loadSession: vi.fn().mockResolvedValue({ status: "unauthenticated" }),
      signIn: vi.fn().mockRejectedValue(new AuthPortFailure("invalid-credentials")),
    });
    const user = userEvent.setup();
    renderBarrier(port);
    const email = await screen.findByRole("textbox", { name: "아이디 또는 이메일" });
    const password = screen.getByLabelText("비밀번호");
    await user.type(email, "operator@example.com");
    await user.type(password, "private-password");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "이메일 또는 비밀번호를 확인하세요.",
    );
    expect(document.body.textContent).not.toContain("private-password");
    expect((email as HTMLInputElement).value).toBe("operator@example.com");
    expect((password as HTMLInputElement).value).toBe("");
    await waitFor(() => expect(document.activeElement).toBe(password));
  });

  it.each([
    ["email-unverified", "이메일 인증을 완료한 뒤 다시 로그인하세요."],
    ["approval-pending", "계정 승인을 기다리고 있습니다."],
  ] as const)("shows the canonical %s guidance without another session read", async (code, message) => {
    const loadSession = vi.fn().mockResolvedValue({ status: "unauthenticated" });
    const port = authPort({
      loadSession,
      signIn: vi.fn().mockRejectedValue(new AuthPortFailure(code)),
    });
    const user = userEvent.setup();
    renderBarrier(port);
    await user.type(
      await screen.findByRole("textbox", { name: "아이디 또는 이메일" }),
      "operator@example.com",
    );
    await user.type(screen.getByLabelText("비밀번호"), "secret");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect((await screen.findByRole("alert")).textContent).toContain(message);
    expect(loadSession).toHaveBeenCalledOnce();
  });

  it("maps a session network failure to a manual retry without automatic refresh", async () => {
    const loadSession = vi.fn()
      .mockRejectedValueOnce(new AuthPortFailure("network"))
      .mockResolvedValueOnce({ status: "unauthenticated" });
    const port = authPort({ loadSession });
    const user = userEvent.setup();
    renderBarrier(port);

    expect(await screen.findByRole("heading", {
      level: 1,
      name: "컨트롤 플레인에 연결할 수 없습니다",
    })).toBeTruthy();
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(loadSession).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "세션 다시 확인" }));
    expect(await screen.findByRole("heading", { name: "Kyro에 로그인" })).toBeTruthy();
    expect(loadSession).toHaveBeenCalledTimes(2);
  });

  it("keeps the authenticated child mounted until logout succeeds", async () => {
    const signOutResult = deferred<void>();
    const signOut = vi.fn(() => signOutResult.promise);
    const port = authPort({ signOut });
    const user = userEvent.setup();
    renderBarrier(port);

    const logout = await screen.findByRole("button", { name: "테스트 로그아웃" });
    await user.click(logout);
    await user.click(logout);
    expect(signOut).toHaveBeenCalledOnce();
    expect(screen.getByText("인증된 제품")).toBeTruthy();
    expect(screen.getByText("로그아웃 처리 중")).toBeTruthy();

    signOutResult.resolve();
    expect(await screen.findByRole("heading", { name: "Kyro에 로그인" })).toBeTruthy();
  });

  it("installs switched session authority without another bootstrap read", async () => {
    const nextSession = { ...TEST_SESSION, workspaceId: "workspace-next" };
    const switchWorkspace = vi.fn().mockResolvedValue(nextSession);
    const port = authPort({ switchWorkspace });
    const user = userEvent.setup();
    renderBarrier(port);

    expect(await screen.findByText("workspace-main")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "테스트 워크스페이스 전환" }));

    expect(await screen.findByText("workspace-next")).toBeTruthy();
    expect(switchWorkspace).toHaveBeenCalledOnce();
    expect(switchWorkspace).toHaveBeenCalledWith("workspace-next", expect.any(AbortSignal));
    expect(port.loadSession).toHaveBeenCalledOnce();
  });

  it("aborts an active session request after a real unmount", async () => {
    const pending = deferred<AuthSessionResult>();
    let receivedSignal: AbortSignal | undefined;
    const port = authPort({
      loadSession: vi.fn((signal) => {
        receivedSignal = signal;
        return pending.promise;
      }),
    });
    const view = renderBarrier(port);

    view.unmount();
    await Promise.resolve();
    expect(receivedSignal?.aborted).toBe(true);
  });
});

function AuthenticatedProduct({ auth }: { auth: AuthenticatedAuthState }) {
  const { t } = useI18n();
  return (
    <main>
      <p>인증된 제품</p>
      <p>{auth.signOutPending
        ? "로그아웃 처리 중"
        : auth.signOutIssue
          ? t(auth.signOutIssue.messageKey, auth.signOutIssue.messageParams)
          : null}</p>
      <button onClick={auth.onSignOut} type="button">테스트 로그아웃</button>
      <p>{auth.session.workspaceId}</p>
      <button
        onClick={() => void auth.switchWorkspace("workspace-next")}
        type="button"
      >
        테스트 워크스페이스 전환
      </button>
    </main>
  );
}

function renderBarrier(
  port: AuthPort,
  locale: SupportedLocale = "ko",
  storage: LocaleStorage | null = null,
) {
  return render(
    <StrictMode>
      <I18nProvider navigatorLanguage={locale} storage={storage}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          themes={["light", "dark"]}
        >
          <AuthBarrier port={port}>
            {(auth) => <AuthenticatedProduct auth={auth} />}
          </AuthBarrier>
        </ThemeProvider>
      </I18nProvider>
    </StrictMode>,
  );
}

function authPort(overrides: Partial<AuthPort> = {}): AuthPort {
  return {
    listWorkspaces: overrides.listWorkspaces ?? vi.fn().mockResolvedValue({
      currentWorkspaceId: "workspace-1",
      items: [],
    }),
    loadSession: overrides.loadSession ?? vi.fn().mockResolvedValue({
      status: "authenticated",
      session: TEST_SESSION,
    }),
    signIn: overrides.signIn ?? vi.fn().mockResolvedValue(TEST_SESSION),
    signOut: overrides.signOut ?? vi.fn().mockResolvedValue(undefined),
    switchWorkspace: overrides.switchWorkspace ?? vi.fn().mockResolvedValue(TEST_SESSION),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

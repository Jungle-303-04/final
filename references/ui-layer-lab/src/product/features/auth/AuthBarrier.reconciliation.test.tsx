// @vitest-environment jsdom

import { ThemeProvider } from "next-themes";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, useI18n } from "../../shared/i18n";
import { AuthBarrier } from "./AuthBarrier";
import { useAuthSessionGate } from "./AuthSessionGate";
import {
  AuthPortFailure,
  type AuthPort,
  type AuthSessionResult,
  type AuthenticatedAuthState,
  type ProductSession,
} from "./authContract";

const TEST_SESSION: ProductSession = {
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

describe("AuthBarrier mutation reconciliation", () => {
  it("preserves the authoritative session when logout fails", async () => {
    const loadSession = vi.fn()
      .mockResolvedValueOnce({ status: "authenticated", session: TEST_SESSION })
      .mockResolvedValueOnce({ status: "authenticated", session: TEST_SESSION });
    const port = authPort({
      loadSession,
      signOut: vi.fn().mockRejectedValue(new AuthPortFailure("network")),
    });
    const user = userEvent.setup();
    renderBarrier(port);
    await user.click(await screen.findByRole("button", { name: "테스트 로그아웃" }));

    expect(await screen.findByText(/로그아웃 요청을 완료하지 못했습니다/u)).toBeTruthy();
    expect(screen.getByText("인증된 제품")).toBeTruthy();
    expect(loadSession).toHaveBeenCalledTimes(2);
  });

  it("converges after a possibly-sent login loses its response", async () => {
    const loadSession = vi.fn()
      .mockResolvedValueOnce({ status: "unauthenticated" })
      .mockResolvedValueOnce({ status: "authenticated", session: TEST_SESSION });
    const port = authPort({
      loadSession,
      signIn: vi.fn().mockRejectedValue(new AuthPortFailure("network")),
    });
    const user = userEvent.setup();
    renderBarrier(port);
    await user.type(await screen.findByRole("textbox", { name: "이메일" }), "operator@example.com");
    await user.type(screen.getByLabelText("비밀번호"), "secret");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByText("인증된 제품")).toBeTruthy();
    expect(loadSession).toHaveBeenCalledTimes(2);
  });

  it("converges after a possibly-sent logout loses its response", async () => {
    const loadSession = vi.fn()
      .mockResolvedValueOnce({ status: "authenticated", session: TEST_SESSION })
      .mockResolvedValueOnce({ status: "unauthenticated" });
    const port = authPort({
      loadSession,
      signOut: vi.fn().mockRejectedValue(new AuthPortFailure("network")),
    });
    const user = userEvent.setup();
    renderBarrier(port);
    await user.click(await screen.findByRole("button", { name: "테스트 로그아웃" }));

    expect(await screen.findByRole("heading", { name: "KubeHeal에 로그인" })).toBeTruthy();
    expect(loadSession).toHaveBeenCalledTimes(2);
  });

  it("fails closed when reconciliation cannot establish session authority", async () => {
    const loadSession = vi.fn()
      .mockResolvedValueOnce({ status: "authenticated", session: TEST_SESSION })
      .mockRejectedValueOnce(new AuthPortFailure("server"));
    const port = authPort({
      loadSession,
      signOut: vi.fn().mockRejectedValue(new AuthPortFailure("network")),
    });
    const user = userEvent.setup();
    renderBarrier(port);
    await user.click(await screen.findByRole("button", { name: "테스트 로그아웃" }));

    expect(await screen.findByRole("heading", {
      level: 1,
      name: "검증된 응답을 읽지 못했습니다",
    })).toBeTruthy();
    expect(screen.queryByText("인증된 제품")).toBeNull();
  });

  it("aborts a pending reconciliation after unmount", async () => {
    const pending = deferred<AuthSessionResult>();
    let reconciliationSignal: AbortSignal | undefined;
    const loadSession = vi.fn()
      .mockResolvedValueOnce({ status: "authenticated", session: TEST_SESSION })
      .mockImplementationOnce((signal?: AbortSignal) => {
        reconciliationSignal = signal;
        return pending.promise;
      });
    const port = authPort({
      loadSession,
      signOut: vi.fn().mockRejectedValue(new AuthPortFailure("network")),
    });
    const user = userEvent.setup();
    const view = renderBarrier(port);
    await user.click(await screen.findByRole("button", { name: "테스트 로그아웃" }));
    await waitFor(() => expect(loadSession).toHaveBeenCalledTimes(2));

    view.unmount();
    expect(reconciliationSignal?.aborted).toBe(true);
  });

  it("routes simultaneous feature 401 events through one session recheck", async () => {
    const loadSession = vi.fn()
      .mockResolvedValueOnce({ status: "authenticated", session: TEST_SESSION })
      .mockResolvedValueOnce({ status: "unauthenticated" });
    const port = authPort({ loadSession });
    const user = userEvent.setup();
    renderBarrier(port);

    const unauthorized = await screen.findByRole("button", { name: "테스트 401 전달" });
    await user.click(unauthorized);
    await user.click(unauthorized);

    expect(await screen.findByRole("heading", { name: "KubeHeal에 로그인" })).toBeTruthy();
    expect(loadSession).toHaveBeenCalledTimes(2);
  });
});

function AuthenticatedProduct({ auth }: { auth: AuthenticatedAuthState }) {
  const { reportUnauthorized } = useAuthSessionGate();
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
      <button onClick={reportUnauthorized} type="button">테스트 401 전달</button>
    </main>
  );
}

function renderBarrier(port: AuthPort) {
  return render(
    <StrictMode>
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
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
    loadSession: vi.fn().mockResolvedValue({ status: "authenticated", session: TEST_SESSION }),
    signIn: vi.fn().mockResolvedValue(TEST_SESSION),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
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

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AuthenticatedAuthState,
  ProductSession,
  ProductWorkspaceList,
} from "../../../features/auth/authContract";
import { I18nProvider, type SupportedLocale } from "../../i18n";
import { SidebarProvider } from "../primitives/sidebar";
import { SidebarWorkspaceSwitcher } from "./SidebarWorkspaceSwitcher";

const SESSION: ProductSession = {
  authEnabled: true,
  authMode: "password",
  groups: [],
  logout: {
    action: "end_session",
    supported: true,
    reauthenticationExpected: false,
  },
  roles: ["user"],
  userId: "user-1",
  workspaceId: "workspace-a",
};

const CATALOG: ProductWorkspaceList = {
  currentWorkspaceId: "workspace-a",
  items: [
    { workspaceId: "workspace-a", name: "Alpha", slug: "alpha" },
    { workspaceId: "workspace-b", name: "Beta", slug: "beta" },
  ],
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

afterEach(cleanup);

describe("SidebarWorkspaceSwitcher", () => {
  it("exposes loading and an accessible English selection catalog", async () => {
    const catalog = deferred<ProductWorkspaceList>();
    renderSwitcher("en", vi.fn(() => catalog.promise));

    fireEvent.click(screen.getByRole("button", { name: "Current workspace: workspace-a" }));
    expect(screen.getByRole("status").textContent).toContain("Loading accessible workspaces");

    catalog.resolve(CATALOG);
    const list = await screen.findByRole("list", { name: "Workspace" });
    expect(list.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("button", { name: "Current workspace" }).getAttribute(
      "aria-current",
    )).toBe("true");
    expect(screen.getByRole("button", { name: "Switch to Beta" }).hasAttribute(
      "aria-current",
    )).toBe(false);
  });

  it("renders a localized Korean failure and retry action", async () => {
    renderSwitcher("ko", vi.fn().mockRejectedValue(new Error("private transport detail")));

    fireEvent.click(screen.getByRole("button", { name: "현재 워크스페이스: workspace-a" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "접근 가능한 워크스페이스를 불러오지 못했습니다.",
    );
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("private transport detail");
  });

  it("selects a non-current workspace once and marks the catalog busy", async () => {
    const switched = deferred<ProductSession>();
    const switchWorkspace = vi.fn(() => switched.promise);
    renderSwitcher("en", vi.fn().mockResolvedValue(CATALOG), switchWorkspace);
    fireEvent.click(screen.getByRole("button", { name: "Current workspace: workspace-a" }));
    const beta = await screen.findByRole("button", { name: "Switch to Beta" });

    fireEvent.click(beta);
    fireEvent.click(beta);

    expect(switchWorkspace).toHaveBeenCalledOnce();
    expect(switchWorkspace).toHaveBeenCalledWith("workspace-b");
    expect(screen.getByRole("list", { name: "Workspace" }).getAttribute("aria-busy")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Switching to Beta" })).toHaveProperty(
      "disabled",
      true,
    );

    switched.resolve({ ...SESSION, workspaceId: "workspace-b" });
    await waitFor(() => expect(screen.queryByRole("list", { name: "Workspace" })).toBeNull());
  });
});

function renderSwitcher(
  locale: SupportedLocale,
  listWorkspaces: AuthenticatedAuthState["listWorkspaces"],
  switchWorkspace: AuthenticatedAuthState["switchWorkspace"] = async () => {
    throw new Error("not used");
  },
) {
  const auth: AuthenticatedAuthState = {
    listWorkspaces,
    session: SESSION,
    signOutIssue: null,
    signOutPending: false,
    onSignOut: vi.fn(),
    switchWorkspace,
  };
  return render(
    <I18nProvider navigatorLanguage={locale} storage={null}>
      <SidebarProvider>
        <SidebarWorkspaceSwitcher auth={auth} />
      </SidebarProvider>
    </I18nProvider>,
  );
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

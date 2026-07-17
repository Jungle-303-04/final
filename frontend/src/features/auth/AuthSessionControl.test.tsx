// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../shared/i18n";
import type { AuthenticatedAuthState } from "./authContract";
import { AuthSessionControl } from "./AuthSessionControl";

afterEach(cleanup);

describe("AuthSessionControl", () => {
  it("keeps a toolbar sign-out issue outside normal layout while exposing it to assistive technology", () => {
    renderControl("toolbar");

    const alert = screen.getByRole("alert");
    const control = alert.parentElement;
    const signOut = screen.getByRole("button", { name: "Sign out" });

    expect(control?.className).toContain("relative");
    expect(alert.className).toContain("absolute");
    expect(alert.className).toContain("max-h-");
    expect(alert.textContent).toContain("A deliberately long diagnostic detail");
    expect(alert.id).not.toBe("");
    expect(signOut.getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("keeps the panel issue in normal flow", () => {
    renderControl("panel");

    const alert = screen.getByRole("alert");

    expect(alert.className).not.toContain("absolute");
  });
});

function renderControl(mode: "panel" | "toolbar") {
  const auth: AuthenticatedAuthState = {
    listWorkspaces: async () => ({
      currentWorkspaceId: "production-workspace-with-a-long-identifier",
      items: [],
    }),
    session: {
      authEnabled: true,
      authMode: "password",
      groups: [],
      logout: {
        action: "end_session",
        supported: true,
        reauthenticationExpected: false,
      },
      roles: ["viewer"],
      userId: "operator@example.com",
      workspaceId: "production-workspace-with-a-long-identifier",
    },
    signOutIssue: {
      code: "server",
      messageKey: "auth.logout.error.message",
      retryAfterSeconds: null,
      safeDetail: "A deliberately long diagnostic detail that must wrap without resizing the sticky toolbar.",
    },
    signOutPending: false,
    onSignOut: vi.fn(),
    switchWorkspace: async () => { throw new Error("not used"); },
  };

  return render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <AuthSessionControl auth={auth} mode={mode} />
    </I18nProvider>,
  );
}

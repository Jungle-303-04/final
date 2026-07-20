// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedAuthState } from "../features/auth/authContract";
import { I18nProvider } from "../shared/i18n";
import { ProductHeaderProfileMenu } from "./ProductHeaderProfileMenu";

afterEach(() => {
  cleanup();
});

describe("ProductHeaderProfileMenu auth semantics", () => {
  it("prevents a false sign-out claim when trusted proxy identity will be re-injected", () => {
    const onSignOut = vi.fn();
    const auth: AuthenticatedAuthState = {
      listWorkspaces: async () => ({ currentWorkspaceId: "default", items: [] }),
      session: {
        authEnabled: true,
        authMode: "trusted_proxy",
        groups: [],
        logout: {
          action: "upstream_identity_required",
          supported: false,
          reauthenticationExpected: true,
        },
        roles: ["service_admin"],
        userId: "operator-dev",
        workspaceId: "default",
      },
      signOutIssue: null,
      signOutPending: false,
      onSignOut,
      switchWorkspace: async () => { throw new Error("not used"); },
    };

    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter>
          <ProductHeaderProfileMenu
            auth={auth}
            settingsHref="/settings"
            utilities={(
              <>
                <span>Language</span>
                <span>Theme</span>
                <span>Help</span>
                <span>Diagnostics</span>
              </>
            )}
          />
        </MemoryRouter>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Open profile menu/u }));

    expect(screen.getByRole("group", { name: "Display and diagnostic tools" }).className)
      .toContain("gap-3");
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/managed by the trusted proxy/u)).not.toBeNull();
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it("uses a fixed circular account trigger and a viewport-bounded menu", () => {
    const auth: AuthenticatedAuthState = {
      listWorkspaces: async () => ({ currentWorkspaceId: "default", items: [] }),
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
        userId: "operator-with-a-deliberately-long-identity@example.com",
        workspaceId: "default",
      },
      signOutIssue: null,
      signOutPending: false,
      onSignOut: vi.fn(),
      switchWorkspace: async () => { throw new Error("not used"); },
    };

    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <MemoryRouter>
          <ProductHeaderProfileMenu
            auth={auth}
            settingsHref="/settings"
          />
        </MemoryRouter>
      </I18nProvider>,
    );

    const trigger = screen.getByRole("button", { name: /프로필 메뉴 열기/u });
    expect(trigger.className).toContain("rounded-full");
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "프로필" }).className).toContain(
      "max-w-[calc(100vw-1rem)]",
    );
  });
});

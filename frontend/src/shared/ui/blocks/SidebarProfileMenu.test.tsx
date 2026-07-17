// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedAuthState } from "../../../features/auth/authContract";
import { I18nProvider } from "../../i18n";
import { SidebarProvider } from "../primitives/sidebar";
import type { ProductThemeController } from "../useProductTheme";
import { SidebarProfileMenu } from "./SidebarProfileMenu";

const themeController: ProductThemeController = {
  isDark: false,
  selection: "light",
  select: vi.fn(),
  toggle: vi.fn(),
};

describe("SidebarProfileMenu auth semantics", () => {
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
          <SidebarProvider>
            <SidebarProfileMenu
              auth={auth}
              settingsHref="/settings"
              themeController={themeController}
            />
          </SidebarProvider>
        </MemoryRouter>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Open profile menu/u }));

    expect(screen.getByRole("button", { name: "Sign out" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/managed by the trusted proxy/u)).not.toBeNull();
    expect(onSignOut).not.toHaveBeenCalled();
  });
});

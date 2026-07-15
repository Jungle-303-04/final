import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ProductShell } from "./ProductShell";
import type { ProductSurfaceId } from "./productRoutes";
import type { AuthenticatedAuthState } from "../features/auth/authContract";
import { AuthSessionGateProvider } from "../features/auth/AuthSessionGate";
import { ClusterScopeProvider } from "../features/cluster-scope/ClusterScopeProvider";
import type { ClusterScopePort } from "../features/cluster-scope/clusterScopeContract";
import { UnifiedFilterProvider } from "../features/filters/UnifiedFilterProvider";
import { I18nProvider } from "../shared/i18n";

const testAuth: AuthenticatedAuthState = {
  session: { userId: "test-user", roles: ["viewer"], workspaceId: "test-workspace" },
  signOutIssue: null,
  signOutPending: false,
  onSignOut: () => undefined,
};
const testClusterScope: ClusterScopePort = {
  listClusterChoices: async () => ({ completeness: "unknown", clusters: [] }),
};

function TestShell(props: ComponentProps<typeof ProductShell>) {
  return (
    <AuthSessionGateProvider reportUnauthorized={() => undefined}>
      <UnifiedFilterProvider>
        <ClusterScopeProvider authorityKey="test-workspace:test-user" port={testClusterScope}>
          <ProductShell {...props} />
        </ClusterScopeProvider>
      </UnifiedFilterProvider>
    </AuthSessionGateProvider>
  );
}

describe("ProductShell", () => {
  it("renders only released surfaces and keeps the current route accessible", () => {
    const releasedSurfaceIds = new Set<ProductSurfaceId>(["home", "issues", "settings"]);
    const markup = renderToStaticMarkup(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter initialEntries={["/issues"]}>
          <Routes>
            <Route element={<TestShell auth={testAuth} releasedSurfaceIds={releasedSurfaceIds} />}>
              <Route path="/issues" element={<p>Issue content</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(markup).toContain("Home");
    expect(markup).toContain("Incidents");
    expect(markup).toContain("Settings");
    expect(markup).not.toContain("Timeline");
    expect(markup).not.toContain("Topology");
    expect(markup).not.toContain("workspace_id");
    expect(markup).toContain("Open profile menu for test-use…");
    expect(markup).toContain("Current workspace: test-workspace");
    expect(markup).toContain('aria-label="Current language: English"');
    expect(markup).toContain("test-user");
    expect(markup).toContain("overflow-x-hidden");
    expect(markup).toContain("data-horizontal:w-auto");
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('href="#product-main"');
    expect(markup).toContain("Issue content");
    expect(markup.match(/data-slot="unified-filter-bar"/gu)).toHaveLength(1);
  });

  it("never names an unreleased route while an unknown URL redirects", () => {
    const markup = renderToStaticMarkup(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter initialEntries={["/not-released"]}>
          <Routes>
            <Route element={<TestShell auth={testAuth} releasedSurfaceIds={new Set(["settings"])} />}>
              <Route path="*" element={<p>Redirecting</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(markup).toContain("Settings");
    expect(markup).not.toContain("Home");
  });

  it("names the collapsed control by the action it will perform", () => {
    const markup = renderToStaticMarkup(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route
              element={(
                <TestShell
                  auth={testAuth}
                  defaultSidebarCollapsed
                  releasedSurfaceIds={new Set(["home"])}
                />
              )}
            >
              <Route path="/" element={<p>Home content</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("Expand sidebar");
    expect(markup).not.toContain("Collapse sidebar");
  });

  it("renders Korean shell chrome when Korean is selected", () => {
    const markup = renderToStaticMarkup(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <MemoryRouter initialEntries={["/issues"]}>
          <Routes>
            <Route
              element={(
                <TestShell
                  auth={testAuth}
                  releasedSurfaceIds={new Set(["home", "issues"])}
                />
              )}
            >
              <Route path="/issues" element={<p>Issue content</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(markup).toContain("홈");
    expect(markup).toContain("인시던트");
    expect(markup).toContain("test-use… 프로필 메뉴 열기");
    expect(markup).toContain("워크스페이스");
    expect(markup).toContain("언어");
  });

  it("links the product brand to the released declarative landing route", () => {
    const markup = renderToStaticMarkup(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter initialEntries={["/issues?clusters=cluster-1"]}>
          <Routes>
            <Route
              element={(
                <TestShell
                  auth={testAuth}
                  releasedSurfaceIds={new Set(["home", "issues"])}
                />
              )}
            >
              <Route path="/issues" element={<p>Issue content</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(markup).toContain('aria-label="Go to Home"');
    expect(markup).toContain('href="/home?clusters=cluster-1"');
  });
});

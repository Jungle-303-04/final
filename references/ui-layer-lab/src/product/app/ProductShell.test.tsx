import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ProductShell } from "./ProductShell";
import type { ProductSurfaceId } from "./productRoutes";
import type { AuthenticatedAuthState } from "../features/auth/authContract";
import { I18nProvider } from "../shared/i18n";

const testAuth: AuthenticatedAuthState = {
  session: { userId: "test-user", roles: ["viewer"], workspaceId: "test-workspace" },
  signOutIssue: null,
  signOutPending: false,
  onSignOut: () => undefined,
};

describe("ProductShell", () => {
  it("renders only released surfaces and keeps the current route accessible", () => {
    const releasedSurfaceIds = new Set<ProductSurfaceId>(["home", "issues", "timeline"]);
    const markup = renderToStaticMarkup(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter initialEntries={["/product/issues"]}>
          <Routes>
            <Route element={<ProductShell auth={testAuth} releasedSurfaceIds={releasedSurfaceIds} />}>
              <Route path="/product/issues" element={<p>Issue content</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(markup).toContain("Home");
    expect(markup).toContain("Issues");
    expect(markup).toContain("Timeline");
    expect(markup).not.toContain("Topology");
    expect(markup).not.toContain("workspace_id");
    expect(markup).toContain("Sign out");
    expect(markup).toContain("Language");
    expect(markup).toContain("test-user");
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('href="#product-main"');
    expect(markup).toContain("Issue content");
  });

  it("never names an unreleased route while an unknown URL redirects", () => {
    const markup = renderToStaticMarkup(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter initialEntries={["/product/not-released"]}>
          <Routes>
            <Route element={<ProductShell auth={testAuth} releasedSurfaceIds={new Set(["timeline"])} />}>
              <Route path="*" element={<p>Redirecting</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(markup).toContain("Timeline");
    expect(markup).not.toContain("Home");
  });

  it("names the collapsed control by the action it will perform", () => {
    const markup = renderToStaticMarkup(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter initialEntries={["/product"]}>
          <Routes>
            <Route
              element={(
                <ProductShell
                  auth={testAuth}
                  defaultSidebarCollapsed
                  releasedSurfaceIds={new Set(["home"])}
                />
              )}
            >
              <Route path="/product" element={<p>Home content</p>} />
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
        <MemoryRouter initialEntries={["/product/issues"]}>
          <Routes>
            <Route
              element={(
                <ProductShell
                  auth={testAuth}
                  releasedSurfaceIds={new Set(["home", "issues"])}
                />
              )}
            >
              <Route path="/product/issues" element={<p>Issue content</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(markup).toContain("홈");
    expect(markup).toContain("인시던트");
    expect(markup).toContain("로그아웃");
    expect(markup).toContain("언어");
  });
});

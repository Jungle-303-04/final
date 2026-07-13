import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProductShell } from "../../src/product/app/ProductShell";
import { I18nProvider } from "../../src/product/shared/i18n";
import "../../src/product/styles/tokens.css";
import "../../src/product/styles/foundation.css";
import type { AuthenticatedAuthState } from "../../src/product/features/auth/authContract";
import { AuthSessionGateProvider } from "../../src/product/features/auth/AuthSessionGate";
import { ClusterScopeProvider } from "../../src/product/features/cluster-scope/ClusterScopeProvider";
import type { ClusterScopePort } from "../../src/product/features/cluster-scope/clusterScopeContract";
import { UnifiedFilterProvider } from "../../src/product/features/filters/UnifiedFilterProvider";

const root = document.getElementById("root");
if (!root) throw new Error("ProductShell visual harness root is missing");

const releasedSurfaceIds = new Set(["home", "issues", "catalog"] as const);
const testAuth: AuthenticatedAuthState = {
  session: { userId: "visual-user", roles: ["viewer"], workspaceId: "visual-workspace" },
  signOutIssue: null,
  signOutPending: false,
  onSignOut: () => undefined,
};
const testClusterScope: ClusterScopePort = {
  listClusterChoices: async () => ({
    completeness: "unknown",
    clusters: [{
      id: "cluster-1",
      workspaceId: "visual-workspace",
      name: "cluster-1",
      environment: "production",
      provider: "eks",
      connectionStage: "ready",
      registrationState: "active",
      connectionState: "online",
      lastObservedAt: "2026-07-13T00:00:00.000Z",
      nodeCount: 1,
      podCount: 1,
      incidentCount: 0,
    }],
  }),
};

createRoot(root).render(
  <StrictMode>
    <I18nProvider navigatorLanguage="ko" storage={null}>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        storageKey="kubeheal-theme"
        themes={["light", "dark"]}
      >
        <MemoryRouter initialEntries={["/product?clusters=cluster-1"]}>
          <AuthSessionGateProvider reportUnauthorized={() => undefined}>
            <UnifiedFilterProvider>
              <ClusterScopeProvider authorityKey="visual-workspace:visual-user" port={testClusterScope}>
                <Routes>
                  <Route element={<ProductShell auth={testAuth} releasedSurfaceIds={releasedSurfaceIds} />}>
                    <Route path="/product" element={<ShellOutletBoundary />} />
                    <Route path="/product/issues" element={<ShellOutletBoundary />} />
                    <Route path="/product/catalog" element={<ShellOutletBoundary />} />
                  </Route>
                </Routes>
              </ClusterScopeProvider>
            </UnifiedFilterProvider>
          </AuthSessionGateProvider>
        </MemoryRouter>
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
);

function ShellOutletBoundary() {
  return (
    <section
      aria-labelledby="shell-outlet-title"
      className="mx-auto grid w-full min-w-0 max-w-5xl gap-2 p-4 sm:p-6"
      data-shell-harness-outlet
    >
      <h2 className="min-w-0 break-all text-base font-semibold" id="shell-outlet-title">
        화면 본문 경계
      </h2>
      <p className="min-w-0 break-all text-sm text-muted-foreground">
        외부 데이터 없이 제품 셸의 탐색·레이아웃·포커스 계약만 검증합니다.
      </p>
    </section>
  );
}

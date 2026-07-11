import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProductShell } from "../../src/product/app/ProductShell";
import "../../src/product/styles/tokens.css";
import "../../src/product/styles/foundation.css";

const root = document.getElementById("root");
if (!root) throw new Error("ProductShell visual harness root is missing");

const releasedSurfaceIds = new Set(["home", "issues", "timeline"] as const);

createRoot(root).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="kubeheal-theme"
      themes={["light", "dark"]}
    >
      <MemoryRouter initialEntries={["/product"]}>
        <Routes>
          <Route element={<ProductShell releasedSurfaceIds={releasedSurfaceIds} />}>
            <Route path="/product" element={<ShellOutletBoundary />} />
            <Route path="/product/issues" element={<ShellOutletBoundary />} />
            <Route path="/product/timeline" element={<ShellOutletBoundary />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
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

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ProductShell } from "./ProductShell";
import type { ProductSurfaceId } from "./productRoutes";

describe("ProductShell", () => {
  it("renders only released surfaces and keeps the current route accessible", () => {
    const releasedSurfaceIds = new Set<ProductSurfaceId>(["home", "issues", "timeline"]);
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/product/issues"]}>
        <Routes>
          <Route element={<ProductShell releasedSurfaceIds={releasedSurfaceIds} />}>
            <Route path="/product/issues" element={<p>Issue content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(markup).toContain("Home");
    expect(markup).toContain("Issues");
    expect(markup).toContain("Timeline");
    expect(markup).not.toContain("Topology");
    expect(markup).not.toContain("workspace_id");
    expect(markup).not.toContain("로그아웃");
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('href="#product-main"');
    expect(markup).toContain("Issue content");
  });

  it("never names an unreleased route while an unknown URL redirects", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/product/not-released"]}>
        <Routes>
          <Route element={<ProductShell releasedSurfaceIds={new Set(["timeline"])} />}>
            <Route path="*" element={<p>Redirecting</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(markup).toContain("Timeline");
    expect(markup).not.toContain("Home");
  });

  it("names the collapsed control by the action it will perform", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/product"]}>
        <Routes>
          <Route
            element={(
              <ProductShell
                defaultSidebarCollapsed
                releasedSurfaceIds={new Set(["home"])}
              />
            )}
          >
            <Route path="/product" element={<p>Home content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("사이드바 펼치기");
    expect(markup).not.toContain("사이드바 접기");
  });
});

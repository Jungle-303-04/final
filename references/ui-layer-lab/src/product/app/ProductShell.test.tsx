import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ProductShell } from "./ProductShell";
import type { ProductCapabilityId } from "./productRoutes";

describe("ProductShell", () => {
  it("renders only registered capabilities and keeps the current route accessible", () => {
    const capabilities = new Set<ProductCapabilityId>(["home", "issues", "timeline"]);
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/product/issues"]}>
        <Routes>
          <Route element={<ProductShell availableCapabilities={capabilities} />}>
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
});

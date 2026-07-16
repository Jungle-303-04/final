// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PaneLoader } from "./pane-loader";

afterEach(cleanup);

describe("product-owned PaneLoader", () => {
  it("keeps the spinner centered while optional detail wraps below an owner-supplied label", () => {
    const { container } = render(
      <PaneLoader className="min-h-48" label="리소스를 불러오는 중">
        일부 클러스터의 최신 관측을 기다리고 있습니다.
      </PaneLoader>,
    );

    const loader = screen.getByRole("status");
    const spinner = container.querySelector<HTMLElement>('[data-slot="spinner"]');
    const label = screen.getByText("리소스를 불러오는 중");
    const detail = screen.getByText("일부 클러스터의 최신 관측을 기다리고 있습니다.");

    expect(loader.getAttribute("aria-live")).toBe("polite");
    expect(loader.className).toContain("min-h-48");
    expect(spinner?.getAttribute("aria-hidden")).toBe("true");
    expect(spinner?.getAttribute("class")).toContain("motion-reduce:animate-none");
    expect(label.className).toContain("whitespace-nowrap");
    expect(detail.className).toContain("whitespace-normal");
    expect(label.parentElement?.className).toContain("w-[min(24rem,calc(100vw-2rem))]");
  });
});

function assertPaneLoaderTypeContracts() {
  // @ts-expect-error a localized or owner-provided loading label is required
  void <PaneLoader />;
}

void assertPaneLoaderTypeContracts;

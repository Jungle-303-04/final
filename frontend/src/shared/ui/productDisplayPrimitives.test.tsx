// @vitest-environment jsdom

import { cleanup, render as renderBase, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { I18nProvider } from "../i18n";
import { Metric } from "./Metric";
import { StatusMark } from "./StatusMark";
import { Surface, SurfaceSection } from "./Surface";

afterEach(cleanup);

describe("product display primitives", () => {
  it("connects semantic surfaces to their visible headings", () => {
    const { rerender } = render(
      <Surface aria-labelledby="cluster-summary-title">
        <h2 id="cluster-summary-title">클러스터 요약</h2>
      </Surface>,
    );

    expect(screen.getByRole("region", { name: "클러스터 요약" })).toBeTruthy();

    rerender(
      <Surface as="div" data-testid="layout-surface">
        레이아웃 전용
      </Surface>,
    );
    expect(screen.getByTestId("layout-surface").getAttribute("role")).toBeNull();
  });

  it("keeps content surfaces flat and reserves elevation for explicit overlays", () => {
    const { rerender } = render(
      <Surface aria-label="평면 표면" data-testid="surface">
        <SurfaceSection data-testid="first-section">첫 구획</SurfaceSection>
        <SurfaceSection data-testid="second-section">둘째 구획</SurfaceSection>
      </Surface>,
    );

    const surface = screen.getByTestId("surface");
    expect(surface.getAttribute("data-elevation")).toBe("flat");
    expect(surface.className).not.toContain("shadow-sm");
    expect(surface.className).not.toContain("shadow-lg");
    expect(surface.className).toContain("[&_[data-slot=card]]:ring-0");
    expect(surface.className).toContain("[&_[data-slot=card]]:bg-transparent");
    expect(screen.getByTestId("first-section").className).toContain("first:border-t-0");
    expect(screen.getByTestId("second-section").className).not.toContain("bg-");
    expect(screen.getByTestId("second-section").className).not.toContain("rounded");
    expect(screen.getByTestId("second-section").className).not.toContain("shadow");

    rerender(
      <Surface aria-label="오버레이 표면" data-testid="surface" elevation="overlay">
        떠 있는 제어
      </Surface>,
    );
    expect(screen.getByTestId("surface").getAttribute("data-elevation")).toBe("overlay");
    expect(screen.getByTestId("surface").className).toContain("shadow-product-overlay");
  });

  it("fails fast when semantic surfaces have an empty accessible name", () => {
    expect(() => render(<Surface aria-label="   ">이름 없음</Surface>)).toThrow(
      "Semantic Surface requires one non-empty accessible name",
    );
  });

  it("renders unavailable separately from a real zero and preserves units", () => {
    const { rerender } = render(
      <Metric label="월간 비용" value={null} />,
    );

    expect(screen.getByText("사용할 수 없음")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();

    rerender(
      <Metric label="활성 이슈" note="현재 선택 범위" unit="건" value={0} />,
    );
    expect(screen.getByText("활성 이슈")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("건")).toBeTruthy();
    expect(screen.getByText("현재 선택 범위")).toBeTruthy();
  });

  it("always exposes a textual status and opts into polite announcements explicitly", () => {
    const { rerender } = render(<StatusMark tone="unknown" />);

    expect(screen.getByText("알 수 없음")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();

    rerender(<StatusMark label="연결 지연" live tone="warning" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("연결 지연");
    expect(status.getAttribute("data-status")).toBe("warning");
    expect(status.querySelector('[aria-hidden="true"]')?.className).toContain("forced-colors:border");
  });
});

function render(element: ReactElement) {
  return renderBase(element, {
    wrapper: ({ children }) => (
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        {children}
      </I18nProvider>
    ),
  });
}

function assertDisplayPrimitiveTypeContracts() {
  // @ts-expect-error semantic section surfaces require an accessible name
  void <Surface>이름 없는 section</Surface>;
  // @ts-expect-error semantic surfaces cannot erase their landmark semantics
  void <Surface aria-label="요약" role="none">숨겨진 section</Surface>;
  // @ts-expect-error semantic surfaces cannot be removed from the accessibility tree
  void <Surface aria-hidden aria-label="요약">숨겨진 section</Surface>;
  void <Surface as="div">레이아웃 전용 surface</Surface>;
  void <Surface aria-hidden as="div" role="presentation">장식용 layout surface</Surface>;
  // @ts-expect-error undefined is not an unavailable metric value
  void <Metric label="CPU" value={undefined} />;
  // @ts-expect-error provider-specific free-form tones are not canonical status tones
  void <StatusMark tone="provider-degraded" />;
}

void assertDisplayPrimitiveTypeContracts;

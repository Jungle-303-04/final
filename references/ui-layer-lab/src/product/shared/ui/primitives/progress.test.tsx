// @vitest-environment jsdom

import { cleanup, render as renderBase, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { I18nProvider } from "../../i18n";
import { Progress } from "./progress";

afterEach(cleanup);

describe("product Progress primitive", () => {
  it("renders a named determinate progressbar with semantic values and slots", () => {
    const { container } = render(
      <Progress aria-label="CPU 사용량" className="max-w-sm" value={42} />,
    );

    const progress = screen.getByRole("progressbar", { name: "CPU 사용량" });
    expect(progress.getAttribute("aria-valuemin")).toBe("0");
    expect(progress.getAttribute("aria-valuemax")).toBe("100");
    expect(progress.getAttribute("aria-valuenow")).toBe("42");
    expect(progress.getAttribute("aria-valuetext")).toContain("42");
    expect(progress.getAttribute("data-slot")).toBe("progress");
    expect(progress.className).toContain("w-full");
    expect(progress.className).toContain("max-w-sm");

    const track = container.querySelector('[data-slot="progress-track"]');
    const indicator = container.querySelector<HTMLElement>('[data-slot="progress-indicator"]');
    expect(track).toBeTruthy();
    expect(indicator?.style.width).toBe("42%");
  });

  it("uses labelledby and exposes an explicit human-readable value", () => {
    render(
      <>
        <span id="sync-progress-label">동기화 진행률</span>
        <Progress
          aria-labelledby="sync-progress-label"
          value={75}
          valueText="리소스 4개 중 3개 완료"
        />
      </>,
    );

    const progress = screen.getByRole("progressbar", { name: "동기화 진행률" });
    expect(progress.getAttribute("aria-valuetext")).toBe("리소스 4개 중 3개 완료");
  });

  it("preserves a meaningful decimal in the default accessible value", () => {
    render(<Progress aria-label="메모리 사용량" value={42.5} />);

    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toMatch(
      /42[.,]5\s?%/u,
    );
  });

  it("represents indeterminate progress without a false numeric value", () => {
    const { container } = render(
      <Progress aria-label="메트릭 수집" value={null} />,
    );

    const progress = screen.getByRole("progressbar", { name: "메트릭 수집" });
    expect(progress.hasAttribute("data-indeterminate")).toBe(true);
    expect(progress.getAttribute("aria-valuenow")).toBeNull();
    expect(progress.getAttribute("aria-valuetext")).toBe("진행 상태를 확인하는 중");
    expect(
      container.querySelector('[data-slot="progress-indicator"]')?.hasAttribute("data-indeterminate"),
    ).toBe(true);
    const indicator = container.querySelector<HTMLElement>('[data-slot="progress-indicator"]');
    expect(indicator?.className).toContain("data-indeterminate:w-1/3");
    expect(indicator?.className).toContain("data-indeterminate:border-dashed");
    expect(indicator?.className).toContain("data-indeterminate:motion-reduce:animate-none");
    expect(indicator?.className).toContain("motion-reduce:transition-none");
  });

  it.each([-0.01, 100.01, -12, 140])(
    "rejects out-of-range value %s instead of silently changing observations",
    (value) => {
      expect(() => render(<Progress aria-label="복구 진행률" value={value} />)).toThrow(
        "Progress value must be between 0 and 100",
      );
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite determinate value %s",
    (value) => {
      expect(() => render(<Progress aria-label="잘못된 진행률" value={value} />)).toThrow(
        "Progress value must be finite or null",
      );
    },
  );

  it("rejects blank accessible names and value text", () => {
    expect(() => render(<Progress aria-label="   " value={20} />)).toThrow(
      "Progress requires a non-empty accessible name",
    );
    expect(() => render(
      <Progress aria-label="배포" value={20} valueText="   " />,
    )).toThrow("Progress valueText must be non-empty when provided");
  });

  it("drops unsafe runtime attempts to replace semantics or internal structure", () => {
    const unsafeProps = {
      "aria-label": "안전한 진행률",
      "aria-hidden": true,
      "aria-valuemax": 999,
      children: "주입된 자식",
      dangerouslySetInnerHTML: { __html: "<span>주입된 HTML</span>" },
      max: 999,
      min: -999,
      role: "none",
      style: { display: "none" },
      value: 50,
    } as unknown as Parameters<typeof Progress>[0];

    const { container } = render(<Progress {...unsafeProps} />);

    const progress = screen.getByRole("progressbar", { name: "안전한 진행률" });
    expect(progress.getAttribute("aria-hidden")).toBeNull();
    expect(progress.getAttribute("aria-valuemin")).toBe("0");
    expect(progress.getAttribute("aria-valuemax")).toBe("100");
    expect(progress.getAttribute("style")).toBeNull();
    expect(container.textContent).not.toContain("주입된");
    expect(container.querySelector('[data-slot="progress-track"]')).toBeTruthy();
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

function assertProgressTypeContracts() {
  // @ts-expect-error progress bars require an accessible name
  void <Progress value={50} />;
  // @ts-expect-error choose aria-label or aria-labelledby, never both
  void <Progress aria-label="배포" aria-labelledby="deployment-label" value={50} />;
  // @ts-expect-error the product contract fixes progress to the 0-100 scale
  void <Progress aria-label="배포" max={200} value={50} />;
  // @ts-expect-error an accessible progressbar cannot be hidden from assistive technology
  void <Progress aria-hidden aria-label="배포" value={50} />;
  // @ts-expect-error internal progress structure cannot be replaced with raw HTML
  void <Progress aria-label="배포" dangerouslySetInnerHTML={{ __html: "unsafe" }} value={50} />;
}

void assertProgressTypeContracts;

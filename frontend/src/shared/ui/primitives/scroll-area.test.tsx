// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollArea } from "./scroll-area";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("product ScrollArea primitive", () => {
  it("keeps non-overflowing content named without adding an unnecessary tab stop", async () => {
    mockOverflow({ x: false, y: false });
    const { container } = render(
      <ScrollArea
        aria-label="활성 이슈"
        className="h-40 custom-scroll-area"
        orientation="vertical"
      >
        <div data-testid="scroll-content">스크롤 내용</div>
      </ScrollArea>,
    );

    const root = container.querySelector<HTMLElement>('[data-slot="scroll-area"]');
    const viewport = screen.getByRole("region", { name: "활성 이슈" });
    const content = container.querySelector<HTMLElement>('[data-slot="scroll-area-content"]');
    const payload = screen.getByTestId("scroll-content");

    expect(root).toBeTruthy();
    expect(root?.className).toContain("relative");
    expect(root?.className).toContain("overflow-hidden");
    expect(root?.className).toContain("custom-scroll-area");
    expect(root?.getAttribute("data-orientation")).toBe("vertical");
    expect(root?.getAttribute("aria-label")).toBeNull();
    expect(viewport.getAttribute("data-slot")).toBe("scroll-area-viewport");
    await waitFor(() => expect(viewport.tabIndex).toBe(-1));

    expect(content?.parentElement).toBe(viewport);
    expect(payload.parentElement).toBe(content);
    expect(Array.from(root?.children ?? [])).not.toContain(payload);

    const scrollbars = container.querySelectorAll('[data-slot="scroll-area-scrollbar"]');
    expect(scrollbars).toHaveLength(1);
    expect(scrollbars[0]?.getAttribute("data-orientation")).toBe("vertical");
    expect(scrollbars[0]?.hasAttribute("data-has-overflow-y")).toBe(false);
    expect(scrollbars[0]?.querySelector('[data-slot="scroll-area-thumb"]')).toBeTruthy();
  });

  it("makes the viewport keyboard-focusable only when the requested vertical axis overflows", async () => {
    mockOverflow({ x: false, y: true });
    const { container } = render(
      <ScrollArea aria-label="활성 이슈" orientation="vertical">
        <div>긴 이슈 목록</div>
      </ScrollArea>,
    );

    const viewport = screen.getByRole("region", { name: "활성 이슈" });
    const scrollbar = container.querySelector<HTMLElement>('[data-slot="scroll-area-scrollbar"]');
    await waitFor(() => {
      expect(viewport.tabIndex).toBe(0);
      expect(viewport.hasAttribute("data-has-overflow-y")).toBe(true);
      expect(scrollbar?.hasAttribute("data-has-overflow-y")).toBe(true);
    });
    viewport.focus();
    expect(document.activeElement).toBe(viewport);
  });

  it("supports aria-labelledby and renders only an overflowing horizontal axis", async () => {
    mockOverflow({ x: true, y: false });
    const { container } = render(
      <>
        <h2 id="history-title">배포 기록</h2>
        <ScrollArea aria-labelledby="history-title" orientation="horizontal">
          <div>긴 배포 기록</div>
        </ScrollArea>
      </>,
    );

    const viewport = screen.getByRole("region", { name: "배포 기록" });
    const scrollbar = container.querySelector<HTMLElement>(
      '[data-slot="scroll-area-scrollbar"]',
    );

    expect(viewport.getAttribute("aria-label")).toBeNull();
    expect(viewport.getAttribute("aria-labelledby")).toBe("history-title");
    expect(scrollbar?.getAttribute("data-orientation")).toBe("horizontal");
    expect(container.querySelectorAll('[data-slot="scroll-area-scrollbar"]')).toHaveLength(1);
    await waitFor(() => {
      expect(viewport.tabIndex).toBe(0);
      expect(viewport.hasAttribute("data-has-overflow-x")).toBe(true);
      expect(viewport.hasAttribute("data-has-overflow-y")).toBe(false);
      expect(scrollbar?.hasAttribute("data-has-overflow-x")).toBe(true);
    });
  });

  it("assembles both scrollbars and the Base UI corner for two-axis overflow", async () => {
    mockOverflow({ x: true, y: true });

    const { container } = render(
      <ScrollArea aria-label="리소스 행렬" orientation="both">
        <div>넓고 긴 리소스 행렬</div>
      </ScrollArea>,
    );

    const orientations = Array.from(
      container.querySelectorAll('[data-slot="scroll-area-scrollbar"]'),
      (element) => element.getAttribute("data-orientation"),
    );
    expect(orientations).toEqual(["vertical", "horizontal"]);

    await waitFor(() => {
      const viewport = screen.getByRole("region", { name: "리소스 행렬" });
      expect(viewport.hasAttribute("data-has-overflow-x")).toBe(true);
      expect(viewport.hasAttribute("data-has-overflow-y")).toBe(true);
      expect(container.querySelector('[data-slot="scroll-area-corner"]')).toBeTruthy();
    });
  });

  it("keeps overflowing scrollbars visible in standard, reduced-motion, and forced-color modes", () => {
    const { container } = render(
      <ScrollArea aria-label="감사 로그" orientation="vertical">
        <div>로그</div>
      </ScrollArea>,
    );

    const scrollbar = container.querySelector<HTMLElement>(
      '[data-slot="scroll-area-scrollbar"]',
    );
    const thumb = container.querySelector<HTMLElement>('[data-slot="scroll-area-thumb"]');

    expect(scrollbar?.className).toContain("bg-transparent");
    expect(scrollbar?.className).toContain("data-[has-overflow-y]:flex");
    expect(scrollbar?.className).toContain("motion-reduce:transition-none");
    expect(scrollbar?.className).toContain("forced-colors:border-current");
    expect(scrollbar?.className).toContain("forced-colors:bg-[Canvas]");
    expect(thumb?.className).toContain("bg-muted-foreground");
    expect(thumb?.className).toContain("forced-colors:bg-[ButtonText]");
  });

  it("rejects missing, conflicting, or blank accessible names at runtime", () => {
    expect(() => render(
      <ScrollArea
        {...({ orientation: "vertical" } as unknown as Parameters<typeof ScrollArea>[0])}
      />,
    )).toThrow("ScrollArea requires exactly one accessible name");

    expect(() => render(
      <ScrollArea
        {...({
          "aria-label": "이슈",
          "aria-labelledby": "issue-title",
          children: "내용",
          orientation: "vertical",
        } as unknown as Parameters<typeof ScrollArea>[0])}
      />,
    )).toThrow("ScrollArea requires exactly one accessible name");

    expect(() => render(
      <ScrollArea aria-label="   " orientation="vertical">
        내용
      </ScrollArea>,
    )).toThrow("ScrollArea accessible name must be non-empty");
  });

  it("rejects unsupported orientations at runtime", () => {
    expect(() => render(
      <ScrollArea
        {...({
          "aria-label": "이슈",
          children: "내용",
          orientation: "diagonal",
        } as unknown as Parameters<typeof ScrollArea>[0])}
      />,
    )).toThrow("ScrollArea orientation must be vertical, horizontal, or both");
  });

  it("drops unsafe runtime attempts to replace semantics or canonical slots", () => {
    const unsafeProps = {
      "aria-label": "안전한 로그",
      "data-orientation": "diagonal",
      "data-slot": "replaced-root",
      children: <span data-testid="safe-payload">보존할 내용</span>,
      dangerouslySetInnerHTML: { __html: "<p>주입된 HTML</p>" },
      orientation: "vertical",
      render: <section data-testid="replaced-element" />,
      role: "none",
      style: { display: "none" },
      tabIndex: -1,
    } as unknown as Parameters<typeof ScrollArea>[0];

    const { container } = render(<ScrollArea {...unsafeProps} />);
    const root = container.querySelector<HTMLElement>('[data-slot="scroll-area"]');
    const viewport = screen.getByRole("region", { name: "안전한 로그" });

    expect(root?.tagName).toBe("DIV");
    expect(root?.getAttribute("data-orientation")).toBe("vertical");
    expect(root?.getAttribute("role")).toBe("presentation");
    expect(root?.getAttribute("tabindex")).toBeNull();
    expect(root?.style.display).not.toBe("none");
    expect(screen.queryByTestId("replaced-element")).toBeNull();
    expect(container.textContent).not.toContain("주입된 HTML");
    expect(viewport.contains(screen.getByTestId("safe-payload"))).toBe(true);
  });
});

function mockOverflow({ x, y }: { x: boolean; y: boolean }) {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(100);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(y ? 200 : 100);
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(x ? 200 : 100);
}

function assertScrollAreaTypeContracts() {
  // @ts-expect-error scroll areas require an accessible name
  void <ScrollArea orientation="vertical">내용</ScrollArea>;
  // @ts-expect-error choose aria-label or aria-labelledby, never both
  void <ScrollArea aria-label="로그" aria-labelledby="log-title" orientation="vertical">내용</ScrollArea>;
  // @ts-expect-error orientation is required so the internal structure is deterministic
  void <ScrollArea aria-label="로그">내용</ScrollArea>;
  // @ts-expect-error only the three product orientations are supported
  void <ScrollArea aria-label="로그" orientation="diagonal">내용</ScrollArea>;
  // @ts-expect-error Base UI render composition cannot replace the product-owned root
  void <ScrollArea aria-label="로그" orientation="vertical" render={<section />}>내용</ScrollArea>;
  // @ts-expect-error raw HTML cannot bypass the canonical viewport/content structure
  void <ScrollArea aria-label="로그" dangerouslySetInnerHTML={{ __html: "unsafe" }} orientation="vertical">내용</ScrollArea>;
}

void assertScrollAreaTypeContracts;

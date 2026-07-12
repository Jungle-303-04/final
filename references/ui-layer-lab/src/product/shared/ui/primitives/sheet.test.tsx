// @vitest-environment jsdom

import { cleanup, render as renderBase, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { I18nProvider } from "../../i18n";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

afterEach(cleanup);

function ResourceSheet({
  contentClassName,
  closeLabel,
  showCloseButton = true,
  side = "right",
}: {
  contentClassName?: string;
  closeLabel?: string;
  showCloseButton?: boolean;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Sheet>
      <SheetTrigger>리소스 상세 열기</SheetTrigger>
      <SheetContent
        className={contentClassName}
        closeLabel={closeLabel}
        showCloseButton={showCloseButton}
        side={side}
      >
        <SheetHeader>
          <SheetTitle>Pod 상세</SheetTitle>
          <SheetDescription>선택한 Pod의 현재 상태입니다.</SheetDescription>
        </SheetHeader>
        <div>상세 내용</div>
        <SheetFooter>마지막 관측 정보</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

describe("product-owned Sheet", () => {
  it("opens a named modal, closes with Escape, and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(<ResourceSheet />);

    const trigger = screen.getByRole("button", { name: "리소스 상세 열기" });
    trigger.focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog", { name: "Pod 상세" });
    expect(dialog.textContent).toContain("상세 내용");
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByRole("button", { name: "닫기" })).toBeTruthy();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Pod 상세" })).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
  });

  it("uses the supplied close label and supports hiding the close action", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ResourceSheet closeLabel="상세 패널 닫기" />);

    await user.click(screen.getByRole("button", { name: "리소스 상세 열기" }));
    const close = await screen.findByRole("button", { name: "상세 패널 닫기" });
    await user.click(close);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    rerender(<ResourceSheet showCloseButton={false} />);
    await user.click(screen.getByRole("button", { name: "리소스 상세 열기" }));
    expect(await screen.findByRole("dialog", { name: "Pod 상세" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "닫기" })).toBeNull();
  });

  it("uses the full mobile viewport for lateral sheets and permits a product width override", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ResourceSheet />);

    await user.click(screen.getByRole("button", { name: "리소스 상세 열기" }));
    const content = await screen.findByRole("dialog", { name: "Pod 상세" });
    expect(content.className.split(" ")).toContain("w-full");
    expect(content.className).not.toContain("w-3/4");

    rerender(<ResourceSheet contentClassName="w-full max-w-none sm:max-w-none" />);
    expect(content.className.split(" ")).toContain("max-w-none");
    expect(content.className.split(" ")).toContain("sm:max-w-none");
    expect(content.className.split(" ")).not.toContain("sm:max-w-sm");
  });

  it("keeps canonical slots, side geometry, semantic colors, and accessibility fallbacks", async () => {
    const user = userEvent.setup();
    render(<ResourceSheet side="left" />);

    const trigger = screen.getByRole("button", { name: "리소스 상세 열기" });
    expect(trigger.getAttribute("data-slot")).toBe("sheet-trigger");
    await user.click(trigger);

    const content = await screen.findByRole("dialog", { name: "Pod 상세" });
    const overlay = document.querySelector<HTMLElement>('[data-slot="sheet-overlay"]');
    const closeIcon = screen
      .getByRole("button", { name: "닫기" })
      .querySelector("svg");

    expect(content.getAttribute("data-slot")).toBe("sheet-content");
    expect(content.getAttribute("data-side")).toBe("left");
    expect(content.className).toContain("bg-popover");
    expect(content.className).toContain("motion-reduce:transition-none");
    expect(content.className).toContain("forced-colors:border-[CanvasText]");
    expect(overlay?.className).toContain("bg-foreground/10");
    expect(overlay?.className).toContain("motion-reduce:transition-none");
    expect(overlay?.className).toContain("forced-colors:bg-[Canvas]");
    expect(closeIcon?.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector('[data-slot="sheet-header"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="sheet-title"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="sheet-description"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="sheet-footer"]')).toBeTruthy();
  });

  it("preserves canonical slot and side markers against unsafe runtime props", async () => {
    const user = userEvent.setup();
    const unsafeProps = {
      "data-side": "bottom",
      "data-slot": "replaced-sheet-content",
    } as unknown as Parameters<typeof SheetContent>[0];

    render(
      <Sheet>
        <SheetTrigger>열기</SheetTrigger>
        <SheetContent {...unsafeProps} side="left">
          <SheetTitle>보호된 패널</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    await user.click(screen.getByRole("button", { name: "열기" }));
    const dialog = await screen.findByRole("dialog", { name: "보호된 패널" });
    expect(dialog.getAttribute("data-slot")).toBe("sheet-content");
    expect(dialog.getAttribute("data-side")).toBe("left");
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

function assertSheetTypeContracts() {
  // @ts-expect-error only the four canonical sheet sides are supported
  void <SheetContent side="center">내용</SheetContent>;
  // @ts-expect-error canonical sheet slots are component-owned
  void <SheetTrigger data-slot="other">열기</SheetTrigger>;
  // @ts-expect-error canonical side markers are derived from the side prop
  void <SheetContent data-side="left">내용</SheetContent>;
  // @ts-expect-error popup slot markers are component-owned
  void <SheetContent data-slot="other">내용</SheetContent>;
  // @ts-expect-error structural slot markers are component-owned
  void <SheetHeader data-slot="other" />;
  // @ts-expect-error structural slot markers are component-owned
  void <SheetFooter data-slot="other" />;
}

void assertSheetTypeContracts;

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../shared/i18n";
import { BottomDockResizeHandle } from "./BottomDockResizeHandle";

let frame: FrameRequestCallback | null = null;

beforeEach(() => {
  frame = null;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    frame = callback;
    return 11;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BottomDockResizeHandle", () => {
  it("previews pointer movement once per animation frame and commits only the snapped pointerup height", () => {
    const onHeightChange = vi.fn();
    const { container } = renderHandle(onHeightChange);
    const dock = container.querySelector<HTMLElement>("[data-slot='bottom-dock']");
    const handle = screen.getByRole("separator", { name: "로그 독 높이 조절" });
    expect(dock).not.toBeNull();

    fireEvent.pointerDown(handle, { clientY: 700, pointerId: 1 });
    fireEvent.pointerMove(document, { clientY: 679, pointerId: 1 });
    fireEvent.pointerMove(document, { clientY: 669, pointerId: 1 });

    expect(onHeightChange).not.toHaveBeenCalled();
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(dock?.dataset.resizing).toBe("true");
    expect(dock?.style.getPropertyValue("--dock-height")).toBe("");

    frame?.(16);
    expect(dock?.style.getPropertyValue("--dock-height")).toBe("311px");

    fireEvent.pointerUp(document, { clientY: 669, pointerId: 1 });
    expect(onHeightChange).toHaveBeenCalledTimes(1);
    expect(onHeightChange).toHaveBeenCalledWith(320);
    expect(dock?.dataset.height).toBe("320");
    expect(dock?.dataset.resizing).toBe("true");

    frame?.(32);
    expect(dock?.dataset.resizing).toBeUndefined();
    expect(dock?.style.getPropertyValue("--dock-height")).toBe("");
  });

  it("retains separator keyboard semantics and the stepped height contract", () => {
    const onHeightChange = vi.fn();
    renderHandle(onHeightChange);
    const handle = screen.getByRole("separator", { name: "로그 독 높이 조절" });

    expect(handle.getAttribute("aria-valuemin")).toBe("160");
    expect(handle.getAttribute("aria-valuemax")).toBe("520");
    expect(handle.getAttribute("aria-valuenow")).toBe("280");

    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(onHeightChange).toHaveBeenCalledWith(300);
  });

  it("cleans a cancelled or unmounted preview without persisting a partial height", () => {
    const onHeightChange = vi.fn();
    const { container, unmount } = renderHandle(onHeightChange);
    const dock = container.querySelector<HTMLElement>("[data-slot='bottom-dock']");
    const handle = screen.getByRole("separator", { name: "로그 독 높이 조절" });

    fireEvent.pointerDown(handle, { clientY: 700, pointerId: 1 });
    fireEvent.pointerMove(document, { clientY: 669, pointerId: 1 });
    frame?.(16);
    fireEvent.pointerCancel(document, { clientY: 669, pointerId: 1 });

    expect(onHeightChange).not.toHaveBeenCalled();
    expect(dock?.dataset.resizing).toBeUndefined();
    expect(dock?.style.getPropertyValue("--dock-height")).toBe("");

    fireEvent.pointerDown(handle, { clientY: 700, pointerId: 2 });
    fireEvent.pointerMove(document, { clientY: 669, pointerId: 2 });
    unmount();

    expect(onHeightChange).not.toHaveBeenCalled();
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(11);
    expect(dock?.dataset.resizing).toBeUndefined();
    expect(dock?.style.getPropertyValue("--dock-height")).toBe("");
  });
});

function renderHandle(onHeightChange: (height: number) => void) {
  return render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <DockResizeFixture onHeightChange={onHeightChange} />
    </I18nProvider>,
  );
}

function DockResizeFixture({ onHeightChange }: { onHeightChange: (height: number) => void }) {
  const hostRef = useRef<HTMLElement>(null);
  return (
    <section
      className="motion-bottom-dock"
      data-height="280"
      data-slot="bottom-dock"
      ref={hostRef}
    >
      <BottomDockResizeHandle height={280} hostRef={hostRef} onHeightChange={onHeightChange} />
    </section>
  );
}
